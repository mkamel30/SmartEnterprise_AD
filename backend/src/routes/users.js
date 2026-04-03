const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { adminAuth } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const syncQueueService = require('../services/syncQueue.service');
const logger = require('../../utils/logger');

router.use(adminAuth);

router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                include: { branch: true },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            }),
            prisma.user.count()
        ]);
        res.json({ users, total, pages: Math.ceil(total / limit) });
    } catch (error) {
        logger.error({ err: error.message }, 'Failed to fetch users');
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

router.post('/', async (req, res) => {
    try {
        const { username, password, displayName, role, branchId, email } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        
        const user = await prisma.user.create({
            data: {
                username,
                email,
                password: passwordHash,
                displayName,
                role,
                branchId
            }
        });

        await syncQueueService.enqueueUpdate('USER', 'CREATE', user);
        
        res.status(201).json(user);
    } catch (error) {
        logger.error({ err: error.message }, 'Failed to create user');
        res.status(500).json({ error: 'Failed to create user' });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const { displayName, role, branchId, email, isActive } = req.body;
        
        const user = await prisma.user.update({
            where: { id: req.params.id },
            data: { displayName, role, branchId, email, isActive }
        });

        await syncQueueService.enqueueUpdate('USER', 'UPDATE', user);
        
        res.json(user);
    } catch (error) {
        logger.error({ err: error.message }, 'Failed to update user');
        res.status(500).json({ error: 'Failed to update user' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await prisma.user.delete({ where: { id: req.params.id } });

        await syncQueueService.enqueueUpdate('USER', 'DELETE', { id: req.params.id });

        res.json({ message: 'User deleted' });
    } catch (error) {
        logger.error({ err: error.message }, 'Failed to delete user');
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

module.exports = router;
