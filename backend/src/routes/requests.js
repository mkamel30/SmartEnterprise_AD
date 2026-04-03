const express = require('express');
const logger = require('../../utils/logger');
const router = express.Router();
const prisma = require('../db');
const { adminAuth } = require('../middleware/auth');

router.use(adminAuth);

router.get('/', async (req, res) => {
  try {
    const { branchId, search, includeRelations } = req.query;

    const where = {};
    if (branchId) where.branchId = branchId;

    const include = {};
    if (includeRelations === 'true') {
      include.branch = { select: { id: true, name: true } };
      include.customer = { select: { id: true, client_name: true, bkcode: true } };
      include.posMachine = { select: { serialNumber: true, model: true } };
    }

    const requests = await prisma.maintenanceRequest.findMany({
      where,
      include,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    let filtered = requests;
    if (search) {
      const s = search.toLowerCase();
      filtered = requests.filter((r) =>
        (r.customerName || '').toLowerCase().includes(s) ||
        (r.serialNumber || '').toLowerCase().includes(s) ||
        (r.description || '').toLowerCase().includes(s) ||
        (r.technician || '').toLowerCase().includes(s)
      );
    }

    res.json({ success: true, data: filtered, total: filtered.length });
  } catch (error) {
    logger.error('Failed to fetch maintenance requests:', error);
    res.status(500).json({ error: 'Failed to fetch maintenance requests' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const { branchId } = req.query;

    const where = {};
    if (branchId) where.branchId = branchId;

    const total = await prisma.maintenanceRequest.count({ where });

    const statusCounts = await prisma.maintenanceRequest.groupBy({
      by: ['status'],
      where,
      _count: true,
    });

    const costAggregation = await prisma.maintenanceRequest.aggregate({
      where: { ...where, status: 'CLOSED' },
      _sum: { totalCost: true },
      _avg: { totalCost: true },
    });

    const recentRequests = await prisma.maintenanceRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, status: true, createdAt: true, branchId: true },
    });

    res.json({
      success: true,
      total,
      statusBreakdown: statusCounts.reduce((acc, s) => {
        acc[s.status] = s._count;
        return acc;
      }, {}),
      totalClosedCost: costAggregation._sum.totalCost || 0,
      avgClosedCost: costAggregation._avg.totalCost || 0,
      recentRequests,
    });
  } catch (error) {
    logger.error('Failed to fetch request stats:', error);
    res.status(500).json({ error: 'Failed to fetch request stats' });
  }
});

router.get('/export', async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const { branchId } = req.query;

    const where = {};
    if (branchId) where.branchId = branchId;

    const requests = await prisma.maintenanceRequest.findMany({
      where,
      include: {
        branch: { select: { name: true } },
        customer: { select: { client_name: true, bkcode: true } },
        posMachine: { select: { serialNumber: true, model: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Maintenance Requests');

    worksheet.columns = [
      { header: 'ID', key: 'id', width: 30 },
      { header: 'Date', key: 'date', width: 20 },
      { header: 'Branch', key: 'branch', width: 20 },
      { header: 'Customer', key: 'customer', width: 25 },
      { header: 'Customer Code', key: 'bkcode', width: 15 },
      { header: 'Serial Number', key: 'serial', width: 20 },
      { header: 'Model', key: 'model', width: 20 },
      { header: 'Status', key: 'status', width: 18 },
      { header: 'Technician', key: 'technician', width: 20 },
      { header: 'Description', key: 'description', width: 30 },
      { header: 'Total Cost', key: 'cost', width: 12 },
      { header: 'Receipt #', key: 'receipt', width: 15 },
      { header: 'Notes', key: 'notes', width: 30 },
    ];

    requests.forEach((r) => {
      worksheet.addRow({
        id: r.id,
        date: new Date(r.createdAt).toLocaleString(),
        branch: r.branch?.name || '-',
        customer: r.customer?.client_name || '-',
        bkcode: r.customer?.bkcode || '-',
        serial: r.serialNumber || r.posMachine?.serialNumber || '-',
        model: r.machineModel || r.posMachine?.model || '-',
        status: r.status,
        technician: r.technician || '-',
        description: r.description || '-',
        cost: r.totalCost || 0,
        receipt: r.receiptNumber || '-',
        notes: r.notes || '-',
      });
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename=maintenance-requests.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    logger.error('Failed to export maintenance requests:', error);
    res.status(500).json({ error: 'Failed to export maintenance requests' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const request = await prisma.maintenanceRequest.findUnique({
      where: { id },
      include: {
        branch: true,
        customer: true,
        posMachine: true,
        maintenanceApprovals: true,
        stockMovements: true,
        payments: true,
      },
    });

    if (!request) {
      return res.status(404).json({ error: 'Maintenance request not found' });
    }

    res.json({ success: true, data: request });
  } catch (error) {
    logger.error('Failed to fetch maintenance request:', error);
    res.status(500).json({ error: 'Failed to fetch maintenance request' });
  }
});

router.post('/', async (req, res) => {
  try {
    const {
      customerId,
      posMachineId,
      customerName,
      customerBkcode,
      machineModel,
      machineManufacturer,
      serialNumber,
      branchId,
      technicianId,
      technician,
      type,
      description,
      notes,
      complaint,
      createdBy,
    } = req.body;

    const request = await prisma.maintenanceRequest.create({
      data: {
        customerId,
        posMachineId,
        customerName,
        customerBkcode,
        machineModel,
        machineManufacturer,
        serialNumber,
        branchId,
        technicianId,
        technician,
        type,
        description,
        notes,
        complaint,
        createdBy,
        status: 'Open',
      },
    });

    res.status(201).json({ success: true, data: request });
  } catch (error) {
    logger.error('Failed to create maintenance request:', error);
    res.status(500).json({ error: 'Failed to create maintenance request' });
  }
});

router.post('/:id/assign', async (req, res) => {
  try {
    const { id } = req.params;
    const { technicianId, technician } = req.body;

    const request = await prisma.maintenanceRequest.update({
      where: { id },
      data: {
        technicianId,
        technician,
        status: 'ASSIGNED',
      },
    });

    res.json({ success: true, data: request });
  } catch (error) {
    logger.error('Failed to assign technician:', error);
    res.status(500).json({ error: 'Failed to assign technician' });
  }
});

router.put('/:id/close', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      actionTaken,
      notes,
      usedParts,
      receiptNumber,
      totalCost,
      closingUserId,
      closingUserName,
    } = req.body;

    const request = await prisma.maintenanceRequest.update({
      where: { id },
      data: {
        status: 'CLOSED',
        actionTaken,
        notes,
        usedParts: usedParts ? JSON.stringify(usedParts) : undefined,
        receiptNumber,
        totalCost,
        closingUserId,
        closingUserName,
        closingTimestamp: new Date(),
      },
    });

    res.json({ success: true, data: request });
  } catch (error) {
    logger.error('Failed to close maintenance request:', error);
    res.status(500).json({ error: 'Failed to close maintenance request' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.maintenanceRequest.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Maintenance request not found' });
    }

    await prisma.maintenanceRequest.delete({ where: { id } });

    res.json({ success: true, message: 'Maintenance request deleted' });
  } catch (error) {
    logger.error('Failed to delete maintenance request:', error);
    res.status(500).json({ error: 'Failed to delete maintenance request' });
  }
});

module.exports = router;
