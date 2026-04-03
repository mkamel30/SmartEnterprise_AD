const express = require('express');
const router = express.Router();
const prisma = require('../../db');
const syncQueueService = require('../services/syncQueue.service');
const { adminAuth } = require('../middleware/auth');
const logger = require('../../utils/logger');
const validate = require('../middleware/validate');
const { requestSyncSchema, pushSchema } = require('./sync.schema');

// Helper to log sync operations
async function logPortalSync(branchId, branchCode, branchName, type, status, message, itemCount = 0, details = null) {
    try {
        await prisma.portalSyncLog.create({
            data: { branchId, branchCode, branchName, type, status, message, itemCount, details: details ? String(details).substring(0, 1000) : null }
        });
    } catch (e) { /* ignore */ }
}

// Branch authentication for HTTP sync endpoints
const branchAuth = async (req, res, next) => {
    const apiKey = req.headers['x-portal-sync-key'];
    const masterKey = process.env.PORTAL_API_KEY;

    if (!apiKey) {
        return res.status(401).json({ error: 'Branch API Key required' });
    }

    let branch = await prisma.branch.findFirst({ where: { apiKey } });

    // Accept master key as fallback — find branch by handshake query
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

// Branch-initiated HTTP sync: branch requests data from portal
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

        // Log the sync request
        const totalItems = Object.values(result).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
        await logPortalSync(req.branch.id, req.branch.code, req.branch.name, 'PULL', 'SUCCESS', `${req.branch.code} استقبل ${totalItems} عنصر`, totalItems);

        res.json({ success: true, data: result });
    } catch (error) {
        logger.error('Branch sync request failed:', error);
        await logPortalSync(req.branch?.id, req.branch?.code, req.branch?.name, 'PULL', 'FAILED', 'فشل المزامنة: ' + error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Branch data push endpoint (upward sync)
router.post('/push', branchAuth, validate(pushSchema), async (req, res) => {
    const branchId = req.branch.id;
    const { 
        customers, 
        posMachines, 
        users, 
        payments, 
        maintenanceRequests, 
        spareParts, 
        warehouseMachines, 
        simCards 
    } = req.body;

    const stats = {
        customers: 0,
        posMachines: 0,
        users: 0,
        payments: 0,
        maintenanceRequests: 0,
        spareParts: 0,
        warehouseMachines: 0,
        simCards: 0
    };

    const errors = [];

    const cleanEntity = (entity) => {
        if (!entity) return {};
        // Remove all relation fields and metadata that shouldn't be in a simple upsert
        const { 
            branch, customer, request, posMachine, payments, 
            stockMovements, warehouseMachines, maintenanceApprovals, 
            posMachines: pm, users: u, _deleted, ...cleanData 
        } = entity;
        return cleanData;
    };

    try {
        // 1. Sync Customers (Highest dependency)
        if (customers && Array.isArray(customers)) {
            for (const customer of customers) {
                try {
                    const data = cleanEntity(customer);
                    await prisma.customer.upsert({
                        where: { id: customer.id },
                        update: { ...data, branchId },
                        create: { ...data, branchId }
                    });
                    stats.customers++;
                } catch (e) {
                    errors.push(`Customer ${customer.id}: ${e.message}`);
                }
            }
        }

        // 2. Sync POS Machines (Depends on Customers)
        if (posMachines && Array.isArray(posMachines)) {
            for (const machine of posMachines) {
                try {
                    const data = cleanEntity(machine);
                    await prisma.posMachine.upsert({
                        where: { id: machine.id },
                        update: { ...data, branchId },
                        create: { ...data, branchId }
                    });
                    stats.posMachines++;
                } catch (e) {
                    errors.push(`POS Machine ${machine.id}: ${e.message}`);
                }
            }
        }

        // 3. Sync Users
        if (users && Array.isArray(users)) {
            for (const user of users) {
                try {
                    if (user._deleted) {
                        await prisma.user.update({
                            where: { id: user.id },
                            data: { isActive: false }
                        });
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

        // 4. Sync Payments (Depends on Customers)
        if (payments && Array.isArray(payments)) {
            for (const payment of payments) {
                try {
                    const data = cleanEntity(payment);
                    await prisma.payment.upsert({
                        where: { id: payment.id },
                        update: { ...data, branchId },
                        create: { ...data, branchId }
                    });
                    stats.payments++;
                } catch (e) {
                    errors.push(`Payment ${payment.id}: ${e.message}`);
                }
            }
        }

        // 5. Sync Maintenance Requests (Depends on Customers, POS, Users)
        if (maintenanceRequests && Array.isArray(maintenanceRequests)) {
            for (const request of maintenanceRequests) {
                try {
                    const data = cleanEntity(request);
                    await prisma.maintenanceRequest.upsert({
                        where: { id: request.id },
                        update: { ...data, branchId },
                        create: { ...data, branchId }
                    });
                    stats.maintenanceRequests++;
                } catch (e) {
                    errors.push(`Request ${request.id}: ${e.message}`);
                }
            }
        }

        // 6. Sync Spare Parts (Inventory)
        if (spareParts && Array.isArray(spareParts)) {
            for (const item of spareParts) {
                try {
                    await prisma.branchSparePart.upsert({
                        where: { branchId_partId: { branchId, partId: item.partId } },
                        update: { quantity: item.quantity, lastUpdated: new Date() },
                        create: { branchId, partId: item.partId, quantity: item.quantity }
                    });
                    stats.spareParts++;
                } catch (e) {
                    errors.push(`SparePart ${item.partId}: ${e.message}`);
                }
            }
        }

        // 7. Sync Warehouse Machines
        if (warehouseMachines && Array.isArray(warehouseMachines)) {
            for (const machine of warehouseMachines) {
                try {
                    const data = cleanEntity(machine);
                    await prisma.warehouseMachine.upsert({
                        where: { serialNumber: machine.serialNumber },
                        update: { ...data, branchId },
                        create: { ...data, branchId }
                    });
                    stats.warehouseMachines++;
                } catch (e) {
                    errors.push(`Warehouse Machine ${machine.serialNumber}: ${e.message}`);
                }
            }
        }

        // 8. Sync SIM Cards
        if (simCards && Array.isArray(simCards)) {
            for (const sim of simCards) {
                try {
                    const data = cleanEntity(sim);
                    await prisma.simCard.upsert({
                        where: { serialNumber: sim.serialNumber },
                        update: { ...data, branchId },
                        create: { ...data, branchId }
                    });
                    stats.simCards++;
                } catch (e) {
                    errors.push(`SIM Card ${sim.serialNumber}: ${e.message}`);
                }
            }
        }

        // Log final results
        const totalItems = Object.values(stats).reduce((a, b) => a + b, 0);
        
        await prisma.centralLog.create({
            data: {
                level: errors.length > 0 ? 'WARNING' : 'INFO',
                message: `Branch Data Push: ${totalItems} synced successfully, ${errors.length} failed`,
                source: req.branch.code,
                context: JSON.stringify({ stats, errorCount: errors.length })
            }
        });

        await logPortalSync(
            req.branch.id, 
            req.branch.code, 
            req.branch.name, 
            'PUSH', 
            errors.length === totalItems ? 'FAILED' : 'SUCCESS', 
            `${req.branch.code} أرسل ${totalItems} عنصر بنجاح (${errors.length} خطأ)`, 
            totalItems,
            errors.length > 0 ? errors.join('\n').substring(0, 1000) : null
        );

        res.json({ 
            message: 'Sync process completed', 
            stats, 
            success: errors.length === 0,
            errorCount: errors.length
        });

    } catch (error) {
        logger.error('Fatal Push sync failure:', error);
        await logPortalSync(req.branch?.id, req.branch?.code, req.branch?.name, 'PUSH', 'FAILED', 'فشل الإرسال القاتل: ' + error.message);
        res.status(500).json({ error: 'Push sync failed: ' + error.message });
    }
});

// Admin requests a specific branch to push its full historical data upwards
router.post('/request-full-sync/:branchId', adminAuth, async (req, res) => {
    try {
        const { branchId } = req.params;
        // Verify branch exists
        const branch = await prisma.branch.findUnique({ where: { id: branchId } });
        if (!branch) return res.status(404).json({ error: 'Branch not found' });
        
        // Emitting an internal "request" via the queue/socket system
        // We'll use syncQueueService to broadcast a special DIRECTIVE
        await syncQueueService.enqueueUpdate('SYSTEM_DIRECTIVE', 'REQUEST_FULL_SYNC', { branchId });
        
        res.json({ message: 'Full sync requested successfully via WebSockets' });
    } catch (error) {
        logger.error('Failed to request full sync:', error);
        res.status(500).json({ error: 'Failed to request sync' });
    }
});



// HTTP fallback: get branch stock for a specific part (called by admin socket handler)
router.get('/branch-stock/:branchId/:partId', adminAuth, async (req, res) => {
    try {
        const { branchId, partId } = req.params;
        res.json({ stock: [], branchId, partId, note: 'Branch stock queried via WebSocket' });
    } catch (error) {
        logger.error('Branch stock query failed:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /sync/logs - Portal sync logs (paginated, filterable by branch)
router.get('/logs', adminAuth, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        const type = req.query.type || '';
        const branchId = req.query.branchId || '';

        const where = {};
        if (type) where.type = type;
        if (branchId) where.branchId = branchId;

        const [logs, total] = await Promise.all([
            prisma.portalSyncLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip: offset
            }),
            prisma.portalSyncLog.count({ where })
        ]);

        res.json({ data: logs, pagination: { total, limit, offset, pages: Math.ceil(total / limit) } });
    } catch (error) {
        logger.error('Failed to get sync logs:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
