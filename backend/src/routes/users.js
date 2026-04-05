const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { adminAuth } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const syncQueueService = require('../services/syncQueue.service');
const logger = require('../../utils/logger');
const ExcelJS = require('exceljs');

router.use(adminAuth);

router.get('/', async (req, res) => {
    try {
        const { branchId, role, isActive: activeFilter } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;

        const where = {};
        if (branchId) where.branchId = branchId;
        if (role) where.role = role;
        if (activeFilter !== undefined) where.isActive = activeFilter === 'true';

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                include: { branch: true },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            }),
            prisma.user.count({ where })
        ]);
        res.json({ users, total, pages: Math.ceil(total / limit) });
    } catch (error) {
        logger.error({ err: error.message }, 'Failed to fetch users');
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

router.get('/technicians', async (req, res) => {
    try {
        const technicians = await prisma.user.findMany({
            where: { role: 'TECHNICIAN', isActive: true },
            include: { branch: true },
            orderBy: { displayName: 'asc' }
        });
        res.json(technicians);
    } catch (error) {
        logger.error('Failed to fetch technicians:', error);
        res.status(500).json({ error: 'Failed to fetch technicians' });
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

router.post('/bulk-delete', async (req, res) => {
    try {
        const { userIds } = req.body;
        if (!Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({ error: 'No user IDs provided' });
        }

        await prisma.user.deleteMany({
            where: { id: { in: userIds } }
        });

        // Enqueue deletion sync for affected users
        for (const id of userIds) {
            await syncQueueService.enqueueUpdate('USER', 'DELETE', { id });
        }

        res.json({ message: 'Users deleted successfully', count: userIds.length });
    } catch (error) {
        logger.error({ err: error.message }, 'Failed to bulk delete users');
        res.status(500).json({ error: 'Failed to bulk delete users' });
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

router.post('/:id/reset-password', async (req, res) => {
    try {
        const { newPassword } = req.body;
        if (!newPassword) return res.status(400).json({ error: 'New password is required' });

        const passwordHash = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: req.params.id },
            data: { password: passwordHash }
        });

        res.json({ success: true, message: 'Password reset successful' });
    } catch (error) {
        logger.error('Failed to reset password:', error);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

router.get('/export', async (req, res) => {
    try {
        const { branchId, role, isActive: activeFilter } = req.query;
        const where = {};
        if (branchId) where.branchId = branchId;
        if (role) where.role = role;
        if (activeFilter !== undefined) where.isActive = activeFilter === 'true';

        const users = await prisma.user.findMany({
            where,
            include: { branch: true },
            orderBy: { username: 'asc' }
        });

        const workbook = new ExcelJS.Workbook();
        const ws = workbook.addWorksheet('Users');
        ws.columns = [
            { header: 'Username', key: 'username' },
            { header: 'Display Name', key: 'displayName' },
            { header: 'Role', key: 'role' },
            { header: 'Branch', key: 'branchName' },
            { header: 'Active', key: 'isActive' }
        ];
        users.forEach(u => ws.addRow({ username: u.username, displayName: u.displayName, role: u.role, branchName: u.branch?.name || '-', isActive: u.isActive }));

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=users_export_${new Date().toISOString().split('T')[0]}.xlsx`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        logger.error('Failed to export users:', error);
        res.status(500).json({ error: 'Failed to export users' });
    }
});

router.post('/import', async (req, res) => {
    try {
        res.json({ success: true, message: 'Import endpoint - use file upload middleware' });
    } catch (error) {
        logger.error('Failed to import users:', error);
        res.status(500).json({ error: 'Failed to import users' });
    }
});

module.exports = router;
