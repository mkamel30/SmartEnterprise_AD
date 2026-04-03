const express = require('express');
const logger = require('../../utils/logger');
const router = express.Router();
const prisma = require('../db');
const { adminAuth } = require('../middleware/auth');

router.use(adminAuth);

router.get('/stats', async (req, res) => {
  try {
    const { branchId, period, month, quarter, year } = req.query;

    const where = {};
    if (branchId) where.branchId = branchId;

    if (period === 'month' && month && year) {
      const start = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
      const end = new Date(parseInt(year, 10), parseInt(month, 10), 0, 23, 59, 59, 999);
      where.createdAt = { gte: start, lte: end };
    } else if (period === 'quarter' && quarter && year) {
      const startMonth = (parseInt(quarter, 10) - 1) * 3;
      const start = new Date(parseInt(year, 10), startMonth, 1);
      const end = new Date(parseInt(year, 10), startMonth + 3, 0, 23, 59, 59, 999);
      where.createdAt = { gte: start, lte: end };
    } else if (period === 'year' && year) {
      const start = new Date(parseInt(year, 10), 0, 1);
      const end = new Date(parseInt(year, 10), 11, 31, 23, 59, 59, 999);
      where.createdAt = { gte: start, lte: end };
    }

    const total = await prisma.maintenanceApproval.count({ where });

    const statusCounts = await prisma.maintenanceApproval.groupBy({
      by: ['status'],
      where,
      _count: true,
    });

    const costAggregation = await prisma.maintenanceApproval.aggregate({
      where: { ...where, status: 'APPROVED' },
      _sum: { cost: true },
      _avg: { cost: true },
      _min: { cost: true },
      _max: { cost: true },
    });

    const branchBreakdown = await prisma.maintenanceApproval.groupBy({
      by: ['branchId'],
      where,
      _count: true,
      _sum: { cost: true },
    });

    const branches = await Promise.all(
      branchBreakdown.map(async (b) => {
        const branch = b.branchId
          ? await prisma.branch.findUnique({
              where: { id: b.branchId },
              select: { id: true, name: true, code: true },
            })
          : null;
        return {
          branchId: b.branchId,
          branchName: branch?.name || 'Unknown',
          branchCode: branch?.code || '-',
          count: b._count,
          totalCost: b._sum.cost || 0,
        };
      })
    );

    res.json({
      success: true,
      total,
      statusBreakdown: statusCounts.reduce((acc, s) => {
        acc[s.status] = s._count;
        return acc;
      }, {}),
      totalApprovedCost: costAggregation._sum.cost || 0,
      avgApprovedCost: costAggregation._avg.cost || 0,
      minApprovedCost: costAggregation._min.cost || 0,
      maxApprovedCost: costAggregation._max.cost || 0,
      branchBreakdown: branches,
    });
  } catch (error) {
    logger.error('Failed to fetch maintenance approval stats:', error);
    res.status(500).json({ error: 'Failed to fetch maintenance approval stats' });
  }
});

module.exports = router;
