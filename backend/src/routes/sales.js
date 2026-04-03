const express = require('express');
const logger = require('../../utils/logger');
const router = express.Router();
const prisma = require('../db');
const { adminAuth } = require('../middleware/auth');

router.use(adminAuth);

// Get all machine sales with filters
router.get('/', async (req, res) => {
    try {
        const { branchId, type, startDate, endDate } = req.query;
        
        const where = {};
        if (branchId) where.branchId = branchId;
        if (type && type !== 'ALL') where.type = type;
        if (startDate || endDate) {
            where.saleDate = {};
            if (startDate) where.saleDate.gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                where.saleDate.lte = end;
            }
        }

        const sales = await prisma.machineSale.findMany({
            where,
            include: {
                branch: { select: { id: true, name: true } },
                customer: { select: { id: true, client_name: true, bkcode: true } },
                installments: true
            },
            orderBy: { saleDate: 'desc' },
            take: 500
        });

        const formatted = sales.map(s => ({
            id: s.id,
            saleDate: s.saleDate,
            branchId: s.branchId,
            branchName: s.branch?.name || '-',
            customerId: s.customerId,
            customerName: s.customer?.client_name || '-',
            customerCode: s.customer?.bkcode || '-',
            serialNumber: s.serialNumber,
            type: s.type,
            totalPrice: s.totalPrice,
            paidAmount: s.paidAmount,
            remaining: s.totalPrice - s.paidAmount,
            status: s.status,
            installments: s.installments || [],
            notes: s.notes
        }));

        res.json({ success: true, data: formatted, total: formatted.length });
    } catch (error) {
        logger.error('Failed to fetch sales:', error);
        res.status(500).json({ error: 'Failed to fetch sales' });
    }
});

// Get overdue installments
router.get('/overdue-installments', async (req, res) => {
    try {
        const { branchId } = req.query;
        const now = new Date();

        const where = {
            isPaid: false,
            dueDate: { lt: now }
        };
        if (branchId) where.branchId = branchId;

        const installments = await prisma.installment.findMany({
            where,
            include: {
                branch: { select: { id: true, name: true } },
                sale: {
                    include: {
                        customer: { select: { client_name: true, bkcode: true } }
                    }
                }
            },
            orderBy: { dueDate: 'asc' }
        });

        const formatted = installments.map(i => ({
            id: i.id,
            dueDate: i.dueDate,
            amount: i.amount,
            branchId: i.branchId,
            branchName: i.branch?.name || '-',
            saleId: i.saleId,
            customerName: i.sale?.customer?.client_name || '-',
            customerCode: i.sale?.customer?.bkcode || '-',
            serialNumber: i.sale?.serialNumber || '-',
            daysOverdue: Math.floor((now - new Date(i.dueDate)) / (1000 * 60 * 60 * 24)),
            paidAmount: i.paidAmount || 0,
            receiptNumber: i.receiptNumber || '-'
        }));

        const totalOverdue = formatted.reduce((sum, i) => sum + (i.amount - i.paidAmount), 0);

        res.json({ success: true, data: formatted, total: formatted.length, totalOverdue });
    } catch (error) {
        logger.error('Failed to fetch overdue installments:', error);
        res.status(500).json({ error: 'Failed to fetch overdue installments' });
    }
});

// Get summary stats
router.get('/summary', async (req, res) => {
    try {
        const { branchId, startDate, endDate } = req.query;
        
        const where = {};
        if (branchId) where.branchId = branchId;
        if (startDate || endDate) {
            where.saleDate = {};
            if (startDate) where.saleDate.gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                where.saleDate.lte = end;
            }
        }

        const [totalSales, cashSales, installmentSales] = await Promise.all([
            prisma.machineSale.aggregate({ where, _sum: { totalPrice: true }, _count: true }),
            prisma.machineSale.aggregate({ where: { ...where, type: 'CASH' }, _sum: { totalPrice: true }, _count: true }),
            prisma.machineSale.aggregate({ where: { ...where, type: 'INSTALLMENT' }, _sum: { totalPrice: true }, _count: true })
        ]);

        res.json({
            success: true,
            totalSales: totalSales._count,
            totalRevenue: totalSales._sum.totalPrice || 0,
            cashSales: cashSales._count,
            cashRevenue: cashSales._sum.totalPrice || 0,
            installmentSales: installmentSales._count,
            installmentRevenue: installmentSales._sum.totalPrice || 0
        });
    } catch (error) {
        logger.error('Failed to fetch summary:', error);
        res.status(500).json({ error: 'Failed to fetch summary' });
    }
});

module.exports = router;