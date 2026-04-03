const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const prisma = require('../db');
const { adminAuth } = require('../middleware/auth');
const logger = require('../../utils/logger');

function generateLicenseKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const segments = [];
    for (let s = 0; s < 4; s++) {
        let segment = '';
        const bytes = crypto.randomBytes(5);
        for (let i = 0; i < 5; i++) {
            segment += chars.charAt(bytes[i] % chars.length);
        }
        segments.push(segment);
    }
    return segments.join('-');
}

router.use(adminAuth);

router.post('/create', async (req, res) => {
    try {
        const { branchCode, branchName, type, expirationDate, maxActivations } = req.body;

        const licenseKey = generateLicenseKey();

        const license = await prisma.license.create({
            data: {
                licenseKey,
                branchCode: branchCode || null,
                branchName: branchName || null,
                type: type || 'BRANCH',
                status: 'ACTIVE',
                expirationDate: expirationDate ? new Date(expirationDate) : null,
                maxActivations: maxActivations || 1
            }
        });

        await prisma.licenseAudit.create({
            data: {
                licenseId: license.id,
                licenseKey: license.licenseKey,
                action: 'CREATED',
                branchCode,
                details: JSON.stringify({ type, expirationDate, maxActivations }),
                performedBy: req.admin?.username || 'system'
            }
        });

        res.json({
            success: true,
            license: {
                id: license.id,
                licenseKey: license.licenseKey,
                branchCode: license.branchCode,
                type: license.type,
                status: license.status,
                expirationDate: license.expirationDate,
                maxActivations: license.maxActivations
            }
        });
    } catch (error) {
        logger.error({ err: error.message }, 'License creation error');
        res.status(500).json({ error: 'Failed to create license' });
    }
});

router.post('/activate', async (req, res) => {
    try {
        const { licenseKey, hwid, branchCode, branchName } = req.body;

        if (!licenseKey) {
            return res.status(400).json({ error: 'License key is required' });
        }

        const license = await prisma.license.findUnique({
            where: { licenseKey }
        });

        if (!license) {
            return res.status(404).json({ error: 'License not found' });
        }

        if (license.status !== 'ACTIVE') {
            return res.status(403).json({ 
                error: 'License is not active',
                status: license.status
            });
        }

        if (license.expirationDate && new Date() > license.expirationDate) {
            await prisma.license.update({
                where: { id: license.id },
                data: { status: 'EXPIRED' }
            });
            return res.status(403).json({ error: 'License has expired' });
        }

        if (license.hwid && license.hwid !== hwid) {
            await prisma.licenseAudit.create({
                data: {
                    licenseId: license.id,
                    licenseKey: license.licenseKey,
                    action: 'HWID_MISMATCH',
                    branchCode,
                    hwid,
                    ipAddress: req.ip,
                    details: JSON.stringify({ expected: license.hwid, received: hwid }),
                    performedBy: 'system'
                }
            });
            return res.status(403).json({ error: 'Hardware ID mismatch' });
        }

        if (license.maxActivations > 0 && license.activationCount >= license.maxActivations) {
            return res.status(403).json({ 
                error: 'Maximum activations reached',
                activationCount: license.activationCount,
                maxActivations: license.maxActivations
            });
        }

        const updates = {
            activationCount: license.activationCount + 1,
            activationDate: license.activationDate || new Date(),
            hwid: license.hwid || hwid,
            branchCode: license.branchCode || branchCode,
            branchName: license.branchName || branchName
        };

        await prisma.license.update({
            where: { id: license.id },
            data: updates
        });

        await prisma.licenseAudit.create({
            data: {
                licenseId: license.id,
                licenseKey: license.licenseKey,
                action: 'ACTIVATED',
                branchCode: updates.branchCode,
                hwid: updates.hwid,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'],
                performedBy: 'system'
            }
        });

        res.json({
            success: true,
            license: {
                id: license.id,
                licenseKey: license.licenseKey,
                type: license.type,
                status: 'ACTIVE',
                expirationDate: license.expirationDate,
                activationDate: updates.activationDate,
                activationCount: updates.activationCount
            }
        });
    } catch (error) {
        logger.error({ err: error.message }, 'License activation error');
        res.status(500).json({ error: 'Activation failed' });
    }
});

router.post('/verify', async (req, res) => {
    try {
        const { licenseKey, hwid, branchCode, machineId } = req.body;

        if (!licenseKey) {
            return res.status(400).json({ error: 'License key is required' });
        }

        const license = await prisma.license.findUnique({
            where: { licenseKey }
        });

        if (!license) {
            return res.status(404).json({ error: 'License not found', valid: false });
        }

        if (license.status !== 'ACTIVE') {
            return res.json({
                valid: false,
                status: license.status,
                message: 'License is not active'
            });
        }

        if (license.expirationDate && new Date() > license.expirationDate) {
            await prisma.license.update({
                where: { id: license.id },
                data: { status: 'EXPIRED' }
            });
            return res.json({
                valid: false,
                status: 'EXPIRED',
                message: 'License has expired'
            });
        }

        if (license.hwid && hwid && license.hwid !== hwid) {
            await prisma.licenseAudit.create({
                data: {
                    licenseId: license.id,
                    licenseKey: license.licenseKey,
                    action: 'HWID_MISMATCH',
                    branchCode,
                    hwid,
                    ipAddress: req.ip,
                    performedBy: 'system'
                }
            });
            return res.json({
                valid: false,
                message: 'Hardware ID mismatch'
            });
        }

        await prisma.license.update({
            where: { id: license.id },
            data: { 
                lastVerifiedAt: new Date(),
                branchCode: license.branchCode || branchCode,
                machineId: license.machineId || machineId
            }
        });

        await prisma.licenseAudit.create({
            data: {
                licenseId: license.id,
                licenseKey: license.licenseKey,
                action: 'VERIFIED',
                branchCode: license.branchCode || branchCode,
                hwid,
                ipAddress: req.ip,
                performedBy: 'system'
            }
        });

        res.json({
            valid: true,
            status: license.status,
            type: license.type,
            expirationDate: license.expirationDate,
            daysRemaining: license.expirationDate 
                ? Math.ceil((new Date(license.expirationDate) - new Date()) / (1000 * 60 * 60 * 24))
                : null
        });
    } catch (error) {
        logger.error({ err: error.message }, 'License verification error');
        res.status(500).json({ error: 'Verification failed', valid: false });
    }
});

router.post('/suspend', adminAuth, async (req, res) => {
    try {
        const { licenseKey, reason } = req.body;

        const license = await prisma.license.findUnique({
            where: { licenseKey }
        });

        if (!license) {
            return res.status(404).json({ error: 'License not found' });
        }

        await prisma.license.update({
            where: { id: license.id },
            data: { status: 'SUSPENDED' }
        });

        await prisma.licenseAudit.create({
            data: {
                licenseId: license.id,
                licenseKey: license.licenseKey,
                action: 'SUSPENDED',
                branchCode: license.branchCode,
                details: JSON.stringify({ reason }),
                performedBy: req.admin?.username || 'system'
            }
        });

        res.json({ success: true, message: 'License suspended' });
    } catch (error) {
        logger.error({ err: error.message }, 'License suspension error');
        res.status(500).json({ error: 'Failed to suspend license' });
    }
});

router.post('/revoke', adminAuth, async (req, res) => {
    try {
        const { licenseKey, reason } = req.body;

        const license = await prisma.license.findUnique({
            where: { licenseKey }
        });

        if (!license) {
            return res.status(404).json({ error: 'License not found' });
        }

        await prisma.license.update({
            where: { id: license.id },
            data: { status: 'REVOKED' }
        });

        await prisma.licenseAudit.create({
            data: {
                licenseId: license.id,
                licenseKey: license.licenseKey,
                action: 'REVOKED',
                branchCode: license.branchCode,
                details: JSON.stringify({ reason }),
                performedBy: req.admin?.username || 'system'
            }
        });

        res.json({ success: true, message: 'License revoked' });
    } catch (error) {
        logger.error({ err: error.message }, 'License revocation error');
        res.status(500).json({ error: 'Failed to revoke license' });
    }
});

router.get('/', async (req, res) => {
    try {
        const { status, branchCode, type } = req.query;

        const where = {};
        if (status) where.status = status;
        if (branchCode) where.branchCode = branchCode;
        if (type) where.type = type;

        const licenses = await prisma.license.findMany({
            where,
            orderBy: { createdAt: 'desc' }
        });

        res.json({ licenses });
    } catch (error) {
        logger.error({ err: error.message }, 'License list error');
        res.status(500).json({ error: 'Failed to list licenses' });
    }
});

router.get('/:licenseKey/audit', async (req, res) => {
    try {
        const { licenseKey } = req.params;

        const logs = await prisma.licenseAudit.findMany({
            where: { licenseKey },
            orderBy: { createdAt: 'desc' },
            take: 100
        });

        res.json({ logs });
    } catch (error) {
        logger.error({ err: error.message }, 'License audit error');
        res.status(500).json({ error: 'Failed to get audit logs' });
    }
});

module.exports = router;
