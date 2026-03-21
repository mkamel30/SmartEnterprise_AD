const express = require('express');
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
        console.error('Branch setup validation failed:', error);
        res.status(500).json({ error: 'خطأ في السيرفر' });
    }
});

module.exports = router;
