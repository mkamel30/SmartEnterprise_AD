const express = require('express');
const logger = require('../../utils/logger');
const router = express.Router();
const prisma = require('../db');
const { adminAuth } = require('../middleware/auth');

router.use(adminAuth);

// Get all SIM cards with filters
router.get('/', async (req, res) => {
    try {
        const { branchId, type, networkType } = req.query;
        
        const where = {};
        if (branchId) where.branchId = branchId;
        if (type && type !== 'ALL') where.type = type;
        if (networkType && networkType !== 'ALL') where.networkType = networkType;

        const simCards = await prisma.simCard.findMany({
            where,
            include: {
                branch: { select: { id: true, name: true } },
                customer: { select: { id: true, client_name: true, bkcode: true } }
            },
            orderBy: { id: 'desc' },
            take: 500
        });

        const formatted = simCards.map(s => ({
            id: s.id,
            serialNumber: s.serialNumber,
            type: s.type || '-',
            networkType: s.networkType || '-',
            branchId: s.branchId,
            branchName: s.branch?.name || '-',
            customerId: s.customerId,
            customerName: s.customer?.client_name || '-',
            customerCode: s.customer?.bkcode || '-'
        }));

        res.json({ success: true, data: formatted, total: formatted.length });
    } catch (error) {
        logger.error('Failed to fetch SIM cards:', error);
        res.status(500).json({ error: 'Failed to fetch SIM cards' });
    }
});

// Get SIM movement logs
router.get('/movements', async (req, res) => {
    try {
        const { branchId, startDate, endDate } = req.query;
        
        const where = {};
        if (branchId) where.branchId = branchId;
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                where.createdAt.lte = end;
            }
        }

        const movements = await prisma.simMovementLog.findMany({
            where,
            include: {
                branch: { select: { id: true, name: true } }
            },
            orderBy: { createdAt: 'desc' },
            take: 500
        });

        const formatted = movements.map(m => ({
            id: m.id,
            date: m.createdAt,
            branchId: m.branchId,
            branchName: m.branch?.name || '-',
            simId: m.simId,
            serialNumber: m.serialNumber,
            action: m.action,
            details: m.details,
            performedBy: m.performedBy || '-'
        }));

        res.json({ success: true, data: formatted, total: formatted.length });
    } catch (error) {
        logger.error('Failed to fetch SIM movements:', error);
        res.status(500).json({ error: 'Failed to fetch SIM movements' });
    }
});

// Get summary stats
router.get('/summary', async (req, res) => {
    try {
        const { branchId } = req.query;
        const where = branchId ? { branchId } : {};

        const [totalSims, byType, byNetwork] = await Promise.all([
            prisma.simCard.count({ where }),
            prisma.simCard.groupBy({ by: ['type'], where, _count: true }),
            prisma.simCard.groupBy({ by: ['networkType'], where, _count: true })
        ]);

        res.json({
            success: true,
            totalSims,
            byType: byType.reduce((acc, t) => { acc[t.type || 'Unknown'] = t._count; return acc; }, {}),
            byNetwork: byNetwork.reduce((acc, n) => { acc[n.networkType || 'Unknown'] = n._count; return acc; }, {})
        });
    } catch (error) {
        logger.error('Failed to fetch SIM summary:', error);
        res.status(500).json({ error: 'Failed to fetch SIM summary' });
    }
});

module.exports = router;