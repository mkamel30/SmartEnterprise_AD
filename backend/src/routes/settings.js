const express = require('express');
const router = express.Router();
const prisma = require('../db');

const asyncHandler = fn => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

const { adminAuth } = require('../middleware/auth');

router.get('/client-types', adminAuth, asyncHandler(async (req, res) => {
    const types = await prisma.clientType.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' }
    });
    res.json(types);
}));

router.post('/client-types', adminAuth, asyncHandler(async (req, res) => {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });

    const type = await prisma.clientType.create({
        data: { name, description }
    });
    res.status(201).json(type);
}));

router.put('/client-types/:id', adminAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, description } = req.body;

    const type = await prisma.clientType.update({
        where: { id },
        data: { name, description }
    });
    res.json(type);
}));

router.delete('/client-types/:id', adminAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    await prisma.clientType.update({
        where: { id },
        data: { isActive: false }
    });
    res.json({ message: 'تم الحذف بنجاح' });
}));

module.exports = router;
