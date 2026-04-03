const express = require('express');
const router = express.Router();
const prisma = require('../../db');
const syncQueueService = require('../services/syncQueue.service');
const { adminAuth } = require('../middleware/auth');
const logger = require('../../utils/logger');
const validate = require('../middleware/validate');
const { requestSyncSchema, pushSchema, validateEntityArray, customerSchema, posMachineSchema, paymentItemSchema, maintenanceRequestSchema, warehouseMachineSchema, simCardSchema } = require('./sync.schema');

async function logPortalSync(branchId, branchCode, branchName, type, status, message, itemCount = 0, details = null) {
    try {
        await prisma.portalSyncLog.create({
            data: { branchId, branchCode, branchName, type, status, message, itemCount, details: details ? String(details).substring(0, 1000) : null }
        });
    } catch (e) { /* ignore */ }
}

async function updateBranchEntitySync(branchId, entityType, recordCount, status, errorMessage = null) {
    try {
        await prisma.branchEntitySync.upsert({
            where: { branchId_entityType: { branchId, entityType } },
            update: { lastSyncedAt: new Date(), recordCount, status, errorMessage },
            create: { branchId, entityType, lastSyncedAt: new Date(), recordCount, status, errorMessage }
        });
    } catch (e) { logger.error({ err: e.message }, `Failed to update entity sync for ${entityType}`); }
}

const branchAuth = async (req, res, next) => {
    const apiKey = req.headers['x-portal-sync-key'];
    const masterKey = process.env.PORTAL_API_KEY;

    if (!apiKey) {
        return res.status(401).json({ error: 'Branch API Key required' });
    }

    let branch = await prisma.branch.findFirst({ where: { apiKey } });

    if (!branch && apiKey === masterKey) {
        const branchCode = req.query.branchCode || req.body?.branchCode;
        if (branchCode) {
            branch = await prisma.branch.findFirst({ where: { code: branchCode } });
        }
    }

    if (!branch) {
        return res.status(401).json({ error: 'Invalid Branch API Key' });
    }

    await prisma.branch.update({
        where: { id: branch.id },
        data: { lastSeen: new Date(), status: 'ONLINE' }
    });

    req.branch = branch;
    next();
};

router.post('/request-sync', branchAuth, validate(requestSyncSchema), async (req, res) => {
    try {
        const { entities } = req.body || {};
        const result = {};

        if (!entities || entities.includes('branches')) {
            result.branches = await prisma.branch.findMany({ where: { isActive: true } });
        }

        if (!entities || entities.includes('users')) {
            result.users = await prisma.user.findMany({
                where: { isActive: true, branchId: req.branch.id }
            });
        }

        if (!entities || entities.includes('machineParameters')) {
            result.machineParameters = await prisma.machineParameter.findMany();
        }

        if (!entities || entities.includes('spareParts')) {
            result.masterSpareParts = await prisma.masterSparePart.findMany();
        }

        if (!entities || entities.includes('sparePartPriceLogs')) {
            result.sparePartPriceLogs = await prisma.sparePartPriceLog.findMany();
        }

        if (!entities || entities.includes('globalParameters')) {
            result.globalParameters = await prisma.globalParameter.findMany();
        }

        const totalItems = Object.values(result).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
        await logPortalSync(req.branch.id, req.branch.code, req.branch.name, 'PULL', 'SUCCESS', `${req.branch.code} pulled ${totalItems} master data items`, totalItems);

        res.json({ success: true, data: result });
    } catch (error) {
        logger.error('Branch sync request failed:', error);
        await logPortalSync(req.branch?.id, req.branch?.code, req.branch?.name, 'PULL', 'FAILED', 'Sync failed: ' + error.message);
        res.status(500).json({ success: false, error: 'فشل في المزامنة' });
    }
});

router.post('/push', branchAuth, validate(pushSchema), async (req, res) => {
    const branchId = req.branch.id;
    const { customers, posMachines, users, payments, maintenanceRequests, spareParts, warehouseMachines, simCards } = req.body;

    const stats = { customers: 0, posMachines: 0, users: 0, payments: 0, maintenanceRequests: 0, spareParts: 0, warehouseMachines: 0, simCards: 0 };
    const errors = [];

    const cleanEntity = (entity) => {
        if (!entity) return {};
        const { branch, customer, request, posMachine, payments, stockMovements, warehouseMachines, maintenanceApprovals, posMachines: pm, users: u, _deleted, ...cleanData } = entity;
        return cleanData;
    };

    try {
        if (customers && Array.isArray(customers)) {
            const validation = validateEntityArray(customers, customerSchema, 'customers');
            if (validation.errors.length > 0) errors.push(...validation.errors.map(e => `Customer[${e.index}]: ${e.errors.join(', ')}`));
            const ops = (validation.results || []).map(c => prisma.customer.upsert({
                where: { id: c.id },
                update: { ...c, branchId },
                create: { ...c, branchId }
            }));
            if (ops.length > 0) await prisma.$transaction(ops);
            stats.customers = ops.length;
        }

        if (posMachines && Array.isArray(posMachines)) {
            const ops = posMachines.map(m => {
                const data = cleanEntity(m);
                return prisma.posMachine.upsert({
                    where: { id: m.id },
                    update: { ...data, branchId },
                    create: { ...data, branchId }
                });
            });
            if (ops.length > 0) await prisma.$transaction(ops);
            stats.posMachines = ops.length;
        }

        if (users && Array.isArray(users)) {
            for (const user of users) {
                try {
                    if (user._deleted) {
                        await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
                    } else {
                        const data = cleanEntity(user);
                        await prisma.user.upsert({
                            where: { id: user.id },
                            update: { ...data, branchId },
                            create: { ...data, branchId }
                        });
                    }
                    stats.users++;
                } catch (e) {
                    errors.push(`User ${user.id}: ${e.message}`);
                }
            }
        }

        if (payments && Array.isArray(payments)) {
            const validation = validateEntityArray(payments, paymentItemSchema, 'payments');
            if (validation.errors.length > 0) errors.push(...validation.errors.map(e => `Payment[${e.index}]: ${e.errors.join(', ')}`));
            const ops = (validation.results || []).map(p => prisma.payment.upsert({
                where: { id: p.id },
                update: { ...p, branchId },
                create: { ...p, branchId }
            }));
            if (ops.length > 0) await prisma.$transaction(ops);
            stats.payments = ops.length;
        }

        if (maintenanceRequests && Array.isArray(maintenanceRequests)) {
            const validation = validateEntityArray(maintenanceRequests, maintenanceRequestSchema, 'maintenanceRequests');
            if (validation.errors.length > 0) errors.push(...validation.errors.map(e => `Request[${e.index}]: ${e.errors.join(', ')}`));
            const ops = (validation.results || []).map(r => {
                const data = cleanEntity(r);
                return prisma.maintenanceRequest.upsert({
                    where: { id: r.id },
                    update: { ...data, branchId },
                    create: { ...data, branchId }
                });
            });
            if (ops.length > 0) await prisma.$transaction(ops);
            stats.maintenanceRequests = ops.length;
        }

        if (spareParts && Array.isArray(spareParts)) {
            const ops = spareParts.map(item => prisma.branchSparePart.upsert({
                where: { branchId_partId: { branchId, partId: item.partId } },
                update: { quantity: item.quantity, lastUpdated: new Date() },
                create: { branchId, partId: item.partId, quantity: item.quantity }
            }));
            if (ops.length > 0) await prisma.$transaction(ops);
            stats.spareParts = ops.length;
        }

        if (warehouseMachines && Array.isArray(warehouseMachines)) {
            const validation = validateEntityArray(warehouseMachines, warehouseMachineSchema, 'warehouseMachines');
            if (validation.errors.length > 0) errors.push(...validation.errors.map(e => `WarehouseMachine[${e.index}]: ${e.errors.join(', ')}`));
            const ops = (validation.results || []).map(m => {
                const data = cleanEntity(m);
                return prisma.warehouseMachine.upsert({
                    where: { serialNumber: m.serialNumber },
                    update: { ...data, branchId },
                    create: { ...data, branchId }
                });
            });
            if (ops.length > 0) await prisma.$transaction(ops);
            stats.warehouseMachines = ops.length;
        }

        if (simCards && Array.isArray(simCards)) {
            const validation = validateEntityArray(simCards, simCardSchema, 'simCards');
            if (validation.errors.length > 0) errors.push(...validation.errors.map(e => `SimCard[${e.index}]: ${e.errors.join(', ')}`));
            const ops = (validation.results || []).map(s => {
                const data = cleanEntity(s);
                return prisma.simCard.upsert({
                    where: { id: s.id },
                    update: { ...data, branchId },
                    create: { ...data, branchId }
                });
            });
            if (ops.length > 0) await prisma.$transaction(ops);
            stats.simCards = ops.length;
        }

        const totalItems = Object.values(stats).reduce((a, b) => a + b, 0);
        const status = errors.length > 0 ? 'PARTIAL' : 'SUCCESS';

        await prisma.centralLog.create({
            data: {
                level: errors.length > 0 ? 'WARNING' : 'INFO',
                message: `Branch Data Push: ${totalItems} synced, ${errors.length} errors`,
                source: req.branch.code,
                context: JSON.stringify({ stats, errorCount: errors.length })
            }
        });

        const entityTypes = ['customers', 'posMachines', 'users', 'payments', 'maintenanceRequests', 'spareParts', 'warehouseMachines', 'simCards'];
        for (const entityType of entityTypes) {
            if (stats[entityType] > 0) {
                await updateBranchEntitySync(branchId, entityType, stats[entityType], status, errors.length > 0 ? `${errors.length} errors` : null);
            }
        }

        await logPortalSync(
            req.branch.id, req.branch.code, req.branch.name,
            'PUSH', status,
            `${req.branch.code} pushed ${totalItems} items (${errors.length} errors)`,
            totalItems,
            errors.length > 0 ? errors.slice(0, 10).join('\n') : null
        );

        res.json({ message: 'Sync process completed', stats, success: errors.length === 0, errorCount: errors.length });
    } catch (error) {
        logger.error('Fatal Push sync failure:', error);
        await logPortalSync(req.branch?.id, req.branch?.code, req.branch?.name, 'PUSH', 'FAILED', 'Fatal push error: ' + error.message);
        res.status(500).json({ error: 'فشل في إرسال البيانات' });
    }
});

router.post('/request-full-sync/:branchId', adminAuth, async (req, res) => {
    try {
        const { branchId } = req.params;
        const branch = await prisma.branch.findUnique({ where: { id: branchId } });
        if (!branch) return res.status(404).json({ error: 'Branch not found' });

        await syncQueueService.enqueueUpdate('SYSTEM_DIRECTIVE', 'REQUEST_FULL_SYNC', { branchId });
        res.json({ message: 'Full sync requested successfully via WebSockets' });
    } catch (error) {
        logger.error('Failed to request full sync:', error);
        res.status(500).json({ error: 'Failed to request sync' });
    }
});

router.post('/request-report-sync/:branchId', adminAuth, async (req, res) => {
    try {
        const { branchId } = req.params;
        const branch = await prisma.branch.findUnique({ where: { id: branchId } });
        if (!branch) return res.status(404).json({ error: 'Branch not found' });

        await syncQueueService.enqueueUpdate('SYSTEM_DIRECTIVE', 'REQUEST_REPORT_DATA', { branchId });
        res.json({ message: 'Report sync requested successfully via WebSockets' });
    } catch (error) {
        logger.error('Failed to request report sync:', error);
        res.status(500).json({ error: 'Failed to request report sync' });
    }
});

router.get('/status', adminAuth, async (req, res) => {
    try {
        const branches = await prisma.branch.findMany({
            where: { isActive: true },
            select: { id: true, code: true, name: true, status: true, lastSeen: true, url: true }
        });

        const entitySyncs = await prisma.branchEntitySync.findMany({
            where: { branchId: { in: branches.map(b => b.id) } }
        });

        const result = branches.map(branch => {
            const branchEntitySyncs = entitySyncs.filter(e => e.branchId === branch.id);
            const entityMap = {};
            branchEntitySyncs.forEach(e => {
                entityMap[e.entityType] = {
                    lastSyncedAt: e.lastSyncedAt,
                    recordCount: e.recordCount,
                    status: e.status,
                    errorMessage: e.errorMessage
                };
            });

            return {
                id: branch.id,
                code: branch.code,
                name: branch.name,
                status: branch.status,
                lastSeen: branch.lastSeen,
                url: branch.url,
                entitySync: entityMap
            };
        });

        res.json({ success: true, branches: result, total: result.length });
    } catch (error) {
        logger.error('Failed to get sync status:', error);
        res.status(500).json({ error: 'Failed to get sync status' });
    }
});

router.get('/status/:branchId', adminAuth, async (req, res) => {
    try {
        const branch = await prisma.branch.findUnique({
            where: { id: req.params.branchId },
            select: { id: true, code: true, name: true, status: true, lastSeen: true, url: true }
        });
        if (!branch) return res.status(404).json({ error: 'Branch not found' });

        const entitySyncs = await prisma.branchEntitySync.findMany({
            where: { branchId: branch.id },
            orderBy: { lastSyncedAt: 'desc' }
        });

        const entityMap = {};
        entitySyncs.forEach(e => {
            entityMap[e.entityType] = {
                lastSyncedAt: e.lastSyncedAt,
                recordCount: e.recordCount,
                status: e.status,
                errorMessage: e.errorMessage,
                updatedAt: e.updatedAt
            };
        });

        const recentLogs = await prisma.portalSyncLog.findMany({
            where: { branchId: branch.id },
            orderBy: { createdAt: 'desc' },
            take: 20
        });

        res.json({ success: true, branch, entitySync: entityMap, recentLogs });
    } catch (error) {
        logger.error('Failed to get branch sync status:', error);
        res.status(500).json({ error: 'Failed to get branch sync status' });
    }
});

router.get('/cleanup-policy', adminAuth, async (req, res) => {
    try {
        const defaults = {
            payments: { retentionDays: 90, enabled: true, description: 'Payment records' },
            sales: { retentionDays: 90, enabled: true, description: 'Machine sales' },
            maintenanceRequests: { retentionDays: 180, enabled: true, description: 'Maintenance requests' },
            stockMovements: { retentionDays: 90, enabled: true, description: 'Stock movements' },
            machineSales: { retentionDays: 90, enabled: true, description: 'Machine sales' },
            installments: { retentionDays: 365, enabled: true, description: 'Installment records' },
            simMovements: { retentionDays: 90, enabled: true, description: 'SIM movement logs' },
            customers: { retentionDays: 365, enabled: true, description: 'Customer records' }
        };

        const params = await prisma.globalParameter.findMany({
            where: { key: { startsWith: 'cleanup.' } }
        });

        const overrides = {};
        params.forEach(p => {
            const match = p.key.match(/^cleanup\.(\w+)\.(retentionDays|enabled)$/);
            if (match) {
                const [, entityType, field] = match;
                if (!overrides[entityType]) overrides[entityType] = {};
                overrides[entityType][field] = field === 'enabled' ? p.value === 'true' : parseInt(p.value);
            }
        });

        const policy = Object.entries(defaults).map(([entityType, def]) => ({
            entityType,
            ...def,
            ...(overrides[entityType] || {})
        }));

        res.json({ success: true, policy });
    } catch (error) {
        logger.error('Failed to get cleanup policy:', error);
        res.status(500).json({ error: 'Failed to get cleanup policy' });
    }
});

router.put('/cleanup-policy/:entityType', adminAuth, async (req, res) => {
    try {
        const { entityType } = req.params;
        const { retentionDays, enabled } = req.body;

        if (retentionDays !== undefined) {
            await prisma.globalParameter.upsert({
                where: { key: `cleanup.${entityType}.retentionDays` },
                update: { value: String(retentionDays) },
                create: { key: `cleanup.${entityType}.retentionDays`, value: String(retentionDays) }
            });
        }

        if (enabled !== undefined) {
            await prisma.globalParameter.upsert({
                where: { key: `cleanup.${entityType}.enabled` },
                update: { value: String(enabled) },
                create: { key: `cleanup.${entityType}.enabled`, value: String(enabled) }
            });
        }

        res.json({ success: true, message: `Cleanup policy updated for ${entityType}` });
    } catch (error) {
        logger.error('Failed to update cleanup policy:', error);
        res.status(500).json({ error: 'Failed to update cleanup policy' });
    }
});

router.post('/cleanup/run', adminAuth, async (req, res) => {
    try {
        const cleanupService = require('../services/cleanup.service');
        const result = await cleanupService.runCleanup();
        res.json({ success: true, ...result });
    } catch (error) {
        logger.error('Failed to run cleanup:', error);
        res.status(500).json({ error: 'Failed to run cleanup' });
    }
});

router.get('/logs', adminAuth, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        const type = req.query.type || '';
        const branchId = req.query.branchId || '';
        const status = req.query.status || '';
        const startDate = req.query.startDate || '';
        const endDate = req.query.endDate || '';

        const where = {};
        if (type) where.type = type;
        if (branchId) where.branchId = branchId;
        if (status) where.status = status;
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                where.createdAt.lte = end;
            }
        }

        const [logs, total] = await Promise.all([
            prisma.portalSyncLog.findMany({
                where,
                include: { branch: { select: { id: true, code: true, name: true } } },
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip: offset
            }),
            prisma.portalSyncLog.count({ where })
        ]);

        res.json({ data: logs, pagination: { total, limit, offset, pages: Math.ceil(total / limit) } });
    } catch (error) {
        logger.error('Failed to get sync logs:', error);
        res.status(500).json({ error: 'فشل في جلب سجلات المزامنة' });
    }
});

router.get('/queue', adminAuth, async (req, res) => {
    try {
        const status = req.query.status || 'PENDING';
        const branchId = req.query.branchId || '';

        const where = {};
        if (status) where.status = status;
        if (branchId) where.branchId = branchId;

        const queue = await prisma.syncQueue.findMany({
            where,
            include: { branch: { select: { id: true, code: true, name: true } } },
            orderBy: { createdAt: 'desc' },
            take: 200
        });

        const total = await prisma.syncQueue.count({ where });
        res.json({ success: true, queue, total });
    } catch (error) {
        logger.error('Failed to get sync queue:', error);
        res.status(500).json({ error: 'Failed to get sync queue' });
    }
});

module.exports = router;
