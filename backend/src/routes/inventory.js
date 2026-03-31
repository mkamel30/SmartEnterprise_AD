const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { adminAuth } = require('../middleware/auth');

router.use(adminAuth);

// Get inventory for a specific branch
router.get('/', async (req, res) => {
    try {
        const { branchId } = req.query;
        if (!branchId) {
            return res.status(400).json({ error: 'branchId is required' });
        }

        // Fetch AdminStock for the branch, which tracks quantities of AdminItemTypes
        const stocks = await prisma.adminStock.findMany({
            where: { branchId },
            include: {
                itemType: true
            }
        });

        // Format to match what BranchInventoryModal expects (name, quantity)
        const formatted = stocks.map(s => ({
            id: s.id,
            name: s.itemType.name,
            partNumber: s.itemType.code,
            quantity: s.quantity
        }));

        res.json({ success: true, data: formatted });
    } catch (error) {
        console.error('Failed to fetch branch inventory:', error);
        res.status(500).json({ error: 'Failed to fetch branch inventory' });
    }
});

module.exports = router;
