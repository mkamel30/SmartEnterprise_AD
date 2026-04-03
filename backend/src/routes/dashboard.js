const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { adminAuth } = require('../middleware/auth');
const logger = require('../../utils/logger');

router.use(adminAuth);

// GET /dashboard - Full dashboard stats
router.get('/', async (req, res) => {
    try {
        const { branchId, period } = req.query;
        const where = branchId ? { branchId } : {};

        const [
            usersCount,
            branchesCount,
            totalMachines,
            requestsCount,
            totalCustomers,
            totalRevenue
        ] = await Promise.all([
            prisma.user.count(),
            prisma.branch.count({ where: { isActive: true } }),
            prisma.posMachine.count(),
            prisma.maintenanceRequest.count({ where: { ...where, status: { in: ['NEW', 'IN_PROGRESS', 'PENDING_APPROVAL'] } } }),
            prisma.customer.count(where),
            prisma.payment.aggregate({ where, _sum: { amount: true } })
        ]);

        res.json({
            usersCount,
            branchesCount,
            totalMachines,
            requestsCount,
            totalCustomers,
            totalRevenue: totalRevenue._sum.amount || 0
        });
    } catch (error) {
        logger.error({ err: error.message }, 'Dashboard stats failed');
        res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
});

router.get('/stats', async (req, res) => {
    try {
        const [
            usersCount, 
            branchesCount, 
            totalMachines, 
            requestsCount
        ] = await Promise.all([
            prisma.user.count(),
            prisma.branch.count(),
            prisma.posMachine.count(),
            prisma.maintenanceRequest.count({ where: { status: 'Open' } })
        ]);
        const branchesWithPayments = await prisma.branch.findMany({
            include: { 
                _count: { select: { requests: true } },
                payments: { select: { amount: true } }
            }
        });

        const performanceData = branchesWithPayments.map(b => ({
            name: b.name,
            revenue: b.payments.reduce((sum, p) => sum + p.amount, 0),
            repairs: b._count.requests
        }));

        res.json({
            usersCount,
            branchesCount,
            totalMachines,
            dailyOps: requestsCount,
            systemHealth: 98,
            performanceData,
            recentActions: [
                { id: 1, action: 'Global Sync Completed', branch: 'System', time: 'Just Now' },
                { id: 2, action: 'Central Security Scan', branch: 'Security', time: '5m Ago' }
            ]
        });
    } catch (error) {
        logger.error({ err: error.message }, 'Dashboard stats failed');
        res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
});

router.get('/admin-summary', async (req, res) => {
    try {
        const [branches, totalUsers, totalCustomers, totalRequests] = await Promise.all([
            prisma.branch.findMany({
                select: { id: true, code: true, name: true, status: true, lastSeen: true },
                orderBy: { name: 'asc' }
            }),
            prisma.user.count(),
            prisma.customer.count(),
            prisma.maintenanceRequest.count({ where: { status: { in: ['NEW', 'IN_PROGRESS'] } } })
        ]);

        res.json({ branches, totalUsers, totalCustomers, totalRequests });
    } catch (error) {
        logger.error('Admin summary failed:', error);
        res.status(500).json({ error: 'Failed to fetch admin summary' });
    }
});

router.get('/admin-affairs-summary', async (req, res) => {
    try {
        const [pendingApprovals, overduePayments, activeTransfers] = await Promise.all([
            prisma.maintenanceRequest.count({ where: { status: 'PENDING_APPROVAL' } }),
            prisma.payment.count({ where: { status: 'OVERDUE' } }),
            prisma.stockMovement.count({ where: { status: 'IN_TRANSIT' } })
        ]);

        res.json({ pendingApprovals, overduePayments, activeTransfers });
    } catch (error) {
        logger.error('Admin affairs summary failed:', error);
        res.status(500).json({ error: 'Failed to fetch affairs summary' });
    }
});

router.get('/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) return res.json({ machines: [], customers: [] });

        const [machines, customers] = await Promise.all([
            prisma.posMachine.findMany({
                where: { serialNumber: { contains: q, mode: 'insensitive' } },
                select: { id: true, serialNumber: true, model: true },
                take: 10
            }),
            prisma.customer.findMany({
                where: { OR: [
                    { client_name: { contains: q, mode: 'insensitive' } },
                    { bkcode: { contains: q, mode: 'insensitive' } }
                ]},
                select: { id: true, client_name: true, bkcode: true },
                take: 10
            })
        ]);

        res.json({ machines, customers });
    } catch (error) {
        logger.error('Search failed:', error);
        res.status(500).json({ error: 'Search failed' });
    }
});

module.exports = router;
