const prisma = require('../db');
const logger = require('../../utils/logger');

const ENTITY_CONFIG = {
    payments: { model: 'payment', field: 'createdAt', defaultRetention: 90, softDelete: true },
    stockMovements: { model: 'stockMovement', field: 'createdAt', defaultRetention: 90 },
    simMovements: { model: 'simMovementLog', field: 'createdAt', defaultRetention: 90 },
    installments: { model: 'installment', field: 'dueDate', defaultRetention: 365 }
};

async function getRetentionDays(entityType) {
    const enabledParam = await prisma.globalParameter.findUnique({
        where: { key: `cleanup.${entityType}.enabled` }
    });
    if (enabledParam && enabledParam.value === 'false') return null;

    try {
        const param = await prisma.globalParameter.findUnique({
            where: { key: `cleanup.${entityType}.retentionDays` }
        });
        if (param) return parseInt(param.value);
    } catch (e) { /* ignore */ }

    return ENTITY_CONFIG[entityType]?.defaultRetention || 90;
}

async function runCleanup() {
    const results = {};
    let totalDeleted = 0;
    const startedAt = new Date();

    logger.info('[Cleanup] Starting scheduled cleanup...');

    for (const [entityType, config] of Object.entries(ENTITY_CONFIG)) {
        try {
            const retentionDays = await getRetentionDays(entityType);
            if (retentionDays === null) {
                results[entityType] = { status: 'DISABLED', reason: 'Cleanup disabled for this entity type' };
                continue;
            }

            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - retentionDays);

            const where = { [config.field]: { lt: cutoff } };
            const count = await prisma[config.model].count({ where });

            if (count === 0) {
                results[entityType] = { status: 'OK', deleted: 0, retentionDays, cutoff };
                continue;
            }

            await prisma[config.model].deleteMany({ where });
            totalDeleted += count;
            results[entityType] = { status: 'CLEANED', deleted: count, retentionDays, cutoff };
            logger.info(`[Cleanup] Deleted ${count} ${entityType} records older than ${retentionDays} days`);
        } catch (error) {
            logger.error(`[Cleanup] Failed to cleanup ${entityType}:`, error.message);
            results[entityType] = { status: 'FAILED', error: error.message };
        }
    }

    const duration = Date.now() - startedAt.getTime();
    logger.info(`[Cleanup] Completed in ${duration}ms. Total deleted: ${totalDeleted}`);

    await prisma.portalSyncLog.create({
        data: {
            branchCode: 'SYSTEM',
            branchName: 'System',
            type: 'CLEANUP',
            status: totalDeleted > 0 ? 'SUCCESS' : 'INFO',
            message: `Cleanup completed: ${totalDeleted} records deleted across ${Object.keys(results).length} entity types in ${duration}ms`,
            itemCount: totalDeleted,
            details: JSON.stringify(results).substring(0, 1000)
        }
    }).catch(() => {});

    return { totalDeleted, duration, results, completedAt: new Date() };
}

function scheduleDailyCleanup() {
    const now = new Date();
    const target = new Date();
    target.setHours(3, 0, 0, 0);

    if (now > target) {
        target.setDate(target.getDate() + 1);
    }

    const msUntilFirstRun = target.getTime() - now.getTime();
    const twentyFourHours = 24 * 60 * 60 * 1000;

    logger.info(`[Cleanup] Scheduled to run daily at 3:00 AM. First run in ${Math.round(msUntilFirstRun / 1000 / 60)} minutes.`);

    setTimeout(() => {
        runCleanup().catch(err => logger.error('[Cleanup] Scheduled cleanup failed:', err.message));

        setInterval(() => {
            runCleanup().catch(err => logger.error('[Cleanup] Scheduled cleanup failed:', err.message));
        }, twentyFourHours);
    }, msUntilFirstRun);
}

module.exports = { runCleanup, scheduleDailyCleanup, getRetentionDays };
