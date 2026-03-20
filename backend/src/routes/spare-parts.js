const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { adminAuth } = require('../middleware/auth');

router.use(adminAuth);

const syncQueueService = require('../services/syncQueue.service');

// Get all Master Spare Parts
router.get('/', async (req, res) => {
    try {
        const parts = await prisma.masterSparePart.findMany({
            orderBy: { name: 'asc' }
        });
        res.json(parts);
    } catch (error) {
        console.error('Failed to fetch master spare parts:', error);
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
        console.error('Broadcast failed:', error);
        res.status(500).json({ error: 'Broadcast failed' });
    }
});

// Create Master Spare Part
router.post('/', async (req, res) => {
    try {
        const { partNumber, name, description, compatibleModels, defaultCost, isConsumable, category } = req.body;
        
        if (!name) {
            return res.status(400).json({ error: 'Part Name is required' });
        }

        const part = await prisma.masterSparePart.create({
            data: { 
                partNumber, 
                name, 
                description, 
                compatibleModels, 
                defaultCost: parseFloat(defaultCost) || 0, 
                isConsumable: !!isConsumable, 
                category 
            }
        });

        await syncQueueService.enqueueUpdate('SPARE_PART', 'UPSERT', part);

        res.status(201).json(part);
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Part Number already exists' });
        }
        console.error('Failed to create master spare part:', error);
        res.status(500).json({ error: 'Failed to create master spare part' });
    }
});

// Update Master Spare Part
router.put('/:id', async (req, res) => {
    try {
        const { partNumber, name, description, compatibleModels, defaultCost, isConsumable, category } = req.body;
        
        const oldPart = await prisma.masterSparePart.findUnique({ where: { id: req.params.id } });
        const newCost = parseFloat(defaultCost);

        if (oldPart && oldPart.defaultCost !== newCost) {
            await prisma.sparePartPriceLog.create({
                data: {
                    partId: req.params.id,
                    oldCost: oldPart.defaultCost,
                    newCost,
                    changedBy: req.user?.name || req.user?.username || 'Admin'
                }
            });
        }

        const part = await prisma.masterSparePart.update({
            where: { id: req.params.id },
            data: { 
                partNumber, 
                name, 
                description, 
                compatibleModels, 
                defaultCost: newCost, 
                isConsumable: !!isConsumable, 
                category 
            }
        });

        await syncQueueService.enqueueUpdate('SPARE_PART', 'UPDATE', part);

        res.json(part);
    } catch (error) {
        console.error('Failed to update master spare part:', error);
        res.status(500).json({ error: 'Failed to update master spare part' });
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
        console.error('Failed to fetch price logs:', error);
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
        console.error('Bulk delete failed:', error);
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
                            isConsumable: !!item.allowsMultiple
                        }
                    });
                } else {
                    const created = await prisma.masterSparePart.create({
                        data: {
                            name: item.name.trim(),
                            compatibleModels: item.compatibleModels || null,
                            defaultCost: parseFloat(item.defaultCost) || 0,
                            isConsumable: !!item.allowsMultiple
                        }
                    });
                    syncedParts.push(created);
                }

                results.imported++;
            } catch (e) {
                results.errors++;
                console.warn('Import item error:', e.message);
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
        console.error('Import failed:', error);
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
        console.error('Failed to delete master spare part:', error);
        res.status(500).json({ error: 'Failed to delete master spare part' });
    }
});

module.exports = router;
