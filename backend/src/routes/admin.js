const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { adminAuth } = require('../middleware/auth');
const { logAuditAction } = require('../utils/auditLogger');
const os = require('os');
const syncQueueService = require('../services/syncQueue.service');

router.use(adminAuth);

// --- Audit Logs ---
router.get('/audit-logs', async (req, res) => {
    try {
        const { page = 1, limit = 50, entityType, action, branchId } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        
        const where = {};
        if (entityType) where.entityType = entityType;
        if (action) where.action = action;
        // branchId filter would need a join if we had it in AuditLog, but let's assume global
        
        const logs = await prisma.auditLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take: Number(limit)
        });
        
        const total = await prisma.auditLog.count({ where });
        
        res.json({ logs, total, pages: Math.ceil(total / limit) });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

router.delete('/audit-logs/older-than/:days', async (req, res) => {
    try {
        const { days } = req.params;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - Number(days));
        
        const deleted = await prisma.auditLog.deleteMany({
            where: { createdAt: { lt: cutoff } }
        });
        
        await logAuditAction({
            userId: req.admin.id,
            userName: req.admin.username,
            entityType: 'AUDIT_LOGS',
            action: 'CLEANUP',
            details: `Cleaned up ${deleted.count} logs older than ${days} days`,
            req
        });
        
        res.json({ success: true, count: deleted.count });
    } catch (error) {
        res.status(500).json({ error: 'Failed to cleanup logs' });
    }
});

// --- System Monitoring ---
router.get('/system/status', async (req, res) => {
    try {
        const [users, customers, branches, machines, openRequests] = await Promise.all([
            prisma.user.count(),
            prisma.customer.count(),
            prisma.branch.count(),
            prisma.posMachine.count(),
            prisma.maintenanceRequest.count({ where: { status: 'Open' } })
        ]);
        
        res.json({
            stats: { 
                users, customers, branches, machines, openRequests 
            },
            system: {
                platform: os.platform(),
                uptime: os.uptime(),
                memoryUsage: process.memoryUsage(),
                loadavg: os.loadavg()
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

router.get('/system/logs/recent', async (req, res) => {
    const { hours = 24 } = req.query;
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - Number(hours));
    
    try {
        const logs = await prisma.centralLog.findMany({
            where: { createdAt: { gte: cutoff } },
            orderBy: { createdAt: 'desc' },
            take: 100
        });
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

// --- System Settings Management ---
router.get('/settings', async (req, res) => {
    try {
        const settings = await prisma.systemSetting.findMany();
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

router.put('/settings', async (req, res) => {
    try {
        const { key, value, description } = req.body;
        const setting = await prisma.systemSetting.upsert({
            where: { key },
            update: { value, description },
            create: { key, value, description }
        });
        
        await logAuditAction({
            userId: req.admin.id,
            userName: req.admin.username,
            entityType: 'SYSTEM_SETTINGS',
            entityId: key,
            action: 'UPDATE',
            details: `Value: ${value}`,
            req
        });
        
        res.json(setting);
    } catch (error) {
        res.status(500).json({ error: 'Update failed' });
    }
});

// --- Manually Trigger User Sync ---
router.post('/sync/users', async (req, res) => {
    try {
        const users = await prisma.user.findMany();
        
        for (const user of users) {
             await syncQueueService.enqueueUpdate('USER', 'UPSERT', user);
        }

        await logAuditAction({
            userId: req.admin.id,
            userName: req.admin.username,
            entityType: 'USER_SYNC',
            action: 'FORCE_REBROADCAST',
            details: `Manually triggered re-sync for ${users.length} users`,
            req
        });

        res.json({ message: `Initiated sync for ${users.length} users to all branches.` });
    } catch (error) {
        console.error('Manual user sync failed:', error);
        res.status(500).json({ error: 'Sync failed' });
    }
});

module.exports = router;
