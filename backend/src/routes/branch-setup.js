const express = require('express');
const logger = require('../../utils/logger');
const router = express.Router();
const prisma = require('../db');
const bcrypt = require('bcryptjs');

// POST /api/branch-setup/validate
// Used by Branch App on first run to authenticate operator against portal
router.post('/validate', async (req, res) => {
    try {
        const { username, password, branchCode } = req.body;

        if (!username || !password || !branchCode) {
            return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        }

        // 1. Find branch by code
        const branch = await prisma.branch.findFirst({
            where: { code: branchCode, isActive: true }
        });

        if (!branch) {
            return res.status(404).json({ error: 'رمز الفرع غير موجود في النظام' });
        }

        // 2. Find user by username linked to this branch
        const user = await prisma.user.findFirst({
            where: {
                username,
                branchId: branch.id,
                isActive: true
            }
        });

        if (!user) {
            return res.status(401).json({ error: 'اسم المستخدم غير موجود لهذا الفرع' });
        }

        // 3. Verify password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }

        // 4. Return user data + branch info
        res.json({
            success: true,
            user: {
                id: user.id,
                uid: user.uid,
                username: user.username,
                email: user.email,
                displayName: user.displayName,
                role: user.role,
                password: user.password, // hashed — saved locally for future login
                branchId: user.branchId
            },
            branch: {
                id: branch.id,
                code: branch.code,
                name: branch.name,
                type: branch.type
            }
        });
    } catch (error) {
        logger.error('Branch setup validation failed:', error);
        res.status(500).json({ error: 'خطأ في السيرفر' });
    }
});

// POST /api/branch-setup/check-branch
// Step 1: User enters branch code → Portal returns branch info
router.post('/check-branch', async (req, res) => {
    try {
        const { branchCode } = req.body;

        if (!branchCode) {
            return res.status(400).json({ error: 'Branch code is required' });
        }

        const branch = await prisma.branch.findFirst({
            where: { code: branchCode, isActive: true }
        });

        if (!branch) {
            return res.status(404).json({ error: 'Branch not found', exists: false });
        }

        res.json({
            exists: true,
            branchName: branch.name,
            branchId: branch.id,
            branchType: branch.type,
            branchStatus: branch.status
        });
    } catch (error) {
        logger.error('Check branch failed:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/branch-setup/validate-api-key
// Step 2: Validate API key against branch
router.post('/validate-api-key', async (req, res) => {
    try {
        const { branchCode, apiKey } = req.body;

        if (!branchCode || !apiKey) {
            return res.status(400).json({ error: 'Branch code and API key are required' });
        }

        const branch = await prisma.branch.findFirst({
            where: { code: branchCode, isActive: true }
        });

        if (!branch) {
            return res.status(404).json({ error: 'Branch not found' });
        }

        // Validate API key matches
        if (branch.apiKey !== apiKey) {
            return res.status(401).json({ error: 'Invalid API Key' });
        }

        res.json({
            valid: true,
            branch: {
                id: branch.id,
                code: branch.code,
                name: branch.name,
                type: branch.type,
                status: branch.status
            }
        });
    } catch (error) {
        logger.error('Validate API key failed:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/branch-setup/sync-user
// Receive user from branch and create in portal
router.post('/sync-user', async (req, res) => {
    try {
        const apiKey = req.headers['x-api-key'];
        const { branchCode, user } = req.body;

        logger.info('[sync-user] Received request:', { branchCode, user: { ...user, password: '[REDACTED]' } });

        if (!apiKey || !branchCode || !user) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Validate API key
        const branch = await prisma.branch.findFirst({
            where: { code: branchCode, apiKey }
        });

        logger.info('[sync-user] Branch found:', branch?.code);

        if (!branch) {
            return res.status(401).json({ error: 'Invalid API key' });
        }

        // Check if user already exists
        let existingUser = null;
        if (user.id) {
            existingUser = await prisma.user.findUnique({ where: { id: user.id } });
        }
        if (!existingUser && user.username) {
            existingUser = await prisma.user.findFirst({
                where: { username: user.username, branchId: branch.id }
            });
        }

        let savedUser;
        try {
            if (existingUser) {
                // Update existing user
                savedUser = await prisma.user.update({
                    where: { id: existingUser.id },
                    data: {
                        email: user.email || existingUser.email,
                        displayName: user.displayName || existingUser.displayName,
                        role: user.role || existingUser.role,
                        password: user.password || existingUser.password,
                        isActive: true
                    }
                });
            } else {
                // Create new user
                logger.info('[sync-user] Creating user with:', { username: user.username, branchId: branch.id });
                savedUser = await prisma.user.create({
                    data: {
                        id: user.id,
                        username: user.username,
                        email: user.email,
                        displayName: user.displayName || user.username,
                        role: user.role || 'BRANCH_ADMIN',
                        password: user.password,
                        branchId: branch.id,
                        isActive: true
                    }
                });
                logger.info('[sync-user] User created:', savedUser.id);
            }
        } catch (userErr) {
            logger.error('[sync-user] User creation error:', userErr.message, userErr.stack);
            return res.status(500).json({ error: 'Failed to create user: ' + userErr.message });
        }

        // Log the sync
        await prisma.userSyncLog.create({
            data: {
                branchCode,
                userId: savedUser.id,
                username: user.username,
                email: user.email,
                action: existingUser ? 'SYNCED' : 'CREATED',
                source: 'BRANCH',
                status: 'SUCCESS'
            }
        });

        res.json({ success: true, userId: savedUser.id });
    } catch (error) {
        logger.error('Sync user failed:', error.message);
        
        // Log the failure
        if (req.body?.branchCode && req.body?.user?.username) {
            await prisma.userSyncLog.create({
                data: {
                    branchCode: req.body.branchCode,
                    username: req.body.user.username,
                    action: 'SYNCED',
                    source: 'BRANCH',
                    status: 'FAILED',
                    errorMessage: error.message
                }
            }).catch(() => {});
        }
        
        res.status(500).json({ error: 'Failed to sync user: ' + error.message });
    }
});

// GET /api/branch-setup/branch-users/:branchCode
// Get users for a specific branch (protected by API key)
router.get('/branch-users/:branchCode', async (req, res) => {
    try {
        const apiKey = req.headers['x-api-key'];
        const { branchCode } = req.params;

        if (!apiKey) {
            return res.status(401).json({ error: 'API key required' });
        }

        // Validate API key
        const branch = await prisma.branch.findFirst({
            where: { code: branchCode, apiKey }
        });

        if (!branch) {
            return res.status(401).json({ error: 'Invalid API key' });
        }

        // Get users for this branch
        const users = await prisma.user.findMany({
            where: { branchId: branch.id, isActive: true },
            select: {
                id: true,
                username: true,
                email: true,
                displayName: true,
                role: true,
                isActive: true
            }
        });

        res.json({ users });
    } catch (error) {
        logger.error('Get branch users failed:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
