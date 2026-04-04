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

// Get lite inventory for dropdowns
router.get('/lite', async (req, res) => {
    try {
        const { search } = req.query;
        const where = {};
        if (search) {
            where.OR = [
                { part: { name: { contains: search, mode: 'insensitive' } } },
                { part: { partNumber: { contains: search, mode: 'insensitive' } } }
            ];
        }

        const items = await prisma.branchSparePart.findMany({
            where,
            include: { part: { select: { name: true, partNumber: true } } },
            orderBy: { part: { name: 'asc' } },
            take: 200
        });

        res.json(items);
    } catch (error) {
        logger.error('Failed to fetch lite inventory:', error);
        res.status(500).json({ error: 'Failed to fetch inventory' });
    }
});

// Update inventory quantity
router.put('/:id', async (req, res) => {
    try {
        const { quantity } = req.body;
        const item = await prisma.branchSparePart.update({
            where: { id: req.params.id },
            data: { quantity, lastUpdated: new Date() }
        });
        res.json(item);
    } catch (error) {
        logger.error('Failed to update inventory:', error);
        res.status(500).json({ error: 'Failed to update inventory' });
    }
});

// Transfer inventory between branches
router.post('/transfer', async (req, res) => {
    try {
        const { partId, quantity, fromBranchId, toBranchId, reason } = req.body;

        if (!partId || !quantity || !fromBranchId || !toBranchId) {
            return res.status(400).json({ error: 'All fields required' });
        }

        await prisma.$transaction(async (tx) => {
            const from = await tx.branchSparePart.findFirst({ where: { branchId: fromBranchId, partId } });
            if (!from || from.quantity < quantity) {
                throw new Error('Insufficient stock');
            }

            await tx.branchSparePart.update({
                where: { id: from.id },
                data: { quantity: { decrement: quantity } }
            });

            let to = await tx.branchSparePart.findFirst({ where: { branchId: toBranchId, partId } });
            if (to) {
                await tx.branchSparePart.update({
                    where: { id: to.id },
                    data: { quantity: { increment: quantity } }
                });
            } else {
                await tx.branchSparePart.create({
                    data: { branchId: toBranchId, partId, quantity }
                });
            }
        });

        res.json({ success: true, message: 'Transfer completed' });
    } catch (error) {
        logger.error('Transfer failed:', error);
        res.status(500).json({ error: error.message || 'Transfer failed' });
    }
});

// Spare parts report: current stock + outgoing items
router.get('/spare-parts-report', async (req, res) => {
    try {
        const { branchId } = req.query;

        // 1. Current spare parts count (quantity > 0)
        const whereStock = branchId ? { branchId } : {};
        whereStock.quantity = { gt: 0 };

        const sparePartsStock = await prisma.branchSparePart.findMany({
            where: whereStock,
            include: {
                branch: { select: { id: true, code: true, name: true } },
                part: { select: { id: true, name: true, partNumber: true, defaultCost: true } }
            }
        });

        // 2. Spare parts out (type = 'OUT' or 'USED')
        const whereMovement = branchId ? { branchId } : {};
        whereMovement.type = { in: ['OUT', 'USED'] };

        const sparePartsOut = await prisma.stockMovement.findMany({
            where: whereMovement,
            include: {
                branch: { select: { id: true, code: true, name: true } },
                part: { select: { id: true, name: true, partNumber: true } },
                customer: { select: { client_name: true, bkcode: true } },
                request: { select: { id: true, serialNumber: true, machineModel: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Format outgoing items
        const formattedOut = sparePartsOut.map(m => ({
            id: m.id,
            date: m.createdAt,
            clientName: m.customer?.client_name || m.customerName || '-',
            clientCode: m.customer?.bkcode || '-',
            terminalSerial: m.machineSerial || m.request?.serialNumber || '-',
            terminalModel: m.machineModel || m.request?.machineModel || '-',
            partCode: m.part?.partNumber || '-',
            partName: m.part?.name || '-',
            quantity: m.quantity,
            isPaid: m.isPaid || false,
            paymentPlace: m.paymentPlace || '-',
            receiptNumber: m.receiptNumber || '-',
            performedBy: m.performedBy || '-',
            branchName: m.branch?.name || '-',
            branchCode: m.branch?.code || '-'
        }));

        res.json({
            success: true,
            currentStock: {
                totalItems: sparePartsStock.length,
                totalQuantity: sparePartsStock.reduce((sum, s) => sum + s.quantity, 0),
                items: sparePartsStock.map(s => ({
                    id: s.id,
                    branchId: s.branchId,
                    branchCode: s.branch?.code || '-',
                    branchName: s.branch?.name || '-',
                    partId: s.partId,
                    partCode: s.part?.partNumber || '-',
                    partName: s.part?.name || '-',
                    quantity: s.quantity,
                    defaultCost: s.part?.defaultCost || 0
                }))
            },
            outgoingItems: {
                total: sparePartsOut.length,
                items: formattedOut
            }
        });
    } catch (error) {
        logger.error('Failed to generate spare parts report:', error);
        res.status(500).json({ error: 'Failed to generate spare parts report' });
    }
});

module.exports = router;
