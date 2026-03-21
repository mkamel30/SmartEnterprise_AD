const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { adminAuth } = require('../middleware/auth');

router.use(adminAuth);

// Consolidated Financial Overview
router.get('/financial-summary', async (req, res) => {
    try {
        const branches = await prisma.branch.findMany({
            include: {
                payments: true,
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

        const summary = branches.map(b => {
             const totalRevenue = b.payments.reduce((sum, p) => sum + p.amount, 0);
             return {
                 branchId: b.id,
                 branchName: b.name,
                 revenue: totalRevenue,
                 requestCount: b._count.requests,
                 userCount: b._count.users,
                 customerCount: b._count.customers,
                  machineCount: b._count.posMachines,
                  stockCount: b._count.warehouseMachines
             };
        });

        // Group by Date for enterprise-wide revenue chart (Last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const dailyRevenue = await prisma.payment.groupBy({
            by: ['createdAt'],
            _sum: {
                amount: true
            },
            where: {
                createdAt: {
                    gte: thirtyDaysAgo
                }
            }
        });

        res.json({
            branchBreakdown: summary,
            dailyRevenue,
            totalEnterpriseRevenue: summary.reduce((sum, b) => sum + b.revenue, 0)
        });
    } catch (error) {
        console.error('Financial summary failed:', error);
        res.status(500).json({ error: 'Failed' });
    }
});

// Branch Performance Rankings
router.get('/rankings', async (req, res) => {
    try {
        const branches = await prisma.branch.findMany({
            include: {
                _count: { select: { requests: true, payments: true } },
                payments: { select: { amount: true } }
            }
        });

        const rankings = branches.map(b => ({
            id: b.id,
            name: b.name,
            totalRevenue: b.payments.reduce((sum, p) => sum + p.amount, 0),
            requestCount: b._count.requests
        })).sort((a, b) => b.totalRevenue - a.totalRevenue);

        res.json(rankings);
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

// Inventory Valuation (Across all branches)
router.get('/inventory-valuation', async (req, res) => {
    try {
        const inventory = await prisma.inventoryItem.findMany({
            include: {
                part: { select: { defaultCost: true } },
                branch: { select: { name: true } }
            }
        });

        let totalValuation = 0;
        const branchValuation = {};

        inventory.forEach(item => {
            const val = (item.quantity || 0) * (item.part?.defaultCost || 0);
            totalValuation += val;
            
            const bName = item.branch?.name || 'Unknown';
            branchValuation[bName] = (branchValuation[bName] || 0) + val;
        });

        res.json({
            totalValuation,
            branchValuation
        });
    } catch (error) {
        console.error('Inventory valuation failed:', error);
        res.status(500).json({ error: 'Failed' });
    }
});

module.exports = router;
