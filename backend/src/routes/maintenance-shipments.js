const express = require('express');
const logger = require('../../utils/logger');
const router = express.Router();
const prisma = require('../db');
const { adminAuth } = require('../middleware/auth');

router.use(adminAuth);

router.get('/shipments', async (req, res) => {
  try {
    const { status } = req.query;

    const where = {};
    if (status) where.status = status;

    const shipments = await prisma.transferOrder.findMany({
      where: {
        ...where,
        type: 'MAINTENANCE',
      },
      include: {
        fromBranch: { select: { id: true, name: true, code: true } },
        toBranch: { select: { id: true, name: true, code: true } },
        items: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    res.json({ success: true, data: shipments, total: shipments.length });
  } catch (error) {
    logger.error('Failed to fetch maintenance shipments:', error);
    res.status(500).json({ error: 'Failed to fetch maintenance shipments' });
  }
});

router.post('/shipments/:id/receive', async (req, res) => {
  try {
    const { id } = req.params;
    const { receivedByUserId, receivedBy, receivedByName, items } = req.body;

    const shipment = await prisma.$transaction(async (tx) => {
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

      for (const item of items || []) {
        if (item.serialNumber) {
          const warehouseMachine = await tx.warehouseMachine.findUnique({
            where: { serialNumber: item.serialNumber },
          });

          if (warehouseMachine) {
            await tx.warehouseMachine.update({
              where: { serialNumber: item.serialNumber },
              data: {
                branchId: updated.toBranchId,
                status: 'RECEIVED',
              },
            });
          }
        }
      }

      return updated;
    });

    res.json({ success: true, data: shipment });
  } catch (error) {
    logger.error('Failed to receive maintenance shipment:', error);
    res.status(500).json({ error: 'Failed to receive maintenance shipment' });
  }
});

module.exports = router;
