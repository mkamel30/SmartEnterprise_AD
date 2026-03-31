const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { adminAuth } = require('../middleware/auth');

router.use(adminAuth);

// Get SIM cards linked to a specific branch
router.get('/', async (req, res) => {
    try {
        const { branchId } = req.query;
        if (!branchId) {
            return res.status(400).json({ error: 'branchId is required' });
        }

        const sims = await prisma.simCard.findMany({
            where: { branchId },
            include: { customer: true }
        });

        res.json({ success: true, data: sims });
    } catch (error) {
        console.error('Failed to fetch sim cards:', error);
        res.status(500).json({ error: 'Failed to fetch sim cards' });
    }
});

module.exports = router;
