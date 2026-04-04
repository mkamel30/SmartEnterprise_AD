const express = require('express');
const logger = require('../../utils/logger');
const router = express.Router();
const prisma = require('../db');
const { adminAuth } = require('../middleware/auth');

router.use(adminAuth);

// Get SIM cards (optionally filtered by branch)
router.get('/', async (req, res) => {
    try {
        const { branchId } = req.query;
        
        const where = branchId ? { branchId } : {};
        
        const sims = await prisma.simCard.findMany({
            where,
            include: { customer: true }
        });

        res.json({ success: true, data: sims });
    } catch (error) {
        logger.error('Failed to fetch sim cards:', error);
        res.status(500).json({ error: 'Failed to fetch sim cards' });
    }
});

module.exports = router;
