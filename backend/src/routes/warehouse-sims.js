const express = require('express');
const logger = require('../../utils/logger');
const router = express.Router();
const prisma = require('../db');
const { adminAuth } = require('../middleware/auth');

router.use(adminAuth);

router.get('/', async (req, res) => {
  try {
    const { branchId, status } = req.query;

    const where = {};
    if (branchId) where.branchId = branchId;
    if (status) where.status = status;

    const sims = await prisma.warehouseSim.findMany({
      where,
      include: { branch: { select: { id: true, name: true, code: true } } },
      orderBy: { serialNumber: 'asc' },
    });

    res.json({ success: true, data: sims, total: sims.length });
  } catch (error) {
    logger.error('Failed to fetch warehouse SIMs:', error);
    res.status(500).json({ error: 'Failed to fetch warehouse SIMs' });
  }
});

router.get('/counts', async (req, res) => {
  try {
    const { branchId } = req.query;

    const where = {};
    if (branchId) where.branchId = branchId;

    const total = await prisma.warehouseSim.count({ where });

    const statusCounts = await prisma.warehouseSim.groupBy({
      by: ['status'],
      where,
      _count: true,
    });

    const typeCounts = await prisma.warehouseSim.groupBy({
      by: ['type'],
      where,
      _count: true,
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
    });
  } catch (error) {
    logger.error('Failed to fetch warehouse SIM counts:', error);
    res.status(500).json({ error: 'Failed to fetch warehouse SIM counts' });
  }
});

router.get('/template', async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('SIM Template');

    worksheet.columns = [
      { header: 'Serial Number', key: 'serialNumber', width: 20 },
      { header: 'Type', key: 'type', width: 15 },
      { header: 'Network Type', key: 'networkType', width: 15 },
      { header: 'Notes', key: 'notes', width: 30 },
    ];

    worksheet.addRow({
      serialNumber: 'SIM001',
      type: 'DATA',
      networkType: '4G',
      notes: 'Example',
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename=warehouse-sim-template.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    logger.error('Failed to download SIM template:', error);
    res.status(500).json({ error: 'Failed to download SIM template' });
  }
});

router.get('/export', async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const { branchId } = req.query;

    const where = {};
    if (branchId) where.branchId = branchId;

    const sims = await prisma.warehouseSim.findMany({
      where,
      include: { branch: { select: { name: true } } },
      orderBy: { serialNumber: 'asc' },
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Warehouse SIMs');

    worksheet.columns = [
      { header: 'Serial Number', key: 'serialNumber', width: 20 },
      { header: 'Type', key: 'type', width: 15 },
      { header: 'Network', key: 'networkType', width: 15 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Branch', key: 'branch', width: 20 },
      { header: 'Notes', key: 'notes', width: 30 },
      { header: 'Import Date', key: 'importDate', width: 18 },
    ];

    sims.forEach((sim) => {
      worksheet.addRow({
        serialNumber: sim.serialNumber,
        type: sim.type || '-',
        networkType: sim.networkType || '-',
        status: sim.status,
        branch: sim.branch?.name || '-',
        notes: sim.notes || '-',
        importDate: new Date(sim.importDate).toLocaleDateString(),
      });
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename=warehouse-sims.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    logger.error('Failed to export warehouse SIMs:', error);
    res.status(500).json({ error: 'Failed to export warehouse SIMs' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { serialNumber, type, networkType, status, notes, branchId } = req.body;

    const existing = await prisma.warehouseSim.findUnique({
      where: { serialNumber },
    });
    if (existing) {
      return res.status(409).json({ error: 'SIM with this serial number already exists' });
    }

    const sim = await prisma.warehouseSim.create({
      data: {
        serialNumber,
        type,
        networkType,
        status: status || 'NEW',
        notes,
        branchId,
      },
    });

    res.status(201).json({ success: true, data: sim });
  } catch (error) {
    logger.error('Failed to create warehouse SIM:', error);
    res.status(500).json({ error: 'Failed to create warehouse SIM' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { serialNumber, type, networkType, status, notes, branchId } = req.body;

    const sim = await prisma.warehouseSim.update({
      where: { id },
      data: {
        serialNumber,
        type,
        networkType,
        status,
        notes,
        branchId,
      },
    });

    res.json({ success: true, data: sim });
  } catch (error) {
    logger.error('Failed to update warehouse SIM:', error);
    res.status(500).json({ error: 'Failed to update warehouse SIM' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.warehouseSim.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Warehouse SIM not found' });
    }

    await prisma.warehouseSim.delete({ where: { id } });

    res.json({ success: true, message: 'Warehouse SIM deleted' });
  } catch (error) {
    logger.error('Failed to delete warehouse SIM:', error);
    res.status(500).json({ error: 'Failed to delete warehouse SIM' });
  }
});

router.post('/transfer', async (req, res) => {
  try {
    const { serialNumber, fromBranchId, toBranchId, notes } = req.body;

    const sim = await prisma.warehouseSim.update({
      where: { serialNumber },
      data: {
        branchId: toBranchId,
        status: 'TRANSFERRED',
        notes: notes ? `Transferred: ${notes}` : undefined,
      },
    });

    await prisma.simMovementLog.create({
      data: {
        simId: sim.id,
        serialNumber,
        action: 'TRANSFER',
        details: `Transferred from branch ${fromBranchId} to ${toBranchId}`,
        branchId: toBranchId,
      },
    });

    res.json({ success: true, data: sim });
  } catch (error) {
    logger.error('Failed to transfer warehouse SIM:', error);
    res.status(500).json({ error: 'Failed to transfer warehouse SIM' });
  }
});

router.post('/assign', async (req, res) => {
  try {
    const { serialNumber, customerId, branchId, notes } = req.body;

    const sim = await prisma.warehouseSim.findUnique({ where: { serialNumber } });
    if (!sim) {
      return res.status(404).json({ error: 'Warehouse SIM not found' });
    }

    const simCard = await prisma.simCard.create({
      data: {
        serialNumber,
        type: sim.type,
        networkType: sim.networkType,
        customerId,
        branchId,
      },
    });

    await prisma.warehouseSim.delete({ where: { serialNumber } });

    await prisma.simMovementLog.create({
      data: {
        simId: simCard.id,
        serialNumber,
        action: 'ASSIGN',
        details: `Assigned to customer ${customerId}`,
        branchId,
      },
    });

    res.json({ success: true, data: simCard });
  } catch (error) {
    logger.error('Failed to assign warehouse SIM:', error);
    res.status(500).json({ error: 'Failed to assign warehouse SIM' });
  }
});

router.post('/exchange', async (req, res) => {
  try {
    const { oldSerialNumber, newSerialNumber, customerId, branchId, notes } = req.body;

    const oldSim = await prisma.simCard.findUnique({
      where: { serialNumber: oldSerialNumber },
    });
    if (!oldSim) {
      return res.status(404).json({ error: 'Current SIM not found' });
    }

    const newSim = await prisma.warehouseSim.findUnique({
      where: { serialNumber: newSerialNumber },
    });
    if (!newSim) {
      return res.status(404).json({ error: 'Replacement SIM not found in warehouse' });
    }

    await prisma.simCard.update({
      where: { serialNumber: oldSerialNumber },
      data: {
        serialNumber: newSerialNumber,
        type: newSim.type,
        networkType: newSim.networkType,
      },
    });

    await prisma.warehouseSim.delete({ where: { serialNumber: newSerialNumber } });

    await prisma.simMovementLog.create({
      data: {
        simId: oldSim.id,
        serialNumber: newSerialNumber,
        action: 'EXCHANGE',
        details: `Exchanged ${oldSerialNumber} for ${newSerialNumber}`,
        branchId,
      },
    });

    res.json({ success: true, message: 'SIM exchanged successfully' });
  } catch (error) {
    logger.error('Failed to exchange warehouse SIM:', error);
    res.status(500).json({ error: 'Failed to exchange warehouse SIM' });
  }
});

router.post('/return', async (req, res) => {
  try {
    const { serialNumber, branchId, notes } = req.body;

    const simCard = await prisma.simCard.findUnique({
      where: { serialNumber },
    });
    if (!simCard) {
      return res.status(404).json({ error: 'SIM card not found' });
    }

    await prisma.warehouseSim.create({
      data: {
        serialNumber,
        type: simCard.type,
        networkType: simCard.networkType,
        status: 'RETURNED',
        notes: notes || 'Returned from customer',
        branchId,
      },
    });

    await prisma.simCard.delete({ where: { serialNumber } });

    await prisma.simMovementLog.create({
      data: {
        simId: simCard.id,
        serialNumber,
        action: 'RETURN',
        details: `Returned to warehouse at branch ${branchId}`,
        branchId,
      },
    });

    res.json({ success: true, message: 'SIM returned to warehouse' });
  } catch (error) {
    logger.error('Failed to return warehouse SIM:', error);
    res.status(500).json({ error: 'Failed to return warehouse SIM' });
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

    const sims = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      sims.push({
        serialNumber: row.getCell(1).value,
        type: row.getCell(2).value,
        networkType: row.getCell(3).value,
        notes: row.getCell(4).value,
      });
    });

    let created = 0;
    let skipped = 0;

    for (const sim of sims) {
      try {
        await prisma.warehouseSim.create({
          data: {
            serialNumber: sim.serialNumber,
            type: sim.type,
            networkType: sim.networkType,
            status: 'NEW',
            notes: sim.notes,
          },
        });
        created++;
      } catch {
        skipped++;
      }
    }

    res.json({ success: true, data: { created, skipped, total: sims.length } });
  } catch (error) {
    logger.error('Failed to import warehouse SIMs:', error);
    res.status(500).json({ error: 'Failed to import warehouse SIMs' });
  }
});

module.exports = router;
