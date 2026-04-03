const express = require('express');
const logger = require('../../utils/logger');
const router = express.Router();
const prisma = require('../db');
const { adminAuth } = require('../middleware/auth');

router.use(adminAuth);

router.get('/machines', async (req, res) => {
  try {
    const { status, technicianId, branchId, search } = req.query;

    const where = {};
    if (status) where.status = status;
    if (technicianId) where.technicianId = technicianId;
    if (branchId) where.branchId = branchId;

    const machines = await prisma.warehouseMachine.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true } },
        customer: { select: { id: true, client_name: true, bkcode: true } },
        maintenanceRequest: { select: { id: true, status: true, description: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });

    let filtered = machines;
    if (search) {
      const s = search.toLowerCase();
      filtered = machines.filter(
        (m) =>
          m.serialNumber.toLowerCase().includes(s) ||
          (m.model || '').toLowerCase().includes(s) ||
          (m.customer?.client_name || '').toLowerCase().includes(s) ||
          (m.notes || '').toLowerCase().includes(s)
      );
    }

    res.json({ success: true, data: filtered, total: filtered.length });
  } catch (error) {
    logger.error('Failed to fetch maintenance machines:', error);
    res.status(500).json({ error: 'Failed to fetch maintenance machines' });
  }
});

router.get('/machines/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const machine = await prisma.warehouseMachine.findUnique({
      where: { id },
      include: {
        branch: true,
        customer: true,
        maintenanceRequest: true,
      },
    });

    if (!machine) {
      return res.status(404).json({ error: 'Machine not found' });
    }

    res.json({ success: true, data: machine });
  } catch (error) {
    logger.error('Failed to fetch maintenance machine:', error);
    res.status(500).json({ error: 'Failed to fetch maintenance machine' });
  }
});

router.get('/machines/by-serial/:serial', async (req, res) => {
  try {
    const { serial } = req.params;

    const machine = await prisma.warehouseMachine.findUnique({
      where: { serialNumber: serial },
      include: {
        branch: true,
        customer: true,
        maintenanceRequest: true,
      },
    });

    if (!machine) {
      return res.status(404).json({ error: 'Machine not found' });
    }

    res.json({ success: true, data: machine });
  } catch (error) {
    logger.error('Failed to fetch machine by serial:', error);
    res.status(500).json({ error: 'Failed to fetch machine by serial' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const total = await prisma.warehouseMachine.count();

    const statusCounts = await prisma.warehouseMachine.groupBy({
      by: ['status'],
      _count: true,
    });

    const modelCounts = await prisma.warehouseMachine.groupBy({
      by: ['model'],
      _count: true,
    });

    const recentReturns = await prisma.warehouseMachine.findMany({
      where: { status: 'RETURNED' },
      orderBy: { importDate: 'desc' },
      take: 10,
      include: {
        branch: { select: { name: true } },
        customer: { select: { client_name: true } },
      },
    });

    res.json({
      success: true,
      total,
      statusBreakdown: statusCounts.reduce((acc, s) => {
        acc[s.status] = s._count;
        return acc;
      }, {}),
      modelBreakdown: modelCounts.reduce((acc, m) => {
        acc[m.model || 'Unknown'] = m._count;
        return acc;
      }, {}),
      recentReturns,
    });
  } catch (error) {
    logger.error('Failed to fetch maintenance stats:', error);
    res.status(500).json({ error: 'Failed to fetch maintenance stats' });
  }
});

router.get('/pending-approvals', async (req, res) => {
  try {
    const approvals = await prisma.maintenanceApproval.findMany({
      where: { status: 'PENDING' },
      include: {
        request: {
          include: {
            customer: { select: { client_name: true, bkcode: true } },
            branch: { select: { name: true } },
          },
        },
        branch: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ success: true, data: approvals, total: approvals.length });
  } catch (error) {
    logger.error('Failed to fetch pending approvals:', error);
    res.status(500).json({ error: 'Failed to fetch pending approvals' });
  }
});

router.get('/branch-machines/:branchId', async (req, res) => {
  try {
    const { branchId } = req.params;

    const machines = await prisma.warehouseMachine.findMany({
      where: { branchId },
      include: {
        branch: true,
        customer: true,
        maintenanceRequest: true,
      },
      orderBy: { serialNumber: 'asc' },
    });

    res.json({ success: true, data: machines, total: machines.length });
  } catch (error) {
    logger.error('Failed to fetch branch machines:', error);
    res.status(500).json({ error: 'Failed to fetch branch machines' });
  }
});

router.get('/branch-machines/:branchId/summary', async (req, res) => {
  try {
    const { branchId } = req.params;

    const total = await prisma.warehouseMachine.count({ where: { branchId } });

    const statusCounts = await prisma.warehouseMachine.groupBy({
      by: ['status'],
      where: { branchId },
      _count: true,
    });

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, name: true, code: true },
    });

    res.json({
      success: true,
      branch,
      total,
      statusBreakdown: statusCounts.reduce((acc, s) => {
        acc[s.status] = s._count;
        return acc;
      }, {}),
    });
  } catch (error) {
    logger.error('Failed to fetch branch machine summary:', error);
    res.status(500).json({ error: 'Failed to fetch branch machine summary' });
  }
});

router.get('/machines/:id/history', async (req, res) => {
  try {
    const { id } = req.params;

    const machine = await prisma.warehouseMachine.findUnique({
      where: { id },
    });
    if (!machine) {
      return res.status(404).json({ error: 'Machine not found' });
    }

    const logs = await prisma.machineMovementLog.findMany({
      where: { serialNumber: machine.serialNumber },
      include: { branch: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: { machine, history: logs } });
  } catch (error) {
    logger.error('Failed to fetch machine history:', error);
    res.status(500).json({ error: 'Failed to fetch machine history' });
  }
});

router.get('/return/ready', async (req, res) => {
  try {
    const { page = '1', limit = '20', search } = req.query;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const where = { status: 'RETURNED' };
    if (search) {
      where.OR = [
        { serialNumber: { contains: search } },
        { customerName: { contains: search } },
        { notes: { contains: search } },
      ];
    }

    const [machines, total] = await Promise.all([
      prisma.warehouseMachine.findMany({
        where,
        include: {
          branch: { select: { name: true } },
          customer: { select: { client_name: true, bkcode: true } },
        },
        orderBy: { importDate: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.warehouseMachine.count({ where }),
    ]);

    res.json({
      success: true,
      data: machines,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    logger.error('Failed to fetch ready for return machines:', error);
    res.status(500).json({ error: 'Failed to fetch ready for return machines' });
  }
});

router.post('/machines/:id/assign', async (req, res) => {
  try {
    const { id } = req.params;
    const { technicianId, technician, notes } = req.body;

    const machine = await prisma.warehouseMachine.update({
      where: { id },
      data: {
        status: 'ASSIGNED',
        notes: notes ? `Assigned to ${technician}: ${notes}` : `Assigned to ${technician}`,
      },
    });

    res.json({ success: true, data: machine });
  } catch (error) {
    logger.error('Failed to assign technician to machine:', error);
    res.status(500).json({ error: 'Failed to assign technician to machine' });
  }
});

router.post('/machines/:id/inspect', async (req, res) => {
  try {
    const { id } = req.params;
    const { complaint, notes, resolution } = req.body;

    const machine = await prisma.warehouseMachine.update({
      where: { id },
      data: {
        complaint,
        notes: notes ? `Inspection: ${notes}` : undefined,
        resolution,
        status: 'INSPECTED',
      },
    });

    res.json({ success: true, data: machine });
  } catch (error) {
    logger.error('Failed to inspect machine:', error);
    res.status(500).json({ error: 'Failed to inspect machine' });
  }
});

router.post('/machines/:id/repair', async (req, res) => {
  try {
    const { id } = req.params;
    const { notes, resolution, usedParts } = req.body;

    const machine = await prisma.warehouseMachine.update({
      where: { id },
      data: {
        status: 'IN_REPAIR',
        notes: notes ? `Repair: ${notes}` : undefined,
        resolution,
      },
    });

    if (usedParts && usedParts.length > 0) {
      await prisma.usedPartLog.create({
        data: {
          requestId: machine.requestId || '',
          customerId: machine.customerId || '',
          customerName: machine.customerName,
          customerBkcode: machine.customerBkcode,
          technician: 'Maintenance Center',
          parts: JSON.stringify(usedParts),
          branchId: machine.branchId,
        },
      });
    }

    res.json({ success: true, data: machine });
  } catch (error) {
    logger.error('Failed to repair machine:', error);
    res.status(500).json({ error: 'Failed to repair machine' });
  }
});

router.post('/machines/:id/request-approval', async (req, res) => {
  try {
    const { id } = req.params;
    const { cost, parts, notes, branchId } = req.body;

    const machine = await prisma.warehouseMachine.findUnique({ where: { id } });
    if (!machine) {
      return res.status(404).json({ error: 'Machine not found' });
    }

    const approval = await prisma.maintenanceApproval.create({
      data: {
        requestId: machine.requestId || '',
        cost,
        parts: parts ? JSON.stringify(parts) : undefined,
        notes,
        branchId,
        status: 'PENDING',
      },
    });

    await prisma.warehouseMachine.update({
      where: { id },
      data: { status: 'PENDING_APPROVAL' },
    });

    res.json({ success: true, data: approval });
  } catch (error) {
    logger.error('Failed to request approval:', error);
    res.status(500).json({ error: 'Failed to request approval' });
  }
});

router.post('/machines/:id/mark-repaired', async (req, res) => {
  try {
    const { id } = req.params;
    const { notes, resolution } = req.body;

    const machine = await prisma.warehouseMachine.update({
      where: { id },
      data: {
        status: 'REPAIRED',
        resolution,
        notes: notes ? `Marked repaired: ${notes}` : undefined,
      },
    });

    res.json({ success: true, data: machine });
  } catch (error) {
    logger.error('Failed to mark machine as repaired:', error);
    res.status(500).json({ error: 'Failed to mark machine as repaired' });
  }
});

router.post('/machines/:id/mark-total-loss', async (req, res) => {
  try {
    const { id } = req.params;
    const { notes, resolution } = req.body;

    const machine = await prisma.warehouseMachine.update({
      where: { id },
      data: {
        status: 'TOTAL_LOSS',
        resolution,
        notes: notes ? `Total loss: ${notes}` : undefined,
      },
    });

    res.json({ success: true, data: machine });
  } catch (error) {
    logger.error('Failed to mark machine as total loss:', error);
    res.status(500).json({ error: 'Failed to mark machine as total loss' });
  }
});

router.post('/machines/:id/return', async (req, res) => {
  try {
    const { id } = req.params;
    const { branchId, notes } = req.body;

    const machine = await prisma.warehouseMachine.findUnique({ where: { id } });
    if (!machine) {
      return res.status(404).json({ error: 'Machine not found' });
    }

    await prisma.posMachine.create({
      data: {
        serialNumber: machine.serialNumber,
        model: machine.model,
        manufacturer: machine.manufacturer,
        customerId: machine.customerId,
        branchId: branchId || machine.branchId,
      },
    });

    await prisma.warehouseMachine.delete({ where: { id } });

    await prisma.machineMovementLog.create({
      data: {
        serialNumber: machine.serialNumber,
        action: 'RETURN_TO_BRANCH',
        details: notes || 'Returned to branch',
        branchId: branchId || machine.branchId,
      },
    });

    res.json({ success: true, message: 'Machine returned to branch' });
  } catch (error) {
    logger.error('Failed to return machine to branch:', error);
    res.status(500).json({ error: 'Failed to return machine to branch' });
  }
});

router.post('/return/create', async (req, res) => {
  try {
    const { serialNumbers, branchId, notes } = req.body;

    const returns = await Promise.all(
      serialNumbers.map(async (sn) => {
        const machine = await prisma.warehouseMachine.findUnique({
          where: { serialNumber: sn },
        });

        if (!machine) return null;

        await prisma.posMachine.create({
          data: {
            serialNumber: machine.serialNumber,
            model: machine.model,
            manufacturer: machine.manufacturer,
            customerId: machine.customerId,
            branchId: branchId || machine.branchId,
          },
        });

        await prisma.warehouseMachine.delete({ where: { serialNumber: sn } });

        return sn;
      })
    );

    const successful = returns.filter(Boolean);

    res.json({ success: true, data: { returned: successful, count: successful.length } });
  } catch (error) {
    logger.error('Failed to create return:', error);
    res.status(500).json({ error: 'Failed to create return' });
  }
});

module.exports = router;
