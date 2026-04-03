const express = require('express');
const logger = require('../../utils/logger');
const router = express.Router();
const prisma = require('../db');
const { adminAuth } = require('../middleware/auth');

router.use(adminAuth);

// Get all stock movements with filters
router.get('/', async (req, res) => {
    try {
        const { branchId, startDate, endDate, type, search } = req.query;
        
        const where = {};
        
        // Branch filter
        if (branchId) {
            where.branchId = branchId;
        }
        
        // Date filter
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                where.createdAt.lte = end;
            }
        }
        
        // Type filter
        if (type && type !== 'ALL') {
            where.type = type;
        }

        const movements = await prisma.stockMovement.findMany({
            where,
            include: {
                branch: { select: { id: true, name: true } },
                part: { select: { id: true, name: true, partNumber: true } },
                request: { select: { id: true, serialNumber: true } }
            },
            orderBy: { createdAt: 'desc' },
            take: 500
        });

        // Format response
        const formatted = movements.map(m => ({
            id: m.id,
            date: m.createdAt,
            branchId: m.branchId,
            branchName: m.branch?.name || '-',
            partId: m.partId,
            partName: m.part?.name || '-',
            partNumber: m.part?.partNumber || '-',
            type: m.type,
            quantity: m.quantity,
            reason: m.reason || '-',
            performedBy: m.performedBy || '-',
            customerId: m.customerId,
            customerName: m.customerName,
            machineSerial: m.machineSerial,
            machineModel: m.machineModel,
            paymentPlace: m.paymentPlace,
            isPaid: m.isPaid || false,
            receiptNumber: m.receiptNumber
        }));

        // Search filter (client-side for now)
        let filtered = formatted;
        if (search) {
            const s = search.toLowerCase();
            filtered = formatted.filter(m => 
                m.partName.toLowerCase().includes(s) ||
                m.partNumber.toLowerCase().includes(s) ||
                m.branchName.toLowerCase().includes(s) ||
                (m.customerName && m.customerName.toLowerCase().includes(s))
            );
        }

        res.json({ success: true, data: filtered, total: filtered.length });
    } catch (error) {
        logger.error('Failed to fetch stock movements:', error);
        res.status(500).json({ error: 'Failed to fetch stock movements' });
    }
});

// Export to Excel
router.get('/export', async (req, res) => {
    try {
        const { branchId, startDate, endDate, type } = req.query;
        
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
        
        if (type && type !== 'ALL') where.type = type;

        const movements = await prisma.stockMovement.findMany({
            where,
            include: {
                branch: { select: { name: true } },
                part: { select: { name: true, partNumber: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        const data = movements.map(m => ({
            'التاريخ': new Date(m.createdAt).toLocaleString('ar-EG'),
            'الفرع': m.branch?.name || '-',
            'اسم القطعة': m.part?.name || '-',
            'رقم القطعة': m.part?.partNumber || '-',
            'النوع': m.type === 'IN' ? 'دخول' : 'خروج',
            'الكمية': m.quantity,
            'السبب': m.reason || '-',
            'بواسطة': m.performedBy || '-',
            'العميل': m.customerName || '-',
            'ماكينة العميل': m.machineSerial || '-',
            'موديل الماكينة': m.machineModel || '-',
            'مكان الدفع': m.paymentPlace || '-',
            'مقابل': m.isPaid ? 'نعم' : 'لا',
            'رقم الإيصال': m.receiptNumber || '-'
        }));

        res.json({ success: true, data, count: data.length });
    } catch (error) {
        logger.error('Failed to export stock movements:', error);
        res.status(500).json({ error: 'Failed to export stock movements' });
    }
});

// Get summary stats
router.get('/summary', async (req, res) => {
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

        const [totalIn, totalOut, totalMovements] = await Promise.all([
            prisma.stockMovement.aggregate({
                where: { ...where, type: 'IN' },
                _sum: { quantity: true },
                _count: true
            }),
            prisma.stockMovement.aggregate({
                where: { ...where, type: 'OUT' },
                _sum: { quantity: true },
                _count: true
            }),
            prisma.stockMovement.count({ where })
        ]);

        res.json({
            success: true,
            totalMovements,
            totalIn: totalIn._sum.quantity || 0,
            totalOut: totalOut._sum.quantity || 0,
            inCount: totalIn._count,
            outCount: totalOut._count
        });
    } catch (error) {
        logger.error('Failed to fetch summary:', error);
        res.status(500).json({ error: 'Failed to fetch summary' });
    }
});

module.exports = router;