const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { adminAuth } = require('../middleware/auth');
const logger = require('../../utils/logger');

router.use(adminAuth);

// Get notifications
router.get('/', async (req, res) => {
    try {
        const { branchId, userId, unreadOnly, limit } = req.query;
        const where = {};
        if (branchId) where.branchId = branchId;
        if (userId) where.userId = userId;
        if (unreadOnly === 'true') where.isRead = false;

        const notifications = await prisma.notification.findMany({
            where,
            include: { branch: { select: { id: true, name: true, code: true } } },
            orderBy: { createdAt: 'desc' },
            take: parseInt(limit as string) || 50
        });

        res.json({ success: true, data: notifications });
    } catch (error) {
        logger.error('Failed to fetch notifications:', error);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// Get notification count
router.get('/count', async (req, res) => {
    try {
        const { branchId, userId } = req.query;
        const where = { isRead: false };
        if (branchId) where.branchId = branchId;
        if (userId) where.userId = userId;

        const count = await prisma.notification.count({ where });
        res.json({ count });
    } catch (error) {
        logger.error('Failed to get notification count:', error);
        res.status(500).json({ error: 'Failed to get count' });
    }
});

// Mark notification as read
router.put('/:id/read', async (req, res) => {
    try {
        await prisma.notification.update({
            where: { id: req.params.id },
            data: { isRead: true }
        });
        res.json({ success: true });
    } catch (error) {
        logger.error('Failed to mark notification read:', error);
        res.status(500).json({ error: 'Failed to update notification' });
    }
});

// Mark all as read
router.put('/read-all', async (req, res) => {
    try {
        const { branchId, userId } = req.body;
        const where = { isRead: false };
        if (branchId) where.branchId = branchId;
        if (userId) where.userId = userId;

        await prisma.notification.updateMany({ where, data: { isRead: true } });
        res.json({ success: true });
    } catch (error) {
        logger.error('Failed to mark all read:', error);
        res.status(500).json({ error: 'Failed to update notifications' });
    }
});

module.exports = router;
