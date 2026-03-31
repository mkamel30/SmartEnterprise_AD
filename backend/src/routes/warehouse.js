const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { adminAuth } = require('../middleware/auth');

router.use(adminAuth);

// Get Global Warehouse Inventory (New & Standby)
router.get('/machines', async (req, res) => {
    try {
        const { branchId } = req.query;
        const where = branchId ? { branchId } : {};
        
        const machines = await prisma.warehouseMachine.findMany({
            where,
            include: { branch: true },
            orderBy: { serialNumber: 'asc' }
        });
        res.json(machines);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch warehouse machines' });
    }
});

// Alias for BranchInventoryModal compatibility
router.get('/', async (req, res) => {
    try {
        const { branchId } = req.query;
        if (!branchId) return res.status(400).json({ error: 'branchId required' });
        
        const machines = await prisma.warehouseMachine.findMany({
            where: { branchId },
            include: { branch: true },
            orderBy: { serialNumber: 'asc' }
        });
        res.json(machines);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch branch warehouse' });
    }
});

// Get Active Fleet (At Customers)
router.get('/fleet', async (req, res) => {
    try {
        const fleet = await prisma.posMachine.findMany({
            include: { branch: true, customer: true },
            orderBy: { serialNumber: 'asc' }
        });
        res.json(fleet);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch fleet' });
    }
});

module.exports = router;
