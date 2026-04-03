const express = require('express');
const logger = require('../../utils/logger');
const router = express.Router();
const prisma = require('../db');
const { adminAuth } = require('../middleware/auth');

router.use(adminAuth);

router.get('/', async (req, res) => {
  try {
    const { startDate, endDate, branchId } = req.query;

    const dateWhere = {};
    if (startDate || endDate) {
      dateWhere.createdAt = {};
      if (startDate) dateWhere.createdAt.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateWhere.createdAt.lte = end;
      }
    }

    const branchWhere = branchId ? { branchId } : {};

    const [
      totalCustomers,
      totalMachines,
      totalRequests,
      totalPayments,
      totalTransferOrders,
      statusCounts,
      recentRequests,
      recentPayments,
      branchStats,
    ] = await Promise.all([
      prisma.customer.count(),
      prisma.posMachine.count(),
      prisma.maintenanceRequest.count({ where: dateWhere }),
      prisma.payment.aggregate({
        where: dateWhere,
        _sum: { amount: true },
        _count: true,
      }),
      prisma.transferOrder.count({ where: dateWhere }),
      prisma.maintenanceRequest.groupBy({
        by: ['status'],
        where: { ...dateWhere, ...branchWhere },
        _count: true,
      }),
      prisma.maintenanceRequest.findMany({
        where: { ...dateWhere, ...branchWhere },
        include: {
          branch: { select: { name: true } },
          customer: { select: { client_name: true, bkcode: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.payment.findMany({
        where: dateWhere,
        include: {
          branch: { select: { name: true } },
          customer: { select: { client_name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.branch.findMany({
        where: { isActive: true },
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          lastSeen: true,
          _count: {
            select: {
              customers: true,
              posMachines: true,
              requests: true,
              payments: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    res.json({
      success: true,
      data: {
        overview: {
          totalCustomers,
          totalMachines,
          totalRequests,
          totalPaymentAmount: totalPayments._sum.amount || 0,
          totalPaymentCount: totalPayments._count,
          totalTransferOrders,
        },
        statusBreakdown: statusCounts.reduce((acc, s) => {
          acc[s.status] = s._count;
          return acc;
        }, {}),
        recentRequests,
        recentPayments,
        branchStats,
      },
    });
  } catch (error) {
    logger.error('Failed to fetch executive dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch executive dashboard' });
  }
});

router.get('/branch/:branchId', async (req, res) => {
  try {
    const { branchId } = req.params;

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      include: {
        _count: {
          select: {
            customers: true,
            posMachines: true,
            requests: true,
            payments: true,
            users: true,
            simCards: true,
            warehouseMachines: true,
            warehouseSims: true,
          },
        },
      },
    });

    if (!branch) {
      return res.status(404).json({ error: 'Branch not found' });
    }

    const [
      requestStatusCounts,
      paymentTotal,
      recentRequests,
      recentPayments,
    ] = await Promise.all([
      prisma.maintenanceRequest.groupBy({
        by: ['status'],
        where: { branchId },
        _count: true,
      }),
      prisma.payment.aggregate({
        where: { branchId },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.maintenanceRequest.findMany({
        where: { branchId },
        include: {
          customer: { select: { client_name: true, bkcode: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.payment.findMany({
        where: { branchId },
        include: {
          customer: { select: { client_name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    res.json({
      success: true,
      data: {
        branch: {
          id: branch.id,
          code: branch.code,
          name: branch.name,
          address: branch.address,
          phone: branch.phone,
          type: branch.type,
          isActive: branch.isActive,
          status: branch.status,
          lastSeen: branch.lastSeen,
          managerEmail: branch.managerEmail,
        },
        counts: branch._count,
        requestStatusBreakdown: requestStatusCounts.reduce((acc, s) => {
          acc[s.status] = s._count;
          return acc;
        }, {}),
        totalPaymentAmount: paymentTotal._sum.amount || 0,
        totalPaymentCount: paymentTotal._count,
        recentRequests,
        recentPayments,
      },
    });
  } catch (error) {
    logger.error('Failed to fetch branch detail:', error);
    res.status(500).json({ error: 'Failed to fetch branch detail' });
  }
});

module.exports = router;
