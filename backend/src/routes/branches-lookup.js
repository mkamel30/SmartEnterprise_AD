const express = require('express');
const logger = require('../../utils/logger');
const router = express.Router();
const prisma = require('../db');
const { adminAuth } = require('../middleware/auth');

router.use(adminAuth);

router.get('/', async (req, res) => {
  try {
    const branches = await prisma.branch.findMany({
      where: { isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        address: true,
        phone: true,
        type: true,
        status: true,
        lastSeen: true,
        managerEmail: true,
      },
      orderBy: { name: 'asc' },
    });

    const lookup = branches.map((b) => ({
      value: b.id,
      label: `${b.name} (${b.code})`,
      code: b.code,
      name: b.name,
      status: b.status,
    }));

    res.json({ success: true, data: lookup, total: lookup.length });
  } catch (error) {
    logger.error('Failed to fetch branches lookup:', error);
    res.status(500).json({ error: 'Failed to fetch branches lookup' });
  }
});

module.exports = router;
