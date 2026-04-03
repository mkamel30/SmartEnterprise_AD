const express = require('express');
const logger = require('../../utils/logger');
const router = express.Router();
const prisma = require('../db');
const { adminAuth } = require('../middleware/auth');

router.use(adminAuth);

// --- Item Type Management ---
router.get('/settings/types', async (req, res) => {
    try {
        const types = await prisma.adminItemType.findMany({ orderBy: { code: 'asc' } });
        res.json(types);
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

router.post('/settings/types', async (req, res) => {
    try {
        const { code, name, category, requiresSerial } = req.body;
        const type = await prisma.adminItemType.create({ data: { code, name, category, requiresSerial } });
        res.json(type);
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

router.put('/settings/types/:id', async (req, res) => {
    try {
        const { code, name, category, requiresSerial } = req.body;
        const type = await prisma.adminItemType.update({
            where: { id: req.params.id },
            data: { code, name, category, requiresSerial }
        });
        res.json(type);
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

// --- Inventory ---
router.get('/inventory', async (req, res) => {
    try {
        const assets = await prisma.adminAsset.findMany({
            include: { itemType: true, carton: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json(assets);
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

router.post('/assets/manual', async (req, res) => {
    try {
        const { serialNumber, itemTypeCode, notes } = req.body;
        const asset = await prisma.adminAsset.create({
            data: {
                serialNumber,
                itemTypeCode,
                notes,
                status: 'AVAILABLE'
            }
        });
        
        await prisma.adminAssetHistory.create({
            data: {
                assetId: asset.id,
                action: 'ADMISSION_MANUAL',
                details: 'Manual asset entry into Administration Affairs Store',
                performedBy: req.admin.username
            }
        });

        res.json(asset);
    } catch (error) {
        logger.error('Manual intake error:', error);
        res.status(500).json({ error: 'Failed' });
    }
});

router.post('/assets/import', async (req, res) => {
    try {
        const { assets } = req.body;
        const results = [];
        
        for (const a of assets) {
            try {
                const created = await prisma.adminAsset.create({
                    data: {
                        serialNumber: a.serialNumber,
                        itemTypeCode: a.itemTypeCode,
                        status: 'AVAILABLE'
                    }
                });
                results.push(created);
            } catch (e) {
                logger.warn(`Import skip ${a.serialNumber}: ${e.message}`);
            }
        }
        res.json({ success: true, count: results.length });
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

// --- Carton Management ---
router.get('/cartons', async (req, res) => {
    try {
        const cartons = await prisma.adminCarton.findMany({
            include: { _count: { select: { assets: true } } }
        });
        res.json(cartons);
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

router.post('/cartons', async (req, res) => {
    try {
        const { cartonCode, description, assetIds } = req.body;
        const carton = await prisma.adminCarton.create({
            data: {
                cartonCode,
                description,
                assets: {
                    connect: assetIds.map(id => ({ id }))
                }
            }
        });
        res.json(carton);
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

// --- Transfers ---
router.post('/transfers/asset', async (req, res) => {
    try {
        const { assetId, targetBranchId, notes } = req.body;
        
        const asset = await prisma.adminAsset.update({
            where: { id: assetId },
            data: {
                status: 'TRANSFERRED',
                currentBranchId: targetBranchId,
                lastAction: 'BRANCH_TRANSFER'
            }
        });

        // Track History
        await prisma.adminAssetHistory.create({
            data: {
                assetId,
                action: 'TRANSFER_TO_BRANCH',
                toBranchId: targetBranchId,
                details: notes,
                performedBy: req.admin.username
            }
        });

        // Update Branch Stock count
        await prisma.adminStock.upsert({
            where: {
                itemTypeCode_branchId: {
                    itemTypeCode: asset.itemTypeCode,
                    branchId: targetBranchId
                }
            },
            update: { quantity: { increment: 1 } },
            create: {
                itemTypeCode: asset.itemTypeCode,
                branchId: targetBranchId,
                quantity: 1
            }
        });

        res.json({ success: true, asset });
    } catch (error) {
        logger.error('Transfer failed:', error);
        res.status(500).json({ error: 'Transfer failed' });
    }
});

// --- Stock Overview ---
router.get('/stocks', async (req, res) => {
    try {
        const stocks = await prisma.adminStock.findMany({
            include: { itemType: true }
        });
        res.json(stocks);
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

module.exports = router;
