const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { adminAuth } = require('../middleware/auth');

router.use(adminAuth);

// Get all payments with filters
router.get('/', async (req, res) => {
    try {
        const { branchId, type, startDate, endDate, search } = req.query;
        
        const where = {};
        
        // Branch filter
        if (branchId) {
            where.branchId = branchId;
        }
        
        // Type filter
        if (type && type !== 'ALL') {
            where.type = type;
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

        const payments = await prisma.payment.findMany({
            where,
            include: {
                branch: { select: { id: true, name: true } },
                customer: { select: { id: true, client_name: true, bkcode: true } },
                request: { select: { id: true, serialNumber: true } }
            },
            orderBy: { createdAt: 'desc' },
            take: 500
        });

        // Format response
        const formatted = payments.map(p => ({
            id: p.id,
            date: p.createdAt,
            branchId: p.branchId,
            branchName: p.branch?.name || '-',
            customerId: p.customerId,
            customerName: p.customerName || p.customer?.client_name || '-',
            customerCode: p.customer?.bkcode || '-',
            amount: p.amount,
            type: p.type || '-',
            reason: p.reason || '-',
            paymentPlace: p.paymentPlace || '-',
            receiptNumber: p.receiptNumber || '-',
            requestId: p.requestId
        }));

        // Search filter
        let filtered = formatted;
        if (search) {
            const s = search.toLowerCase();
            filtered = formatted.filter(p => 
                p.customerName.toLowerCase().includes(s) ||
                (p.receiptNumber && p.receiptNumber.toLowerCase().includes(s)) ||
                p.branchName.toLowerCase().includes(s)
            );
        }

        res.json({ success: true, data: filtered, total: filtered.length });
    } catch (error) {
        console.error('Failed to fetch payments:', error);
        res.status(500).json({ error: 'Failed to fetch payments' });
    }
});

// Export to Excel
router.get('/export', async (req, res) => {
    try {
        const { branchId, type, startDate, endDate } = req.query;
        
        const where = {};
        
        if (branchId) where.branchId = branchId;
        if (type && type !== 'ALL') where.type = type;
        
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                where.createdAt.lte = end;
            }
        }

        const payments = await prisma.payment.findMany({
            where,
            include: {
                branch: { select: { name: true } },
                customer: { select: { client_name: true, bkcode: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        const typeMap = {
            'INSTALLMENT': 'قسط',
            'MAINTENANCE': 'صيانة',
            'SALE': 'بيع',
            'EXCHANGE': 'استبدال',
            'REFUND': 'استرجاع',
            'OTHER': 'أخرى'
        };

        const data = payments.map(p => ({
            'التاريخ': new Date(p.createdAt).toLocaleString('ar-EG'),
            'الفرع': p.branch?.name || '-',
            'العميل': p.customerName || p.customer?.client_name || '-',
            'كود العميل': p.customer?.bkcode || '-',
            'المبلغ': p.amount,
            'النوع': typeMap[p.type] || p.type || '-',
            'السبب': p.reason || '-',
            'مكان الدفع': p.paymentPlace || '-',
            'رقم الايصال': p.receiptNumber || '-'
        }));

        res.json({ success: true, data, count: data.length });
    } catch (error) {
        console.error('Failed to export payments:', error);
        res.status(500).json({ error: 'Failed to export payments' });
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

        const [totalAmount, byType] = await Promise.all([
            prisma.payment.aggregate({
                where,
                _sum: { amount: true },
                _count: true
            }),
            prisma.payment.groupBy({
                by: ['type'],
                where,
                _sum: { amount: true },
                _count: true
            })
        ]);

        const typeMap = {
            'INSTALLMENT': 'قسط',
            'MAINTENANCE': 'صيانة',
            'SALE': 'بيع',
            'EXCHANGE': 'استبدال',
            'REFUND': 'استرجاع',
            'OTHER': 'أخرى'
        };

        const typeBreakdown = byType.reduce((acc, t) => {
            acc[typeMap[t.type] || t.type] = {
                count: t._count,
                amount: t._sum.amount || 0
            };
            return acc;
        }, {});

        res.json({
            success: true,
            totalPayments: totalAmount._count,
            totalAmount: totalAmount._sum.amount || 0,
            typeBreakdown
        });
    } catch (error) {
        console.error('Failed to fetch summary:', error);
        res.status(500).json({ error: 'Failed to fetch summary' });
    }
});

module.exports = router;