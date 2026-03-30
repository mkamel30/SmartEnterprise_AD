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

// --- Branch Management ---
router.get('/branches', async (req, res) => {
    try {
        const branches = await prisma.branch.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                _count: {
                    select: { users: true }
                }
            }
        });
        res.json(branches);
    } catch (error) {
        console.error('Failed to fetch branches:', error);
        res.status(500).json({ error: 'Failed to fetch branches' });
    }
});

router.get('/branches/:id/users', async (req, res) => {
    try {
        const { id } = req.params;
        const users = await prisma.user.findMany({
            where: { branchId: id },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                username: true,
                email: true,
                displayName: true,
                role: true,
                isActive: true,
                createdAt: true,
                lastLoginAt: true
            }
        });
        res.json(users);
    } catch (error) {
        console.error('Failed to fetch branch users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

router.delete('/branches/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Check if branch exists
        const branch = await prisma.branch.findUnique({ where: { id } });
        if (!branch) {
            return res.status(404).json({ error: 'Branch not found' });
        }

        // Delete branch (cascade will handle related records)
        await prisma.branch.delete({ where: { id } });

        await logAuditAction({
            userId: req.admin.id,
            userName: req.admin.username,
            entityType: 'BRANCH',
            entityId: id,
            action: 'DELETE',
            details: `Deleted branch: ${branch.name} (${branch.code})`,
            req
        });

        res.json({ success: true, message: 'Branch deleted' });
    } catch (error) {
        console.error('Failed to delete branch:', error);
        res.status(500).json({ error: 'Failed to delete branch' });
    }
});

// --- User Management (All Branches) ---
router.get('/users', async (req, res) => {
    try {
        const { page = 1, limit = 50, branchId, search } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const where = {};
        if (branchId) where.branchId = branchId;
        if (search) {
            where.OR = [
                { username: { contains: search } },
                { email: { contains: search } },
                { displayName: { contains: search } }
            ];
        }

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: Number(limit),
                include: {
                    branch: {
                        select: { code: true, name: true }
                    }
                }
            }),
            prisma.user.count({ where })
        ]);

        res.json({ users, total, pages: Math.ceil(total / limit) });
    } catch (error) {
        console.error('Failed to fetch users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

router.delete('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Check if user exists
        const user = await prisma.user.findUnique({ where: { id } });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Delete user
        await prisma.user.delete({ where: { id } });

        await logAuditAction({
            userId: req.admin.id,
            userName: req.admin.username,
            entityType: 'USER',
            entityId: id,
            action: 'DELETE',
            details: `Deleted user: ${user.username} (was in branch ${user.branchId})`,
            req
        });

        res.json({ success: true, message: 'User deleted' });
    } catch (error) {
        console.error('Failed to delete user:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// Reset user password - generates temp password for admin to share
router.post('/users/:id/reset-password', async (req, res) => {
    try {
        const { id } = req.params;
        const bcrypt = require('bcryptjs');
        const crypto = require('crypto');
        
        // Check if user exists
        const user = await prisma.user.findUnique({ where: { id } });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Generate temporary password
        const tempPassword = crypto.randomBytes(4).toString('hex');
        const hashedPassword = await bcrypt.hash(tempPassword, 10);

        // Update user with new password
        await prisma.user.update({
            where: { id },
            data: {
                password: hashedPassword,
                mustChangePassword: true,
                passwordChangedAt: new Date()
            }
        });

        // Also clear any lockout
        await prisma.accountLockout.deleteMany({ where: { userId: id } }).catch(() => {});

        await logAuditAction({
            userId: req.admin.id,
            userName: req.admin.username,
            entityType: 'USER',
            entityId: id,
            action: 'RESET_PASSWORD',
            details: `Reset password for user: ${user.username} (branch ${user.branchId})`,
            req
        });

        res.json({ 
            success: true, 
            message: 'Password reset successful',
            tempPassword,
            username: user.username
        });
    } catch (error) {
        console.error('Failed to reset password:', error);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

// Unlock user account
router.post('/users/:id/unlock', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Check if user exists
        const user = await prisma.user.findUnique({ where: { id } });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Clear lockout
        await prisma.accountLockout.deleteMany({ where: { userId: id } });

        await logAuditAction({
            userId: req.admin.id,
            userName: req.admin.username,
            entityType: 'USER',
            entityId: id,
            action: 'UNLOCK',
            details: `Unlocked account for user: ${user.username}`,
            req
        });

        res.json({ success: true, message: 'Account unlocked successfully' });
    } catch (error) {
        console.error('Failed to unlock account:', error);
        res.status(500).json({ error: 'Failed to unlock account' });
    }
});

// --- User Sync Logs ---
router.get('/user-sync-logs', async (req, res) => {
    try {
        const { page = 1, limit = 50, branchCode, status } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const where = {};
        if (branchCode) where.branchCode = branchCode;
        if (status) where.status = status;

        const [logs, total] = await Promise.all([
            prisma.userSyncLog.findMany({
                where,
                orderBy: { syncedAt: 'desc' },
                skip,
                take: Number(limit)
            }),
            prisma.userSyncLog.count({ where })
        ]);

        res.json({ logs, total, pages: Math.ceil(total / limit) });
    } catch (error) {
        console.error('Failed to fetch sync logs:', error);
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

module.exports = router;
