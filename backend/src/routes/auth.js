const express = require('express');
const logger = require('../../utils/logger');
const router = express.Router();
const prisma = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { adminAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { loginSchema, preferencesSchema, forgotPasswordSchema, resetPasswordSchema } = require('./auth.schema');
const { success, error: apiError } = require('../../utils/apiResponse');

router.post('/login', validate(loginSchema), async (req, res) => {
    try {
        const { username, password } = req.body;

        const admin = await prisma.adminUser.findUnique({ where: { username } });
        if (!admin) {
            return apiError(res, 'Invalid credentials', 401);
        }

        const isMatch = await bcrypt.compare(password, admin.passwordHash);
        if (!isMatch) {
            return apiError(res, 'Invalid credentials', 401);
        }

        const token = jwt.sign(
            { id: admin.id, username: admin.username, role: admin.role },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        return success(res, {
            token,
            admin: {
                id: admin.id,
                username: admin.username,
                name: admin.name,
                role: admin.role
            }
        });
    } catch (error) {
        logger.error('Login failed:', error);
        return apiError(res, 'Login failed', 500);
    }
});

// Forgot Password - Validate Recovery Key or Username
router.post('/forgot-password', validate(forgotPasswordSchema), async (req, res) => {
    try {
        const { username, recoveryKey } = req.body;
        
        const admin = await prisma.adminUser.findFirst({
            where: { 
                username,
                recoveryKey: recoveryKey.toUpperCase()
            }
        });

        if (!admin) {
            return apiError(res, 'الاسم أو مفتاح الاسترداد غير صحيح', 401);
        }

        // Generate secure temporary reset token
        const token = crypto.randomBytes(32).toString('hex');
        await prisma.adminUser.update({
            where: { id: admin.id },
            data: {
                resetPasswordToken: token,
                resetPasswordExpires: new Date(Date.now() + 15 * 60 * 1000) // 15 mins
            }
        });

        return success(res, { token, message: 'مفتاح الاسترداد صحيح. يمكنك الآن تعيين كلمة مرور جديدة.' });
    } catch (error) {
        return apiError(res, 'عذراً، فشلت العملية', 500);
    }
});

// Reset Password Completion
router.post('/reset-password', validate(resetPasswordSchema), async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        
        const admin = await prisma.adminUser.findFirst({
            where: {
                resetPasswordToken: token,
                resetPasswordExpires: { gt: new Date() }
            }
        });

        if (!admin) {
            return apiError(res, 'انتهت صلاحية الجلسة أو الكود غير صالح', 400);
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await prisma.adminUser.update({
            where: { id: admin.id },
            data: {
                passwordHash: hashedPassword,
                resetPasswordToken: null,
                resetPasswordExpires: null
            }
        });

        return success(res, { message: 'تم تغيير كلمة المرور بنجاح' });
    } catch (error) {
        return apiError(res, 'فشل تحديث كلمة المرور', 500);
    }
});

// Get user preferences
router.get('/preferences', adminAuth, async (req, res) => {
    try {
        const decoded = req.admin;
        const admin = await prisma.adminUser.findUnique({
            where: { id: decoded.id },
            select: { preferences: true }
        });

        return success(res, { preferences: admin?.preferences || {} });
    } catch (error) {
        return apiError(res, 'Failed to get preferences', 500);
    }
});

// Update user preferences
router.put('/preferences', adminAuth, validate(preferencesSchema), async (req, res) => {
    try {
        const decoded = req.admin;
        const { theme, fontFamily, themeVariant, ...otherPrefs } = req.body;

        const current = await prisma.adminUser.findUnique({
            where: { id: decoded.id },
            select: { preferences: true }
        });

        const updatedPreferences = {
            ...(current?.preferences || {}),
            theme,
            fontFamily,
            themeVariant,
            ...otherPrefs
        };

        await prisma.adminUser.update({
            where: { id: decoded.id },
            data: { preferences: updatedPreferences }
        });

        return success(res, { success: true, preferences: updatedPreferences });
    } catch (error) {
        logger.error('Failed to update preferences:', error);
        return apiError(res, 'Failed to update preferences', 500);
    }
});

module.exports = router;
