
const express = require('express');
const router = express.Router();
const prisma = require('../../db');
const { adminAuth } = require('../middleware/auth');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

const asyncHandler = fn => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

// Get MFA status
router.get('/status', adminAuth, asyncHandler(async (req, res) => {
    const admin = await prisma.adminUser.findUnique({ where: { id: req.admin.id } });
    res.json({
        enabled: admin.mfaEnabled,
        setupPending: admin.mfaSetupPending
    });
}));

// Setup MFA - generate secret and QR code
router.post('/setup', adminAuth, asyncHandler(async (req, res) => {
    const admin = await prisma.adminUser.findUnique({ where: { id: req.admin.id } });
    if (admin.mfaEnabled) {
        return res.status(400).json({ error: 'MFA is already enabled' });
    }

    const secret = speakeasy.generateSecret({
        name: `SmartEnterprise Admin (${admin.username})`,
        length: 20
    });

    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    await prisma.adminUser.update({
        where: { id: admin.id },
        data: {
            mfaTempSecret: secret.base32,
            mfaSetupPending: true
        }
    });

    res.json({
        qrCode: qrCodeUrl,
        manualEntryKey: secret.base32
    });
}));

// Verify MFA setup and enable
router.post('/verify-setup', adminAuth, asyncHandler(async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token is required' });

    const admin = await prisma.adminUser.findUnique({ where: { id: req.admin.id } });
    if (!admin.mfaTempSecret) {
        return res.status(400).json({ error: 'No MFA setup in progress' });
    }

    const verified = speakeasy.totp.verify({
        secret: admin.mfaTempSecret,
        encoding: 'base32',
        token,
        window: 1
    });

    if (!verified) {
        return res.status(400).json({ error: 'Invalid token' });
    }

    const recoveryCodes = Array.from({ length: 8 }, () =>
        Math.random().toString(36).substring(2, 6).toUpperCase() + '-' +
        Math.random().toString(36).substring(2, 6).toUpperCase()
    );

    await prisma.adminUser.update({
        where: { id: admin.id },
        data: {
            mfaEnabled: true,
            mfaSecret: admin.mfaTempSecret,
            mfaTempSecret: null,
            mfaSetupPending: false,
            mfaRecoveryCodes: JSON.stringify(recoveryCodes)
        }
    });

    res.json({ backupCodes: recoveryCodes });
}));

// Disable MFA
router.post('/disable', adminAuth, asyncHandler(async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token is required' });

    const admin = await prisma.adminUser.findUnique({ where: { id: req.admin.id } });
    if (!admin.mfaEnabled) {
        return res.status(400).json({ error: 'MFA is not enabled' });
    }

    const verified = speakeasy.totp.verify({
        secret: admin.mfaSecret,
        encoding: 'base32',
        token,
        window: 1
    });

    if (!verified) {
        return res.status(400).json({ error: 'Invalid token' });
    }

    await prisma.adminUser.update({
        where: { id: admin.id },
        data: {
            mfaEnabled: false,
            mfaSecret: null,
            mfaRecoveryCodes: null,
            mfaSetupPending: false
        }
    });

    res.json({ message: 'MFA disabled successfully' });
}));

// Verify MFA during login
router.post('/verify', asyncHandler(async (req, res) => {
    const { userId, token } = req.body;
    if (!userId || !token) return res.status(400).json({ error: 'userId and token are required' });

    const admin = await prisma.adminUser.findUnique({ where: { id: userId } });
    if (!admin || !admin.mfaEnabled) {
        return res.status(400).json({ error: 'MFA not enabled for this user' });
    }

    const verified = speakeasy.totp.verify({
        secret: admin.mfaSecret,
        encoding: 'base32',
        token,
        window: 1
    });

    if (!verified) {
        return res.status(401).json({ error: 'Invalid MFA token' });
    }

    res.json({ success: true });
}));

// Generate new recovery codes
router.post('/recovery-codes', adminAuth, asyncHandler(async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token is required' });

    const admin = await prisma.adminUser.findUnique({ where: { id: req.admin.id } });
    if (!admin.mfaEnabled) {
        return res.status(400).json({ error: 'MFA must be enabled' });
    }

    const verified = speakeasy.totp.verify({
        secret: admin.mfaSecret,
        encoding: 'base32',
        token,
        window: 1
    });

    if (!verified) {
        return res.status(400).json({ error: 'Invalid token' });
    }

    const recoveryCodes = Array.from({ length: 8 }, () =>
        Math.random().toString(36).substring(2, 6).toUpperCase() + '-' +
        Math.random().toString(36).substring(2, 6).toUpperCase()
    );

    await prisma.adminUser.update({
        where: { id: admin.id },
        data: { mfaRecoveryCodes: JSON.stringify(recoveryCodes) }
    });

    res.json({ backupCodes: recoveryCodes });
}));

// Verify recovery code during login
router.post('/verify-recovery', asyncHandler(async (req, res) => {
    const { userId, code } = req.body;
    if (!userId || !code) return res.status(400).json({ error: 'userId and code are required' });

    const admin = await prisma.adminUser.findUnique({ where: { id: userId } });
    if (!admin || !admin.mfaEnabled || !admin.mfaRecoveryCodes) {
        return res.status(400).json({ error: 'MFA recovery not available' });
    }

    const codes = JSON.parse(admin.mfaRecoveryCodes);
    const codeIndex = codes.indexOf(code.toUpperCase().trim());

    if (codeIndex === -1) {
        return res.status(401).json({ error: 'Invalid recovery code' });
    }

    codes.splice(codeIndex, 1);
    await prisma.adminUser.update({
        where: { id: admin.id },
        data: { mfaRecoveryCodes: JSON.stringify(codes) }
    });

    res.json({ success: true, remainingCodes: codes.length });
}));

module.exports = router;
