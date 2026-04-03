const express = require('express');
const logger = require('../../utils/logger');
const router = express.Router();
const prisma = require('../db');
const { adminAuth } = require('../middleware/auth');

router.use(adminAuth);

const VALID_TRANSITIONS = {
  NEW: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['PENDING_APPROVAL', 'PENDING_PARTS', 'CLOSED'],
  PENDING_APPROVAL: ['IN_PROGRESS', 'CANCELLED'],
  PENDING_PARTS: ['IN_PROGRESS', 'CANCELLED'],
  CLOSED: [],
  CANCELLED: [],
  Open: ['ASSIGNED', 'IN_PROGRESS', 'CLOSED'],
};

router.post('/:id/transition', async (req, res) => {
  try {
    const { id } = req.params;
    const { targetStatus, notes, payload } = req.body;

    const request = await prisma.maintenanceRequest.findUnique({
      where: { id },
      include: {
        branch: { select: { name: true } },
        customer: { select: { client_name: true, bkcode: true } },
      },
    });

    if (!request) {
      return res.status(404).json({ error: 'Maintenance request not found' });
    }

    const allowedTransitions = VALID_TRANSITIONS[request.status] || [];
    if (!allowedTransitions.includes(targetStatus)) {
      return res.status(400).json({
        error: `Invalid transition from ${request.status} to ${targetStatus}`,
        allowedTransitions,
      });
    }

    const updateData = { status: targetStatus };

    if (notes) {
      updateData.notes = request.notes
        ? `${request.notes}\n[${targetStatus}] ${notes}`
        : `[${targetStatus}] ${notes}`;
    }

    if (targetStatus === 'CLOSED') {
      updateData.closingTimestamp = new Date();
      if (payload?.actionTaken) updateData.actionTaken = payload.actionTaken;
      if (payload?.usedParts) updateData.usedParts = JSON.stringify(payload.usedParts);
      if (payload?.receiptNumber) updateData.receiptNumber = payload.receiptNumber;
      if (payload?.totalCost !== undefined) updateData.totalCost = payload.totalCost;
      if (payload?.closingUserId) updateData.closingUserId = payload.closingUserId;
      if (payload?.closingUserName) updateData.closingUserName = payload.closingUserName;
    }

    if (targetStatus === 'ASSIGNED' && payload?.technicianId) {
      updateData.technicianId = payload.technicianId;
      updateData.technician = payload.technician;
    }

    const updated = await prisma.maintenanceRequest.update({
      where: { id },
      data: updateData,
      include: {
        branch: { select: { name: true } },
        customer: { select: { client_name: true, bkcode: true } },
      },
    });

    await prisma.systemLog.create({
      data: {
        entityType: 'MaintenanceRequest',
        entityId: id,
        action: `STATUS_CHANGE: ${request.status} -> ${targetStatus}`,
        details: notes || `Status changed via workflow`,
        performedBy: payload?.performedBy,
      },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    logger.error('Failed to transition machine state:', error);
    res.status(500).json({ error: 'Failed to transition machine state' });
  }
});

module.exports = router;
