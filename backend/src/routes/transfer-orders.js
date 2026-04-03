const express = require('express');
const logger = require('../../utils/logger');
const router = express.Router();
const prisma = require('../db');
const { adminAuth } = require('../middleware/auth');

router.use(adminAuth);

router.get('/', async (req, res) => {
  try {
    const { branchId, status, type, q } = req.query;

    const where = {};
    if (branchId) where.fromBranchId = branchId;
    if (status) where.status = status;
    if (type) where.type = type;
    if (q) {
      where.OR = [
        { orderNumber: { contains: q } },
        { waybillNumber: { contains: q } },
        { driverName: { contains: q } },
        { notes: { contains: q } },
      ];
    }

    const orders = await prisma.transferOrder.findMany({
      where,
      include: {
        fromBranch: { select: { id: true, name: true, code: true } },
        toBranch: { select: { id: true, name: true, code: true } },
        items: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    res.json({ success: true, data: orders, total: orders.length });
  } catch (error) {
    logger.error('Failed to fetch transfer orders:', error);
    res.status(500).json({ error: 'Failed to fetch transfer orders' });
  }
});

router.get('/pending', async (req, res) => {
  try {
    const { branchId } = req.query;

    const where = { status: 'PENDING' };
    if (branchId) {
      where.OR = [{ fromBranchId: branchId }, { toBranchId: branchId }];
    }

    const orders = await prisma.transferOrder.findMany({
      where,
      include: {
        fromBranch: { select: { id: true, name: true } },
        toBranch: { select: { id: true, name: true } },
        items: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ success: true, data: orders, total: orders.length });
  } catch (error) {
    logger.error('Failed to fetch pending transfer orders:', error);
    res.status(500).json({ error: 'Failed to fetch pending transfer orders' });
  }
});

router.get('/pending-serials', async (req, res) => {
  try {
    const { branchId, type } = req.query;

    const where = { status: 'PENDING', isReceived: false };
    if (branchId) {
      where.transferOrder = {
        OR: [{ fromBranchId: branchId }, { toBranchId: branchId }],
      };
    }
    if (type) where.type = type;

    const items = await prisma.transferOrderItem.findMany({
      where,
      include: {
        transferOrder: {
          select: {
            orderNumber: true,
            fromBranch: { select: { name: true } },
            toBranch: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ success: true, data: items, total: items.length });
  } catch (error) {
    logger.error('Failed to fetch pending serials:', error);
    res.status(500).json({ error: 'Failed to fetch pending serials' });
  }
});

router.get('/stats/summary', async (req, res) => {
  try {
    const { branchId } = req.query;

    const where = {};
    if (branchId) {
      where.OR = [{ fromBranchId: branchId }, { toBranchId: branchId }];
    }

    const total = await prisma.transferOrder.count({ where });

    const statusCounts = await prisma.transferOrder.groupBy({
      by: ['status'],
      where,
      _count: true,
    });

    const typeCounts = await prisma.transferOrder.groupBy({
      by: ['type'],
      where,
      _count: true,
    });

    const pendingItems = await prisma.transferOrderItem.count({
      where: {
        isReceived: false,
        transferOrder: where,
      },
    });

    res.json({
      success: true,
      total,
      statusBreakdown: statusCounts.reduce((acc, s) => {
        acc[s.status] = s._count;
        return acc;
      }, {}),
      typeBreakdown: typeCounts.reduce((acc, t) => {
        acc[t.type] = t._count;
        return acc;
      }, {}),
      pendingItems,
    });
  } catch (error) {
    logger.error('Failed to fetch transfer order stats:', error);
    res.status(500).json({ error: 'Failed to fetch transfer order stats' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const order = await prisma.transferOrder.findUnique({
      where: { id },
      include: {
        fromBranch: true,
        toBranch: true,
        items: true,
      },
    });

    if (!order) {
      return res.status(404).json({ error: 'Transfer order not found' });
    }

    res.json({ success: true, data: order });
  } catch (error) {
    logger.error('Failed to fetch transfer order:', error);
    res.status(500).json({ error: 'Failed to fetch transfer order' });
  }
});

router.post('/', async (req, res) => {
  try {
    const {
      orderNumber,
      waybillNumber,
      fromBranchId,
      toBranchId,
      type,
      driverName,
      driverPhone,
      notes,
      createdBy,
      createdByName,
      createdByUserId,
      items,
    } = req.body;

    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.transferOrder.create({
        data: {
          orderNumber,
          waybillNumber,
          fromBranchId,
          toBranchId,
          type,
          driverName,
          driverPhone,
          notes,
          createdBy,
          createdByName,
          createdByUserId,
          status: 'PENDING',
        },
      });

      if (items && items.length > 0) {
        await tx.transferOrderItem.createMany({
          data: items.map((item) => ({
            transferOrderId: newOrder.id,
            serialNumber: item.serialNumber,
            type: item.type,
            model: item.model,
            manufacturer: item.manufacturer,
            notes: item.notes,
          })),
        });
      }

      return tx.transferOrder.findUnique({
        where: { id: newOrder.id },
        include: { items: true },
      });
    });

    res.status(201).json({ success: true, data: order });
  } catch (error) {
    logger.error('Failed to create transfer order:', error);
    res.status(500).json({ error: 'Failed to create transfer order' });
  }
});

router.post('/import', async (req, res) => {
  try {
    const ExcelJS = require('exceljs');

    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const file = req.files.file;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.data);
    const worksheet = workbook.getWorksheet(1);

    const items = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      items.push({
        serialNumber: row.getCell(1).value,
        type: row.getCell(2).value,
        model: row.getCell(3).value,
        manufacturer: row.getCell(4).value,
      });
    });

    res.json({ success: true, data: { items, count: items.length } });
  } catch (error) {
    logger.error('Failed to import transfer order:', error);
    res.status(500).json({ error: 'Failed to import transfer order' });
  }
});

router.post('/:id/receive', async (req, res) => {
  try {
    const { id } = req.params;
    const { receivedByUserId, receivedBy, receivedByName, items } = req.body;

    const order = await prisma.$transaction(async (tx) => {
      const updated = await tx.transferOrder.update({
        where: { id },
        data: {
          status: 'RECEIVED',
          receivedByUserId,
          receivedBy,
          receivedByName,
          receivedAt: new Date(),
        },
      });

      if (items && items.length > 0) {
        await Promise.all(
          items.map((item) =>
            tx.transferOrderItem.update({
              where: { id: item.id },
              data: { isReceived: true, receivedAt: new Date(), notes: item.notes },
            })
          )
        );
      }

      return updated;
    });

    res.json({ success: true, data: order });
  } catch (error) {
    logger.error('Failed to receive transfer order:', error);
    res.status(500).json({ error: 'Failed to receive transfer order' });
  }
});

router.post('/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;

    const order = await prisma.transferOrder.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectionReason,
      },
    });

    res.json({ success: true, data: order });
  } catch (error) {
    logger.error('Failed to reject transfer order:', error);
    res.status(500).json({ error: 'Failed to reject transfer order' });
  }
});

router.post('/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const order = await prisma.transferOrder.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        notes: notes ? `${order.notes || ''}\nCancelled: ${notes}` : undefined,
      },
    });

    res.json({ success: true, data: order });
  } catch (error) {
    logger.error('Failed to cancel transfer order:', error);
    res.status(500).json({ error: 'Failed to cancel transfer order' });
  }
});

module.exports = router;
