const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { adminAuth } = require('../middleware/auth');
const logger = require('../../utils/logger');

router.use(adminAuth);

router.get('/financial-summary', async (req, res) => {
    try {
        const branches = await prisma.branch.findMany({
            select: {
                id: true,
                name: true,
                _count: {
                    select: {
                        requests: true,
                        users: true,
                        customers: true,
                        posMachines: true,
                        warehouseMachines: true
                    }
                }
            }
        });

        const paymentAgg = await prisma.payment.groupBy({
            by: ['branchId'],
            _sum: { amount: true },
            _count: true
        });
        const paymentMap = {};
        paymentAgg.forEach(p => { paymentMap[p.branchId] = { total: p._sum.amount || 0, count: p._count }; });

        const summary = branches.map(b => ({
            branchId: b.id,
            branchName: b.name,
            revenue: paymentMap[b.id]?.total || 0,
            paymentCount: paymentMap[b.id]?.count || 0,
            requestCount: b._count.requests,
            userCount: b._count.users,
            customerCount: b._count.customers,
            machineCount: b._count.posMachines,
            stockCount: b._count.warehouseMachines
        }));

        const dailyRevenue = await prisma.payment.groupBy({
            by: ['createdAt'],
            _sum: { amount: true },
            where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
            orderBy: { createdAt: 'asc' }
        });

        res.json({
            branchBreakdown: summary,
            dailyRevenue,
            totalEnterpriseRevenue: summary.reduce((sum, b) => sum + b.revenue, 0)
        });
    } catch (error) {
        logger.error({ err: error.message }, 'Financial summary failed');
        res.status(500).json({ error: 'فشل في تحميل الملخص المالي' });
    }
});

router.get('/rankings', async (req, res) => {
    try {
        const branches = await prisma.branch.findMany({
            select: {
                id: true,
                name: true,
                _count: { select: { requests: true } }
            }
        });

        const paymentAgg = await prisma.payment.groupBy({
            by: ['branchId'],
            _sum: { amount: true }
        });
        const paymentMap = {};
        paymentAgg.forEach(p => { paymentMap[p.branchId] = p._sum.amount || 0; });

        const rankings = branches.map(b => ({
            id: b.id,
            name: b.name,
            totalRevenue: paymentMap[b.id] || 0,
            requestCount: b._count.requests
        })).sort((a, b) => b.totalRevenue - a.totalRevenue);

        res.json(rankings);
    } catch (error) {
        logger.error({ err: error.message }, 'Rankings failed');
        res.status(500).json({ error: 'فشل في تحميل الترتيب' });
    }
});

router.get('/inventory-valuation', async (req, res) => {
    try {
        const inventory = await prisma.branchSparePart.findMany({
            include: {
                part: { select: { name: true, defaultCost: true } },
                branch: { select: { name: true } }
            }
        });

        let totalValuation = 0;
        const branchValuation = {};

        inventory.forEach(item => {
            const cost = item.part?.defaultCost || 0;
            const val = (item.quantity || 0) * cost;
            totalValuation += val;
            
            const bName = item.branch?.name || 'Unknown';
            branchValuation[bName] = (branchValuation[bName] || 0) + val;
        });

        res.json({
            totalValuation,
            branchValuation,
            itemCount: inventory.length
        });
    } catch (error) {
        logger.error({ err: error.message }, 'Inventory valuation failed');
        res.status(500).json({ error: 'فشل في تقييم المخزون' });
    }
});

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

        const movements = await prisma.stockMovement.findMany({
            where,
            include: { branch: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'desc' },
            take: 500
        });

        res.json({ success: true, data: movements, total: movements.length });
    } catch (error) {
        logger.error('Movements report failed:', error);
        res.status(500).json({ error: 'Failed to fetch movements' });
    }
});

router.get('/performance', async (req, res) => {
    try {
        const { branchId, startDate, endDate } = req.query;
        const where = { status: 'Closed' };
        if (branchId) where.branchId = branchId;
        if (startDate || endDate) {
            where.closingTimestamp = {};
            if (startDate) where.closingTimestamp.gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                where.closingTimestamp.lte = end;
            }
        }

        const [requests, payments] = await Promise.all([
            prisma.maintenanceRequest.findMany({ 
                where, 
                select: { 
                    id: true, 
                    createdAt: true, 
                    closingTimestamp: true, 
                    totalCost: true,
                    usedParts: true,
                    branch: { select: { name: true } }
                } 
            }),
            prisma.payment.findMany({ 
                where: { 
                    ...(branchId ? { branchId } : {}),
                    ...(startDate ? { createdAt: { gte: new Date(startDate) } } : {}),
                    ...(endDate ? { createdAt: { lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)) } } : {})
                },
                select: { amount: true } 
            })
        ]);

        const totalRevenue = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
        const allDurations = requests.map(r => new Date(r.closingTimestamp).getTime() - new Date(r.createdAt).getTime()).filter(d => d > 0);
        const avgTimeMs = allDurations.length > 0 ? allDurations.reduce((s, d) => s + d, 0) / allDurations.length : 0;

        res.json({ 
            success: true, 
            totalRequests: requests.length, 
            totalRevenue,
            avgTimeToCompletionHours: (avgTimeMs / (1000 * 60 * 60)).toFixed(1),
            onTimeRate: requests.length > 0 ? Math.round((requests.filter(r => (new Date(r.closingTimestamp).getTime() - new Date(r.createdAt).getTime()) < 48 * 60 * 60 * 1000).length / requests.length) * 100) : 100
        });
    } catch (error) {
        logger.error('Performance report failed:', error);
        res.status(500).json({ error: 'Failed to fetch performance' });
    }
});

router.get('/executive', async (req, res) => {
    try {
        const { branchId, startDate, endDate } = req.query;
        const where = branchId ? { branchId } : {};

        const [branches, totalRevenue, totalRequests, totalCustomers] = await Promise.all([
            prisma.branch.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true, status: true } }),
            prisma.payment.aggregate({ where, _sum: { amount: true }, _count: true }),
            prisma.maintenanceRequest.count(where),
            prisma.customer.count(where)
        ]);

        res.json({
            success: true,
            branches,
            totalRevenue: totalRevenue._sum.amount || 0,
            totalRequests,
            totalCustomers
        });
    } catch (error) {
        logger.error('Executive report failed:', error);
        res.status(500).json({ error: 'Failed to fetch executive report' });
    }
});

router.get('/monthly-closing', async (req, res) => {
    try {
        const { month, branchId } = req.query;
        if (!month) return res.status(400).json({ error: 'Month is required' });

        const monthDate = new Date(month);
        const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
        const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59, 999);

        const where = { createdAt: { gte: start, lte: end } };
        if (branchId) where.branchId = branchId;

        const [payments, requests, sales] = await Promise.all([
            prisma.payment.aggregate({ where, _sum: { amount: true }, _count: true }),
            prisma.maintenanceRequest.count(where),
            prisma.machineSale.count({ where: { saleDate: { gte: start, lte: end }, ...(branchId ? { branchId } : {}) } })
        ]);

        res.json({
            success: true,
            month,
            totalRevenue: payments._sum.amount || 0,
            paymentCount: payments._count,
            requestCount: requests,
            salesCount: sales
        });
    } catch (error) {
        logger.error('Monthly closing failed:', error);
        res.status(500).json({ error: 'Failed to fetch monthly closing' });
    }
});

module.exports = router;
