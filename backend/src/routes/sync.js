const express = require('express');
const router = express.Router();
const prisma = require('../../db');
const syncQueueService = require('../services/syncQueue.service');
const { adminAuth } = require('../middleware/auth');
const logger = require('../../utils/logger');

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
        // If still no branch found, find any branch
        if (!branch) {
            branch = await prisma.branch.findFirst({ where: { isActive: true } });
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
router.post('/request-sync', branchAuth, async (req, res) => {
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
        console.error('Branch sync request failed:', error);
        await logPortalSync(req.branch?.id, req.branch?.code, req.branch?.name, 'PULL', 'FAILED', 'فشل المزامنة: ' + error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Branch data push endpoint (upward sync)
router.post('/push', branchAuth, async (req, res) => {
    try {
        const { payments, maintenanceRequests, users, customers, posMachines } = req.body;
        const branchId = req.branch.id;

        const cleanEntity = (entity) => {
            if (!entity) return {};
            const { branch, customer, request, posMachine, payments, stockMovements, warehouseMachines, maintenanceApprovals, posMachines: pm, users: u, ...cleanData } = entity;
            return cleanData;
        };

        // Upsert Payments
        if (payments && Array.isArray(payments)) {
            for (const payment of payments) {
                const cleanPayment = cleanEntity(payment);
                await prisma.payment.upsert({
                    where: { id: payment.id },
                    update: { ...cleanPayment, branchId },
                    create: { ...cleanPayment, branchId }
                }).catch(e => logger.warn({ err: e.message }, 'Payment sync skip'));
            }
        }

        // Upsert Maintenance Requests
        if (maintenanceRequests && Array.isArray(maintenanceRequests)) {
            for (const request of maintenanceRequests) {
                const cleanRequest = cleanEntity(request);
                await prisma.maintenanceRequest.upsert({
                    where: { id: request.id },
                    update: { ...cleanRequest, branchId },
                    create: { ...cleanRequest, branchId }
                }).catch(e => logger.warn({ err: e.message }, 'Request sync skip'));
            }
        }

        // Upsert Users
        if (users && Array.isArray(users)) {
            for (const user of users) {
                if (user._deleted) {
                    await prisma.user.update({
                        where: { id: user.id },
                        data: { isActive: false }
                    }).catch(() => {});
                } else {
                    const cleanUser = cleanEntity(user);
                    await prisma.user.upsert({
                        where: { id: user.id },
                        update: { ...cleanUser, branchId },
                        create: { ...cleanUser, branchId }
                    }).catch(e => logger.warn({ err: e.message }, 'User sync skip'));
                }
            }
        }

        // Upsert Customers
        if (customers && Array.isArray(customers)) {
            for (const customer of customers) {
                const cleanCustomer = cleanEntity(customer);
                await prisma.customer.upsert({
                    where: { id: customer.id },
                    update: { ...cleanCustomer, branchId },
                    create: { ...cleanCustomer, branchId }
                }).catch(e => logger.warn({ err: e.message }, 'Customer sync skip'));
            }
        }

        // Upsert POS Machines
        if (posMachines && Array.isArray(posMachines)) {
            for (const posMachine of posMachines) {
                const cleanPOS = cleanEntity(posMachine);
                await prisma.posMachine.upsert({
                    where: { id: posMachine.id },
                    update: { ...cleanPOS, branchId },
                    create: { ...cleanPOS, branchId }
                }).catch(e => logger.warn({ err: e.message }, 'POS Machine sync skip'));
            }
        }

        // Update branch sync log
        await prisma.centralLog.create({
            data: {
                level: 'INFO',
                message: 'Branch Data Sync Completed',
                source: req.branch.code,
                context: `Pushed ${payments?.length || 0} payments, ${maintenanceRequests?.length || 0} requests`
            }
        });

        // Log the push
        const pushTotal = (payments?.length || 0) + (maintenanceRequests?.length || 0) + (users?.length || 0) + (customers?.length || 0) + (posMachines?.length || 0);
        await logPortalSync(req.branch.id, req.branch.code, req.branch.name, 'PUSH', 'SUCCESS', `${req.branch.code} أرسل ${pushTotal} عنصر`, pushTotal);

        res.json({ message: 'Sync successful' });
    } catch (error) {
        console.error('Push sync failed:', error);
        await logPortalSync(req.branch?.id, req.branch?.code, req.branch?.name, 'PUSH', 'FAILED', 'فشل الإرسال: ' + error.message);
        res.status(500).json({ error: 'Push sync failed' });
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
        console.error('Failed to request full sync:', error);
        res.status(500).json({ error: 'Failed to request sync' });
    }
});



// HTTP fallback: get branch stock for a specific part (called by admin socket handler)
router.get('/branch-stock/:branchId/:partId', adminAuth, async (req, res) => {
    try {
        const { branchId, partId } = req.params;
        res.json({ stock: [], branchId, partId, note: 'Branch stock queried via WebSocket' });
    } catch (error) {
        console.error('Branch stock query failed:', error);
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
        console.error('Failed to get sync logs:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
