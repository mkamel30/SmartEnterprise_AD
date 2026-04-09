const express = require('express');
const router = express.Router();
const prisma = require('../../db');
const syncQueueService = require('../services/syncQueue.service');
const { adminAuth } = require('../middleware/auth');
const logger = require('../../utils/logger');
const validate = require('../middleware/validate');
const { requestSyncSchema, pushSchema, validateEntityArray, customerSchema, posMachineSchema, paymentItemSchema, maintenanceRequestSchema, warehouseMachineSchema, simCardSchema, usedPartLogSchema } = require('./sync.schema');

let io = null;
router.setIo = (socketIo) => { io = socketIo; };

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

async function ensureCustomerExists(customerId, customerName, customerBkcode, branchId) {
    if (!customerId) return;
    try {
        let finalBkcode = customerBkcode || `AUTO-${customerId.substring(0, 8)}`;
        const hasRealData = customerName && customerName !== 'غير معروف (تلقائي)';
        
        await prisma.customer.upsert({
            where: { id: customerId },
            update: hasRealData ? {
                client_name: customerName,
                bkcode: customerBkcode || undefined,
                status: 'SYNCED'
            } : {
                status: 'AUTO_SYNC'
            },
            create: {
                id: customerId,
                client_name: customerName || 'غير معروف (تلقائي)',
                bkcode: finalBkcode,
                branchId: branchId,
                status: hasRealData ? 'SYNCED' : 'AUTO_SYNC'
            }
        });
    } catch (e) {
        if (e.code === 'P2002' && e.meta?.target?.includes('bkcode')) {
            try {
                await prisma.customer.upsert({
                    where: { id: customerId },
                    update: hasRealData ? { client_name: customerName } : {},
                    create: {
                        id: customerId,
                        client_name: customerName || 'غير معروف (تلقائي)',
                        bkcode: `AUTO-${customerId.substring(0, 8)}-${Date.now()}`,
                        branchId: branchId,
                        status: 'AUTO_SYNC'
                    }
                });
            } catch (e2) {
                logger.error(`[Sync] Failed to create customer ${customerId} even with unique bkcode: ${e2.message}`);
            }
        } else {
            logger.error(`[Sync] Failed to ensure customer ${customerId}: ${e.message}`);
        }
    }
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
    const { customers, posMachines, users, payments, maintenanceRequests, spareParts, warehouseMachines, simCards, stockMovements, machineSales, installments, simMovements, warehouseSims, usedPartLogs } = req.body;

    const stats = { customers: 0, posMachines: 0, users: 0, payments: 0, maintenanceRequests: 0, spareParts: 0, warehouseMachines: 0, simCards: 0, stockMovements: 0, machineSales: 0, installments: 0, simMovements: 0, warehouseSims: 0, usedPartLogs: 0 };
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
            
            for (const p of (validation.results || [])) {
                try {
                    if (p.customerId) await ensureCustomerExists(p.customerId, p.customerName, null, branchId);
                    await prisma.payment.upsert({
                        where: { id: p.id },
                        update: { ...p, branchId },
                        create: { ...p, branchId }
                    });
                    stats.payments++;
                } catch (e) {
                    errors.push(`Payment ${p.id}: ${e.message}`);
                }
            }
        }

        if (maintenanceRequests && Array.isArray(maintenanceRequests)) {
            const validation = validateEntityArray(maintenanceRequests, maintenanceRequestSchema, 'maintenanceRequests');
            if (validation.errors.length > 0) errors.push(...validation.errors.map(e => `Request[${e.index}]: ${e.errors.join(', ')}`));
            
            for (const r of (validation.results || [])) {
                try {
                    if (r.customerId) await ensureCustomerExists(r.customerId, r.customerName, r.customerBkcode, branchId);
                    const data = cleanEntity(r);
                    await prisma.maintenanceRequest.upsert({
                        where: { id: r.id },
                        update: { ...data, branchId },
                        create: { ...data, branchId }
                    });
                    stats.maintenanceRequests++;
                } catch (e) {
                    errors.push(`Request ${r.id}: ${e.message}`);
                }
            }
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

        if (stockMovements && Array.isArray(stockMovements)) {
            // Snapshot strategy: DELETE old records for this branch, then INSERT fresh data
            try {
                await prisma.$transaction(async (tx) => {
                    await tx.stockMovement.deleteMany({ where: { branchId } });
                    for (const m of stockMovements) {
                        const data = cleanEntity(m);
                        await tx.stockMovement.create({ data: { ...data, branchId } });
                    }
                });
                stats.stockMovements = stockMovements.length;
            } catch (e) {
                errors.push(`StockMovements snapshot: ${e.message}`);
            }
        }

        if (machineSales && Array.isArray(machineSales)) {
            const validation = validateEntityArray(machineSales, machineSaleSchema, 'machineSales');
            if (validation.errors.length > 0) errors.push(...validation.errors.map(e => `MachineSale[${e.index}]: ${e.errors.join(', ')}`));
            
            for (const s of (validation.results || [])) {
                try {
                    // MachineSales don't often carry customerName in the object, but we check if provided
                    if (s.customerId) await ensureCustomerExists(s.customerId, s.customerName, s.customerBkcode, branchId);
                    const data = cleanEntity(s);
                    await prisma.machineSale.upsert({
                        where: { id: s.id },
                        update: { ...data, branchId },
                        create: { ...data, branchId }
                    });
                    stats.machineSales++;
                } catch (e) {
                    errors.push(`Sale ${s.id}: ${e.message}`);
                }
            }
        }

        if (installments && Array.isArray(installments)) {
            const validation = validateEntityArray(installments, installmentSchema, 'installments');
            if (validation.errors.length > 0) errors.push(...validation.errors.map(e => `Installment[${e.index}]: ${e.errors.join(', ')}`));
            const ops = (validation.results || []).map(i => {
                const data = cleanEntity(i);
                return prisma.installment.upsert({
                    where: { id: i.id },
                    update: { ...data, branchId },
                    create: { ...data, branchId }
                });
            });
            if (ops.length > 0) await prisma.$transaction(ops);
            stats.installments = ops.length;
        }

        if (simMovements && Array.isArray(simMovements)) {
            // Snapshot strategy: DELETE old records for this branch, then INSERT fresh data
            try {
                await prisma.$transaction(async (tx) => {
                    await tx.simMovementLog.deleteMany({ where: { branchId } });
                    for (const m of simMovements) {
                        const data = cleanEntity(m);
                        await tx.simMovementLog.create({ data: { ...data, branchId } });
                    }
                });
                stats.simMovements = simMovements.length;
            } catch (e) {
                errors.push(`SimMovements snapshot: ${e.message}`);
            }
        }

        if (warehouseSims && Array.isArray(warehouseSims)) {
            const validation = validateEntityArray(warehouseSims, warehouseSimSchema, 'warehouseSims');
            if (validation.errors.length > 0) errors.push(...validation.errors.map(e => `WarehouseSim[${e.index}]: ${e.errors.join(', ')}`));
            const ops = (validation.results || []).map(s => {
                const data = cleanEntity(s);
                return prisma.warehouseSim.upsert({
                    where: { serialNumber: s.serialNumber },
                    update: { ...data, branchId },
                    create: { ...data, branchId }
                });
            });
            if (ops.length > 0) await prisma.$transaction(ops);
            stats.warehouseSims = ops.length;
        }

        if (usedPartLogs && Array.isArray(usedPartLogs)) {
            // Snapshot strategy: DELETE old records for this branch, then INSERT fresh data
            try {
                await prisma.$transaction(async (tx) => {
                    await tx.usedPartLog.deleteMany({ where: { branchId } });
                    for (const log of usedPartLogs) {
                        if (log.customerId) await ensureCustomerExists(log.customerId, log.customerName, log.customerBkcode, branchId);
                        const data = cleanEntity(log);
                        await tx.usedPartLog.create({ data: { ...data, branchId } });
                    }
                });
                stats.usedPartLogs = usedPartLogs.length;
            } catch (e) {
                errors.push(`UsedPartLogs snapshot: ${e.message}`);
            }
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

        const entityTypes = ['customers', 'posMachines', 'users', 'payments', 'maintenanceRequests', 'spareParts', 'warehouseMachines', 'simCards', 'stockMovements', 'machineSales', 'installments', 'simMovements', 'warehouseSims', 'usedPartLogs'];
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

        if (branch.status !== 'ONLINE') {
            return res.status(200).json({ success: false, error: 'Branch is offline. Cannot request sync.' });
        }

        if (io) {
            io.to(`branch_${branchId}`).emit('SYSTEM_DIRECTIVE', { action: 'REQUEST_FULL_SYNC', branchId });
            logger.info(`[Sync] Sent REQUEST_FULL_SYNC to branch ${branch.code}`);
        }

        await logPortalSync(branch.id, branch.code, branch.name, 'PULL', 'SUCCESS', `Requested full sync from ${branch.code}`);
        res.json({ message: 'Full sync requested successfully', branch: { code: branch.code, name: branch.name } });
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

        if (branch.status !== 'ONLINE') {
            return res.status(200).json({ success: false, error: 'Branch is offline. Cannot request report sync.' });
        }

        if (io) {
            io.to(`branch_${branchId}`).emit('SYSTEM_DIRECTIVE', { action: 'REQUEST_REPORT_DATA', branchId });
            logger.info(`[Sync] Sent REQUEST_REPORT_DATA to branch ${branch.code}`);
        }

        await logPortalSync(branch.id, branch.code, branch.name, 'PULL', 'SUCCESS', `Requested report sync from ${branch.code}`);
        res.json({ message: 'Report sync requested successfully', branch: { code: branch.code, name: branch.name } });
    } catch (error) {
        logger.error('Failed to request report sync:', error);
        res.status(500).json({ error: 'Failed to request report sync' });
    }
});

router.post('/request-all-report-sync', adminAuth, async (req, res) => {
    try {
        const branches = await prisma.branch.findMany({ where: { isActive: true } });
        const results = [];

        for (const branch of branches) {
            if (branch.status === 'ONLINE' && io) {
                io.to(`branch_${branch.id}`).emit('SYSTEM_DIRECTIVE', { action: 'REQUEST_REPORT_DATA', branchId: branch.id });
                results.push({ branchId: branch.id, code: branch.code, name: branch.name, status: 'REQUESTED' });
                logger.info(`[Sync] Sent REQUEST_REPORT_DATA to branch ${branch.code}`);
            } else {
                results.push({ branchId: branch.id, code: branch.code, name: branch.name, status: branch.status === 'ONLINE' ? 'NO_SOCKET' : 'OFFLINE' });
            }
        }

        await logPortalSync(null, 'SYSTEM', 'System', 'PULL', 'SUCCESS', `Requested report sync from all ${branches.length} branches`);
        res.json({ message: 'Report sync requested from all branches', results });
    } catch (error) {
        logger.error('Failed to request all report sync:', error);
        res.status(500).json({ error: 'Failed to request report sync' });
    }
});

// Request monthly closing from a specific branch
router.post('/request-monthly-closing/:branchId', adminAuth, async (req, res) => {
    try {
        const { branchId } = req.params;
        const { month, sections } = req.body;

        if (!month) {
            return res.status(400).json({ error: 'Month is required (YYYY-MM)' });
        }

        const branch = await prisma.branch.findUnique({ where: { id: branchId } });
        if (!branch) {
            return res.status(404).json({ error: 'Branch not found' });
        }

        if (branch.status !== 'ONLINE') {
            return res.status(200).json({ success: false, error: 'Branch is offline' });
        }

        const sectionsToRequest = sections || 'all';
        const syncMode = branch.reportSyncMode || 'PULL';
        const action = syncMode === 'REQUEST' ? 'REQUEST_MONTHLY_CLOSING' : 'PULL_MONTHLY_CLOSING';

        if (io) {
            io.to(`branch_${branchId}`).emit('SYSTEM_DIRECTIVE', {
                action,
                branchId,
                month,
                sections: sectionsToRequest
            });
            logger.info(`[Sync] Sent ${action} to branch ${branch.code} for month ${month} (mode: ${syncMode})`);
        }

        await logPortalSync(branch.id, branch.code, branch.name, 'PULL', 'SUCCESS', `Requested monthly closing for ${month} from ${branch.code} (mode: ${syncMode})`);
        res.json({ success: true, message: `Monthly closing requested (${syncMode} mode)`, mode: syncMode, branch: { code: branch.code, name: branch.name } });
    } catch (error) {
        logger.error('Failed to request monthly closing:', error);
        res.status(500).json({ error: 'Failed to request monthly closing' });
    }
});

// Request monthly closing from all online branches
router.post('/request-all-monthly-closing', adminAuth, async (req, res) => {
    try {
        const { month, sections } = req.body;

        if (!month) {
            return res.status(400).json({ error: 'Month is required (YYYY-MM)' });
        }

        const branches = await prisma.branch.findMany({ where: { isActive: true } });
        const results = [];
        const sectionsToRequest = sections || 'all';

        for (const branch of branches) {
            const syncMode = branch.reportSyncMode || 'PULL';
            const action = syncMode === 'REQUEST' ? 'REQUEST_MONTHLY_CLOSING' : 'PULL_MONTHLY_CLOSING';

            if (branch.status === 'ONLINE' && io) {
                io.to(`branch_${branch.id}`).emit('SYSTEM_DIRECTIVE', {
                    action,
                    branchId: branch.id,
                    month,
                    sections: sectionsToRequest
                });
                results.push({ branchId: branch.id, code: branch.code, name: branch.name, status: 'REQUESTED', mode: syncMode });
            } else {
                results.push({ branchId: branch.id, code: branch.code, name: branch.name, status: branch.status === 'ONLINE' ? 'NO_SOCKET' : 'OFFLINE', mode: syncMode });
            }
        }

        await logPortalSync(null, 'SYSTEM', 'System', 'PULL', 'SUCCESS', `Requested monthly closing for ${month} from ${branches.length} branches`);
        res.json({ success: true, message: `Monthly closing requested for ${month}`, results });
    } catch (error) {
        logger.error('Failed to request all monthly closing:', error);
        res.status(500).json({ error: 'Failed to request monthly closing' });
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

router.get('/policies', adminAuth, async (req, res) => {
    try {
        const defaults = [
            { entityType: 'payments', syncLevel: 'FULL', description: 'Payment records' },
            { entityType: 'sales', syncLevel: 'FULL', description: 'Machine sales' },
            { entityType: 'customers', syncLevel: 'COUNT_ONLY', description: 'Customer records' },
            { entityType: 'requests', syncLevel: 'FULL', description: 'Maintenance requests' },
            { entityType: 'stockMovements', syncLevel: 'SUMMARY', description: 'Stock movements' },
            { entityType: 'installments', syncLevel: 'FULL', description: 'Installment records' },
            { entityType: 'simMovements', syncLevel: 'SUMMARY', description: 'SIM movement logs' },
            { entityType: 'posMachines', syncLevel: 'COUNT_ONLY', description: 'POS machines' },
            { entityType: 'simCards', syncLevel: 'FULL', description: 'SIM cards' },
            { entityType: 'warehouseMachines', syncLevel: 'FULL', description: 'Warehouse machines' },
            { entityType: 'warehouseSims', syncLevel: 'FULL', description: 'Warehouse SIMs' }
        ];

        const policies = await prisma.syncPolicy.findMany({ orderBy: { entityType: 'asc' } });
        const policyMap = {};
        policies.forEach(p => { policyMap[p.entityType] = p; });

        const result = defaults.map(def => ({
            ...def,
            ...(policyMap[def.entityType] || { syncLevel: def.syncLevel, enabled: true })
        }));

        res.json({ success: true, policies: result });
    } catch (error) {
        logger.error('Failed to get sync policies:', error);
        res.status(500).json({ error: 'Failed to get sync policies' });
    }
});

router.put('/policies/:entityType', adminAuth, async (req, res) => {
    try {
        const { entityType } = req.params;
        const { syncLevel, enabled } = req.body;

        await prisma.syncPolicy.upsert({
            where: { entityType },
            update: { syncLevel, enabled },
            create: { entityType, syncLevel, enabled }
        });

        if (io) {
            const allPolicies = await prisma.syncPolicy.findMany({ orderBy: { entityType: 'asc' } });
            const defaults = [
                { entityType: 'payments', syncLevel: 'FULL', enabled: true },
                { entityType: 'sales', syncLevel: 'FULL', enabled: true },
                { entityType: 'customers', syncLevel: 'COUNT_ONLY', enabled: true },
                { entityType: 'requests', syncLevel: 'FULL', enabled: true },
                { entityType: 'stockMovements', syncLevel: 'SUMMARY', enabled: true },
                { entityType: 'installments', syncLevel: 'FULL', enabled: true },
                { entityType: 'simMovements', syncLevel: 'SUMMARY', enabled: true },
                { entityType: 'posMachines', syncLevel: 'COUNT_ONLY', enabled: true },
                { entityType: 'simCards', syncLevel: 'FULL', enabled: true },
                { entityType: 'warehouseMachines', syncLevel: 'FULL', enabled: true },
                { entityType: 'warehouseSims', syncLevel: 'FULL', enabled: true }
            ];
            const merged = defaults.map(def => {
                const dbP = allPolicies.find(p => p.entityType === def.entityType);
                return {
                    ...def,
                    ...(dbP ? { syncLevel: dbP.syncLevel, enabled: dbP.enabled } : {})
                };
            });
            io.emit('SYSTEM_DIRECTIVE', { action: 'POLICY_UPDATE', policies: merged });
            logger.info(`[Sync] Broadcast POLICY_UPDATE to all branches for ${entityType}`);
        }

        res.json({ success: true, message: `Sync policy updated for ${entityType}` });
    } catch (error) {
        logger.error('Failed to update sync policy:', error);
        res.status(500).json({ error: 'Failed to update sync policy' });
    }
});

module.exports = router;
