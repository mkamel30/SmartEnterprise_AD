const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { adminAuth } = require('../middleware/auth');
const syncQueueService = require('../services/syncQueue.service');
const logger = require('../../utils/logger');
const ExcelJS = require('exceljs');

router.use(adminAuth);

// Get all Master Spare Parts
router.get('/', async (req, res) => {
    try {
        const parts = await prisma.masterSparePart.findMany({
            orderBy: { name: 'asc' }
        });
        res.json(parts);
    } catch (error) {
        logger.error('Failed to fetch master spare parts:', error);
        res.status(500).json({ error: 'Failed to fetch master spare parts' });
    }
});

// Broadcast master spare parts to all branches
router.post('/broadcast', async (req, res) => {
    try {
        const masterParts = await prisma.masterSparePart.findMany();
        await syncQueueService.enqueueUpdate('SPARE_PART', 'BROADCAST', masterParts);
        res.json({ message: 'Spare parts broadcast initiated' });
    } catch (error) {
        logger.error('Broadcast failed:', error);
        res.status(500).json({ error: 'Broadcast failed' });
    }
});

// Create Master Spare Part
router.post('/', async (req, res) => {
    try {
        let { partNumber, name, description, compatibleModels, defaultCost, isConsumable, allowsMultiple, maxQuantity, category } = req.body;
        
        if (!name) {
            return res.status(400).json({ error: 'Part Name is required' });
        }

        // Auto-generate part number if missing
        if (!partNumber) {
            const lastPart = await prisma.masterSparePart.findFirst({
                where: { partNumber: { startsWith: 'SP' } },
                orderBy: { partNumber: 'desc' }
            });
            let nextNum = 1;
            if (lastPart?.partNumber) {
                nextNum = parseInt(lastPart.partNumber.substring(2)) + 1;
            }
            partNumber = `SP${String(nextNum).padStart(4, '0')}`;
            while (await prisma.masterSparePart.findUnique({ where: { partNumber } })) {
                nextNum++;
                partNumber = `SP${String(nextNum).padStart(4, '0')}`;
            }
        }

        let finalCost = parseFloat(defaultCost);
        if (isNaN(finalCost)) finalCost = 0;

        let finalMaxQty = parseInt(maxQuantity);
        if (isNaN(finalMaxQty) || finalMaxQty < 1) finalMaxQty = 1;

        const part = await prisma.masterSparePart.create({
            data: { 
                partNumber, 
                name, 
                description, 
                compatibleModels, 
                defaultCost: finalCost, 
                isConsumable: !!isConsumable,
                allowsMultiple: !!allowsMultiple,
                maxQuantity: finalMaxQty,
                category 
            }
        });

        await syncQueueService.enqueueUpdate('SPARE_PART', 'UPSERT', part);

        res.status(201).json(part);
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Part Number already exists' });
        }
        logger.error('Failed to create master spare part:', error);
        res.status(500).json({ error: 'Failed to create master spare part' });
    }
});

// Update Master Spare Part
router.put('/:id', async (req, res) => {
    try {
        const { partNumber, name, description, compatibleModels, defaultCost, isConsumable, allowsMultiple, maxQuantity, category } = req.body;
        
        const oldPart = await prisma.masterSparePart.findUnique({ where: { id: req.params.id } });
        let finalCost = parseFloat(defaultCost);
        if (isNaN(finalCost)) finalCost = 0;

        let finalMaxQty = parseInt(maxQuantity);
        if (isNaN(finalMaxQty) || finalMaxQty < 1) finalMaxQty = 1;

        console.log(`[SpareParts] Updating part ${req.params.id}:`, { name, partNumber, finalCost, finalMaxQty });
        
        if (oldPart && oldPart.defaultCost !== finalCost) {
            console.log(`[SpareParts] Price change detected for ${req.params.id}. Creating log...`);
            await prisma.sparePartPriceLog.create({
                data: {
                    partId: req.params.id,
                    oldCost: oldPart.defaultCost,
                    newCost: finalCost,
                    changedBy: req.admin?.name || req.admin?.username || 'Admin'
                }
            });
        }

        console.log(`[SpareParts] Executing Prisma update for ${req.params.id}...`);
        const part = await prisma.masterSparePart.update({
            where: { id: req.params.id },
            data: { 
                partNumber, 
                name, 
                description, 
                compatibleModels, 
                defaultCost: finalCost, 
                isConsumable: !!isConsumable,
                allowsMultiple: !!allowsMultiple,
                maxQuantity: finalMaxQty,
                category 
            }
        });

        console.log(`[SpareParts] Update successful for ${req.params.id}. Enqueuing sync...`);
        await syncQueueService.enqueueUpdate('SPARE_PART', 'UPDATE', part);

        res.json(part);
    } catch (error) {
        console.error(`[SpareParts] CRITICAL ERROR during update of ${req.params.id}:`, error);
        logger.error({ err: error.message, stack: error.stack }, 'Failed to update master spare part');
        res.status(500).json({ 
            error: 'Failed to update master spare part', 
            details: error.message,
            code: error.code
        });
    }
});

// Get all price logs (admin-level, with part details)
router.get('/price-logs', async (req, res) => {
    try {
        const { limit = 100, offset = 0 } = req.query;
        const logs = await prisma.sparePartPriceLog.findMany({
            include: { part: { select: { id: true, name: true, partNumber: true, defaultCost: true } } },
            orderBy: { changedAt: 'desc' },
            take: parseInt(limit),
            skip: parseInt(offset)
        });
        const total = await prisma.sparePartPriceLog.count();
        res.json({ success: true, data: logs, total });
    } catch (error) {
        logger.error('Failed to fetch all price logs:', error);
        res.status(500).json({ error: 'Failed to fetch price logs' });
    }
});

// Get spare parts additions log (IN / TRANSFER_IN movements)
router.get('/additions-log', async (req, res) => {
    try {
        const { branchId, limit = 100, offset = 0 } = req.query;
        const where = { type: { in: ['IN', 'TRANSFER_IN'] } };
        if (branchId) where.branchId = branchId;

        const movements = await prisma.stockMovement.findMany({
            where,
            include: {
                branch: { select: { id: true, code: true, name: true } },
                part: { select: { id: true, name: true, partNumber: true } }
            },
            orderBy: { createdAt: 'desc' },
            take: parseInt(limit),
            skip: parseInt(offset)
        });

        const total = await prisma.stockMovement.count({ where });

        const data = movements.map(m => ({
            id: m.id,
            date: m.createdAt,
            branchName: m.branch?.name || '-',
            branchCode: m.branch?.code || '-',
            partName: m.part?.name || '-',
            partCode: m.part?.partNumber || '-',
            quantity: m.quantity,
            type: m.type,
            performedBy: m.performedBy || '-'
        }));

        res.json({ success: true, data, total });
    } catch (error) {
        logger.error('Failed to fetch additions log:', error);
        res.status(500).json({ error: 'Failed to fetch additions log' });
    }
});

// Get price change logs for a spare part
router.get('/:id/price-logs', async (req, res) => {
    try {
        const logs = await prisma.sparePartPriceLog.findMany({
            where: { partId: req.params.id },
            orderBy: { changedAt: 'desc' }
        });
        res.json(logs);
    } catch (error) {
        logger.error('Failed to fetch price logs:', error);
        res.status(500).json({ error: 'Failed to fetch price logs' });
    }
});

// Bulk delete master spare parts
router.post('/bulk-delete', async (req, res) => {
    try {
        const { ids, userId, userName, branchId } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ids array is required' });
        }

        await prisma.masterSparePart.deleteMany({
            where: { id: { in: ids } }
        });

        for (const id of ids) {
            await syncQueueService.enqueueUpdate('SPARE_PART', 'DELETE', { id });
        }

        res.json({ message: `${ids.length} spare parts deleted successfully` });
    } catch (error) {
        logger.error('Bulk delete failed:', error);
        res.status(500).json({ error: 'Bulk delete failed' });
    }
});

// Import master spare parts from Excel (client-side parsed)
router.post('/import', async (req, res) => {
    try {
        const { parts } = req.body;
        if (!parts || !Array.isArray(parts)) {
            return res.status(400).json({ error: 'parts array is required' });
        }

        const results = { imported: 0, skipped: 0, errors: 0 };
        const syncedParts = [];

        for (const item of parts) {
            if (!item.name || !item.name.trim()) {
                results.skipped++;
                continue;
            }

            try {
                const existing = await prisma.masterSparePart.findFirst({
                    where: { name: item.name.trim() }
                });

                if (existing) {
                    await prisma.masterSparePart.update({
                        where: { id: existing.id },
                        data: {
                            compatibleModels: item.compatibleModels || existing.compatibleModels,
                            defaultCost: parseFloat(item.defaultCost) || existing.defaultCost,
                            isConsumable: !!item.isConsumable,
                            allowsMultiple: item.allowsMultiple !== undefined ? !!item.allowsMultiple : existing.allowsMultiple,
                            maxQuantity: item.maxQuantity ? parseInt(item.maxQuantity) : existing.maxQuantity
                        }
                    });
                } else {
                    // Auto-generate part number
                    let partNumber = item.partNumber;
                    if (!partNumber) {
                        const lastPart = await prisma.masterSparePart.findFirst({
                            where: { partNumber: { startsWith: 'SP' } },
                            orderBy: { partNumber: 'desc' }
                        });
                        let nextNum = 1;
                        if (lastPart?.partNumber) {
                            nextNum = parseInt(lastPart.partNumber.substring(2)) + 1;
                        }
                        partNumber = `SP${String(nextNum).padStart(4, '0')}`;
                        while (await prisma.masterSparePart.findUnique({ where: { partNumber } })) {
                            nextNum++;
                            partNumber = `SP${String(nextNum).padStart(4, '0')}`;
                        }
                    }

                    const created = await prisma.masterSparePart.create({
                        data: {
                            partNumber,
                            name: item.name.trim(),
                            compatibleModels: item.compatibleModels || null,
                            defaultCost: parseFloat(item.defaultCost) || 0,
                            isConsumable: !!item.isConsumable,
                            allowsMultiple: !!item.allowsMultiple,
                            maxQuantity: parseInt(item.maxQuantity) || 1
                        }
                    });
                    syncedParts.push(created);
                }

                results.imported++;
            } catch (e) {
                results.errors++;
                logger.warn('Import item error:', e.message);
            }
        }

        if (syncedParts.length > 0) {
            await syncQueueService.enqueueUpdate('SPARE_PART', 'BROADCAST', syncedParts);
        }

        res.json({
            message: `تم استيراد ${results.imported} قطعة بنجاح`,
            imported: results.imported,
            skipped: results.skipped,
            errors: results.errors
        });
    } catch (error) {
        logger.error('Import failed:', error);
        res.status(500).json({ error: 'Import failed' });
    }
});

// Delete Master Spare Part
router.delete('/:id', async (req, res) => {
    try {
        await prisma.masterSparePart.delete({
            where: { id: req.params.id }
        });

        await syncQueueService.enqueueUpdate('SPARE_PART', 'DELETE', { id: req.params.id });

        res.json({ message: 'Master spare part deleted successfully' });
    } catch (error) {
        logger.error('Failed to delete master spare part:', error);
        res.status(500).json({ error: 'Failed to delete master spare part' });
    }
});

// Download template
router.get('/template/download', async (req, res) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const ws = workbook.addWorksheet('Spare Parts');
        ws.columns = [
            { header: 'Name', key: 'name' },
            { header: 'Code', key: 'code' },
            { header: 'Default Cost', key: 'defaultCost' },
            { header: 'Category', key: 'category' }
        ];
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=spare_parts_template.xlsx');
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        logger.error('Template generation failed:', error);
        res.status(500).json({ error: 'Failed to generate template' });
    }
});

// Export spare parts
router.get('/export', async (req, res) => {
    try {
        const parts = await prisma.masterSparePart.findMany({
            orderBy: { name: 'asc' }
        });

        const workbook = new ExcelJS.Workbook();
        const ws = workbook.addWorksheet('Spare Parts');
        ws.columns = [
            { header: 'Name', key: 'name' },
            { header: 'Code', key: 'code' },
            { header: 'Default Cost', key: 'defaultCost' },
            { header: 'Category', key: 'category' }
        ];
        parts.forEach(p => ws.addRow({ name: p.name, code: p.code, defaultCost: p.defaultCost, category: p.category || '' }));

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=spare_parts_export_${new Date().toISOString().split('T')[0]}.xlsx`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        logger.error('Export failed:', error);
        res.status(500).json({ error: 'Failed to export spare parts' });
    }
});

module.exports = router;
