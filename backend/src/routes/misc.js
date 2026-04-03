const express = require('express');
const router = express.Router();
const { adminAuth } = require('../middleware/auth');

router.use(adminAuth);

// --- AI Assistant Placeholder ---
router.post('/ai', async (req, res) => {
    res.json({ 
        message: 'AI Assistant features are currently being optimized for enterprise usage. Please try again later.',
        status: 'MAINTENANCE'
    });
});

// --- User Info Helper (Commonly called) ---
router.get('/info', async (req, res) => {
    res.json({
        id: req.admin.id,
        username: req.admin.username,
        name: req.admin.name,
        role: req.admin.role
    });
});

// --- Notifications ---
router.get('/notifications', async (req, res) => {
    res.json([]); // Empty for now
});

module.exports = router;
