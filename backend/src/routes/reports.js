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

module.exports = router;
