const express = require('express');
const logger = require('../../utils/logger');
const router = express.Router();
const prisma = require('../db');
const { adminAuth } = require('../middleware/auth');

router.use(adminAuth);

// Get inventory for a specific branch
router.get('/', async (req, res) => {
    try {
        const { branchId } = req.query;
        if (!branchId) {
            return res.status(400).json({ error: 'branchId is required' });
        }

        // Fetch Spare Parts for the branch
        const stocks = await prisma.branchSparePart.findMany({
            where: { branchId },
            include: {
                part: true
            }
        });

        // Format to match what BranchInventoryModal expects (name, quantity)
        const formatted = stocks.map(s => ({
            id: s.id,
            name: s.part?.name || 'Unknown Part',
            partNumber: s.part?.partNumber || 'N/A',
            quantity: s.quantity
        }));

        res.json({ success: true, data: formatted });
    } catch (error) {
        logger.error('Failed to fetch branch inventory:', error);
        res.status(500).json({ error: 'Failed to fetch branch inventory' });
    }
});

// Get all branches inventory overview
router.get('/all', async (req, res) => {
    try {
        const { branchId } = req.query;
        
        const where = branchId ? { branchId } : {};
        
        const stocks = await prisma.branchSparePart.findMany({
            where,
            include: {
                branch: { select: { id: true, name: true } },
                part: { select: { id: true, name: true, partNumber: true, defaultCost: true } }
            },
            orderBy: [{ branch: { name: 'asc' } }, { part: { name: 'asc' } }]
        });

        const formatted = stocks.map(s => ({
            id: s.id,
            branchId: s.branchId,
            branchName: s.branch?.name || '-',
            partId: s.partId,
            partName: s.part?.name || '-',
            partNumber: s.part?.partNumber || '-',
            defaultCost: s.part?.defaultCost || 0,
            quantity: s.quantity,
            location: s.location || '-',
            minLevel: s.minLevel || 0,
            lastUpdated: s.lastUpdated
        }));

        res.json({ success: true, data: formatted, total: formatted.length });
    } catch (error) {
        logger.error('Failed to fetch all inventory:', error);
        res.status(500).json({ error: 'Failed to fetch all inventory' });
    }
});

// Export inventory to Excel
router.get('/export', async (req, res) => {
    try {
        const { branchId } = req.query;
        
        const where = branchId ? { branchId } : {};
        
        const stocks = await prisma.branchSparePart.findMany({
            where,
            include: {
                branch: { select: { name: true } },
                part: { select: { name: true, partNumber: true, defaultCost: true } }
            },
            orderBy: [{ branch: { name: 'asc' } }, { part: { name: 'asc' } }]
        });

        const data = stocks.map(s => ({
            'الفرع': s.branch?.name || '-',
            'اسم القطعة': s.part?.name || '-',
            'رقم القطعة': s.part?.partNumber || '-',
            'التكلفة': s.part?.defaultCost || 0,
            'الكمية': s.quantity,
            'الموقع': s.location || '-',
            'الحد الأدنى': s.minLevel || 0,
            'آخر تحديث': s.lastUpdated ? new Date(s.lastUpdated).toLocaleString('ar-EG') : '-'
        }));

        res.json({ success: true, data, count: data.length });
    } catch (error) {
        logger.error('Failed to export inventory:', error);
        res.status(500).json({ error: 'Failed to export inventory' });
    }
});

// Get inventory summary stats
router.get('/summary', async (req, res) => {
    try {
        const { branchId } = req.query;
        
        const where = branchId ? { branchId } : {};
        
        const [totalBranches, totalParts, totalQuantity] = await Promise.all([
            prisma.branch.count({ where: { isActive: true } }),
            prisma.branchSparePart.count({ where }),
            prisma.branchSparePart.aggregate({
                where,
                _sum: { quantity: true }
            })
        ]);

        res.json({
            success: true,
            totalBranches,
            totalParts,
            totalQuantity: totalQuantity._sum.quantity || 0
        });
    } catch (error) {
        logger.error('Failed to fetch summary:', error);
        res.status(500).json({ error: 'Failed to fetch summary' });
    }
});

module.exports = router;
