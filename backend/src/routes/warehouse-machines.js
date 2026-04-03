const express = require('express');
const logger = require('../../utils/logger');
const router = express.Router();
const prisma = require('../db');
const { adminAuth } = require('../middleware/auth');

router.use(adminAuth);

router.get('/', async (req, res) => {
  try {
    const { status, branchId } = req.query;

    const where = {};
    if (status) where.status = status;
    if (branchId) where.branchId = branchId;

    const machines = await prisma.warehouseMachine.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true, code: true } },
        customer: { select: { id: true, client_name: true, bkcode: true } },
        maintenanceRequest: { select: { id: true, status: true } },
      },
      orderBy: { serialNumber: 'asc' },
    });

    res.json({ success: true, data: machines, total: machines.length });
  } catch (error) {
    logger.error('Failed to fetch warehouse machines:', error);
    res.status(500).json({ error: 'Failed to fetch warehouse machines' });
  }
});

router.get('/counts', async (req, res) => {
  try {
    const { branchId } = req.query;

    const where = {};
    if (branchId) where.branchId = branchId;

    const total = await prisma.warehouseMachine.count({ where });

    const statusCounts = await prisma.warehouseMachine.groupBy({
      by: ['status'],
      where,
      _count: true,
    });

    const modelCounts = await prisma.warehouseMachine.groupBy({
      by: ['model'],
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
      modelBreakdown: modelCounts.reduce((acc, m) => {
        acc[m.model || 'Unknown'] = m._count;
        return acc;
      }, {}),
    });
  } catch (error) {
    logger.error('Failed to fetch warehouse machine counts:', error);
    res.status(500).json({ error: 'Failed to fetch warehouse machine counts' });
  }
});

router.get('/logs', async (req, res) => {
  try {
    const { branchId } = req.query;

    const where = {};
    if (branchId) where.branchId = branchId;

    const logs = await prisma.machineMovementLog.findMany({
      where,
      include: { branch: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    res.json({ success: true, data: logs, total: logs.length });
  } catch (error) {
    logger.error('Failed to fetch machine logs:', error);
    res.status(500).json({ error: 'Failed to fetch machine logs' });
  }
});

router.get('/template', async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Machine Template');

    worksheet.columns = [
      { header: 'Serial Number', key: 'serialNumber', width: 20 },
      { header: 'Model', key: 'model', width: 15 },
      { header: 'Manufacturer', key: 'manufacturer', width: 20 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Notes', key: 'notes', width: 30 },
    ];

    worksheet.addRow({
      serialNumber: 'POS001',
      model: 'PAX-A920',
      manufacturer: 'PAX',
      status: 'NEW',
      notes: 'Example',
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename=warehouse-machine-template.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    logger.error('Failed to download machine template:', error);
    res.status(500).json({ error: 'Failed to download machine template' });
  }
});

router.get('/export', async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const { status, branchId } = req.query;

    const where = {};
    if (status) where.status = status;
    if (branchId) where.branchId = branchId;

    const machines = await prisma.warehouseMachine.findMany({
      where,
      include: { branch: { select: { name: true } } },
      orderBy: { serialNumber: 'asc' },
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Warehouse Machines');

    worksheet.columns = [
      { header: 'Serial Number', key: 'serialNumber', width: 20 },
      { header: 'Model', key: 'model', width: 15 },
      { header: 'Manufacturer', key: 'manufacturer', width: 20 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Branch', key: 'branch', width: 20 },
      { header: 'Customer', key: 'customer', width: 25 },
      { header: 'Notes', key: 'notes', width: 30 },
      { header: 'Import Date', key: 'importDate', width: 18 },
    ];

    machines.forEach((m) => {
      worksheet.addRow({
        serialNumber: m.serialNumber,
        model: m.model || '-',
        manufacturer: m.manufacturer || '-',
        status: m.status,
        branch: m.branch?.name || '-',
        customer: m.customer?.client_name || '-',
        notes: m.notes || '-',
        importDate: new Date(m.importDate).toLocaleDateString(),
      });
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename=warehouse-machines.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    logger.error('Failed to export warehouse machines:', error);
    res.status(500).json({ error: 'Failed to export warehouse machines' });
  }
});

router.get('/external-repair', async (req, res) => {
  try {
    const { status } = req.query;

    const where = { status: 'EXTERNAL_REPAIR' };
    if (status) where.resolution = status;

    const machines = await prisma.warehouseMachine.findMany({
      where,
      include: { branch: { select: { name: true } } },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({ success: true, data: machines, total: machines.length });
  } catch (error) {
    logger.error('Failed to fetch external repair machines:', error);
    res.status(500).json({ error: 'Failed to fetch external repair machines' });
  }
});

router.get('/external-repair/ready-count', async (req, res) => {
  try {
    const count = await prisma.warehouseMachine.count({
      where: { status: 'EXTERNAL_REPAIR', readyForPickup: true },
    });

    res.json({ success: true, count });
  } catch (error) {
    logger.error('Failed to get external repair ready count:', error);
    res.status(500).json({ error: 'Failed to get external repair ready count' });
  }
});

router.get('/machines/:serialNumber/history', async (req, res) => {
  try {
    const { serialNumber } = req.params;

    const logs = await prisma.machineMovementLog.findMany({
      where: { serialNumber },
      include: { branch: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const machine = await prisma.warehouseMachine.findUnique({
      where: { serialNumber },
      include: { branch: true, customer: true },
    });

    res.json({ success: true, data: { machine, history: logs } });
  } catch (error) {
    logger.error('Failed to fetch machine history:', error);
    res.status(500).json({ error: 'Failed to fetch machine history' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { serialNumber, model, manufacturer, status, notes, branchId, customerId } = req.body;

    const existing = await prisma.warehouseMachine.findUnique({
      where: { serialNumber },
    });
    if (existing) {
      return res.status(409).json({ error: 'Machine with this serial number already exists' });
    }

    const machine = await prisma.warehouseMachine.create({
      data: {
        serialNumber,
        model,
        manufacturer,
        status: status || 'NEW',
        notes,
        branchId,
        customerId,
      },
    });

    await prisma.machineMovementLog.create({
      data: {
        serialNumber,
        action: 'IMPORT',
        details: `Machine imported with status ${machine.status}`,
        branchId,
      },
    });

    res.status(201).json({ success: true, data: machine });
  } catch (error) {
    logger.error('Failed to create warehouse machine:', error);
    res.status(500).json({ error: 'Failed to create warehouse machine' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { serialNumber, model, manufacturer, status, notes, branchId, customerId, resolution } = req.body;

    const machine = await prisma.warehouseMachine.update({
      where: { id },
      data: {
        serialNumber,
        model,
        manufacturer,
        status,
        notes,
        branchId,
        customerId,
        resolution,
      },
    });

    res.json({ success: true, data: machine });
  } catch (error) {
    logger.error('Failed to update warehouse machine:', error);
    res.status(500).json({ error: 'Failed to update warehouse machine' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.warehouseMachine.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Warehouse machine not found' });
    }

    await prisma.warehouseMachine.delete({ where: { id } });

    res.json({ success: true, message: 'Warehouse machine deleted' });
  } catch (error) {
    logger.error('Failed to delete warehouse machine:', error);
    res.status(500).json({ error: 'Failed to delete warehouse machine' });
  }
});

router.put('/update-by-prefix', async (req, res) => {
  try {
    const { prefix, model, manufacturer } = req.body;

    const param = await prisma.machineParameter.findUnique({
      where: { prefix },
    });

    if (!param) {
      return res.status(404).json({ error: 'No parameter found for this prefix' });
    }

    const machines = await prisma.warehouseMachine.findMany({
      where: {
        serialNumber: { startsWith: prefix },
      },
    });

    const updated = await Promise.all(
      machines.map((m) =>
        prisma.warehouseMachine.update({
          where: { id: m.id },
          data: {
            model: model || param.model,
            manufacturer: manufacturer || param.manufacturer,
          },
        })
      )
    );

    res.json({ success: true, data: updated, count: updated.length });
  } catch (error) {
    logger.error('Failed to update machines by prefix:', error);
    res.status(500).json({ error: 'Failed to update machines by prefix' });
  }
});

router.post('/exchange', async (req, res) => {
  try {
    const { oldSerialNumber, newSerialNumber, customerId, branchId, notes } = req.body;

    const oldMachine = await prisma.posMachine.findUnique({
      where: { serialNumber: oldSerialNumber },
    });
    if (!oldMachine) {
      return res.status(404).json({ error: 'Current machine not found' });
    }

    const newMachine = await prisma.warehouseMachine.findUnique({
      where: { serialNumber: newSerialNumber },
    });
    if (!newMachine) {
      return res.status(404).json({ error: 'Replacement machine not found in warehouse' });
    }

    await prisma.posMachine.update({
      where: { serialNumber: oldSerialNumber },
      data: {
        serialNumber: newSerialNumber,
        model: newMachine.model,
        manufacturer: newMachine.manufacturer,
      },
    });

    await prisma.warehouseMachine.delete({ where: { serialNumber: newSerialNumber } });

    await prisma.machineMovementLog.create({
      data: {
        serialNumber: newSerialNumber,
        action: 'EXCHANGE',
        details: `Exchanged ${oldSerialNumber} for ${newSerialNumber}`,
        branchId,
      },
    });

    res.json({ success: true, message: 'Machine exchanged successfully' });
  } catch (error) {
    logger.error('Failed to exchange warehouse machine:', error);
    res.status(500).json({ error: 'Failed to exchange warehouse machine' });
  }
});

router.post('/return', async (req, res) => {
  try {
    const { serialNumber, branchId, notes, complaint } = req.body;

    const posMachine = await prisma.posMachine.findUnique({
      where: { serialNumber },
    });
    if (!posMachine) {
      return res.status(404).json({ error: 'POS machine not found' });
    }

    await prisma.warehouseMachine.create({
      data: {
        serialNumber,
        model: posMachine.model,
        manufacturer: posMachine.manufacturer,
        status: 'RETURNED',
        notes: notes || 'Returned from customer',
        complaint,
        branchId,
        customerId: posMachine.customerId,
      },
    });

    await prisma.posMachine.delete({ where: { serialNumber } });

    await prisma.machineMovementLog.create({
      data: {
        serialNumber,
        action: 'RETURN',
        details: `Returned to warehouse at branch ${branchId}`,
        branchId,
      },
    });

    res.json({ success: true, message: 'Machine returned to warehouse' });
  } catch (error) {
    logger.error('Failed to return warehouse machine:', error);
    res.status(500).json({ error: 'Failed to return warehouse machine' });
  }
});

router.post('/return-to-customer', async (req, res) => {
  try {
    const { serialNumber, customerId, branchId, notes } = req.body;

    const warehouseMachine = await prisma.warehouseMachine.findUnique({
      where: { serialNumber },
    });
    if (!warehouseMachine) {
      return res.status(404).json({ error: 'Warehouse machine not found' });
    }

    await prisma.posMachine.create({
      data: {
        serialNumber,
        model: warehouseMachine.model,
        manufacturer: warehouseMachine.manufacturer,
        customerId,
        branchId,
      },
    });

    await prisma.warehouseMachine.delete({ where: { serialNumber } });

    await prisma.machineMovementLog.create({
      data: {
        serialNumber,
        action: 'RETURN_TO_CUSTOMER',
        details: `Returned to customer ${customerId}`,
        branchId,
      },
    });

    res.json({ success: true, message: 'Machine returned to customer' });
  } catch (error) {
    logger.error('Failed to return machine to customer:', error);
    res.status(500).json({ error: 'Failed to return machine to customer' });
  }
});

router.post('/repair-to-standby', async (req, res) => {
  try {
    const { serialNumber, branchId, notes } = req.body;

    const machine = await prisma.warehouseMachine.update({
      where: { serialNumber },
      data: {
        status: 'STANDBY',
        notes: notes ? `Repaired: ${notes}` : undefined,
        branchId,
      },
    });

    await prisma.machineMovementLog.create({
      data: {
        serialNumber,
        action: 'REPAIR_TO_STANDBY',
        details: 'Machine repaired and moved to standby',
        branchId,
      },
    });

    res.json({ success: true, data: machine });
  } catch (error) {
    logger.error('Failed to repair machine to standby:', error);
    res.status(500).json({ error: 'Failed to repair machine to standby' });
  }
});

router.post('/external-repair/withdraw', async (req, res) => {
  try {
    const { serialNumber, branchId, notes } = req.body;

    const machine = await prisma.warehouseMachine.update({
      where: { serialNumber },
      data: {
        status: 'EXTERNAL_REPAIR',
        notes: notes ? `Withdrawn for external repair: ${notes}` : 'Withdrawn for external repair',
        branchId,
      },
    });

    await prisma.machineMovementLog.create({
      data: {
        serialNumber,
        action: 'EXTERNAL_REPAIR_WITHDRAW',
        details: 'Withdrawn for external repair',
        branchId,
      },
    });

    res.json({ success: true, data: machine });
  } catch (error) {
    logger.error('Failed to withdraw machine for external repair:', error);
    res.status(500).json({ error: 'Failed to withdraw machine for external repair' });
  }
});

router.put('/external-repair/:id/ready', async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const machine = await prisma.warehouseMachine.update({
      where: { id },
      data: {
        readyForPickup: true,
        status: 'EXTERNAL_REPAIR_READY',
        notes: notes ? `Ready for pickup: ${notes}` : undefined,
      },
    });

    res.json({ success: true, data: machine });
  } catch (error) {
    logger.error('Failed to mark external repair ready:', error);
    res.status(500).json({ error: 'Failed to mark external repair ready' });
  }
});

router.post('/external-repair/:id/deliver', async (req, res) => {
  try {
    const { id } = req.params;
    const { customerId, branchId, notes } = req.body;

    const machine = await prisma.warehouseMachine.findUnique({ where: { id } });
    if (!machine) {
      return res.status(404).json({ error: 'Machine not found' });
    }

    await prisma.posMachine.create({
      data: {
        serialNumber: machine.serialNumber,
        model: machine.model,
        manufacturer: machine.manufacturer,
        customerId,
        branchId,
      },
    });

    await prisma.warehouseMachine.delete({ where: { id } });

    await prisma.machineMovementLog.create({
      data: {
        serialNumber: machine.serialNumber,
        action: 'EXTERNAL_REPAIR_DELIVER',
        details: `Delivered to customer ${customerId} after external repair`,
        branchId,
      },
    });

    res.json({ success: true, message: 'Machine delivered to customer' });
  } catch (error) {
    logger.error('Failed to deliver external repair machine:', error);
    res.status(500).json({ error: 'Failed to deliver external repair machine' });
  }
});

router.post('/bulk-transfer', async (req, res) => {
  try {
    const { serialNumbers, toBranchId, notes } = req.body;

    const updated = await Promise.all(
      serialNumbers.map((sn) =>
        prisma.warehouseMachine.update({
          where: { serialNumber: sn },
          data: {
            branchId: toBranchId,
            notes: notes ? `Bulk transfer: ${notes}` : undefined,
          },
        })
      )
    );

    await Promise.all(
      serialNumbers.map((sn) =>
        prisma.machineMovementLog.create({
          data: {
            serialNumber: sn,
            action: 'BULK_TRANSFER',
            details: `Bulk transferred to branch ${toBranchId}`,
            branchId: toBranchId,
          },
        })
      )
    );

    res.json({ success: true, data: updated, count: updated.length });
  } catch (error) {
    logger.error('Failed to bulk transfer machines:', error);
    res.status(500).json({ error: 'Failed to bulk transfer machines' });
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

    const machines = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      machines.push({
        serialNumber: row.getCell(1).value,
        model: row.getCell(2).value,
        manufacturer: row.getCell(3).value,
        status: row.getCell(4).value || 'NEW',
        notes: row.getCell(5).value,
      });
    });

    let created = 0;
    let skipped = 0;

    for (const m of machines) {
      try {
        await prisma.warehouseMachine.create({
          data: {
            serialNumber: m.serialNumber,
            model: m.model,
            manufacturer: m.manufacturer,
            status: m.status,
            notes: m.notes,
          },
        });
        created++;
      } catch {
        skipped++;
      }
    }

    res.json({ success: true, data: { created, skipped, total: machines.length } });
  } catch (error) {
    logger.error('Failed to import warehouse machines:', error);
    res.status(500).json({ error: 'Failed to import warehouse machines' });
  }
});

module.exports = router;
