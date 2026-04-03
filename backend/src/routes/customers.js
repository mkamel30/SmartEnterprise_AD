const express = require('express');
const logger = require('../../utils/logger');
const router = express.Router();
const prisma = require('../db');
const { adminAuth } = require('../middleware/auth');
const ExcelJS = require('exceljs');

router.use(adminAuth);

// Get all customers (Global View)
router.get('/', async (req, res) => {
    try {
        const { branchId, search } = req.query;
        const where = {};
        if (branchId) where.branchId = branchId;
        if (search) where.client_name = { contains: search, mode: 'insensitive' };

        const customers = await prisma.customer.findMany({
            where,
            include: { branch: true, machines: true },
            orderBy: { client_name: 'asc' }
        });
        res.json(customers);
    } catch (error) {
        logger.error('Failed to fetch customers:', error);
        res.status(500).json({ error: 'Failed to fetch customers' });
    }
});

// Get lite customer list for dropdowns
router.get('/lite', async (req, res) => {
    try {
        const { search, branchId } = req.query;
        const where = {};
        if (branchId) where.branchId = branchId;
        if (search) where.OR = [
            { client_name: { contains: search, mode: 'insensitive' } },
            { bkcode: { contains: search, mode: 'insensitive' } }
        ];

        const customers = await prisma.customer.findMany({
            where,
            select: { id: true, client_name: true, bkcode: true, branchId: true },
            orderBy: { client_name: 'asc' },
            take: 200
        });
        res.json(customers);
    } catch (error) {
        logger.error('Failed to fetch lite customers:', error);
        res.status(500).json({ error: 'Failed to fetch customers' });
    }
});

// Get single customer
router.get('/:id', async (req, res) => {
    try {
        const customer = await prisma.customer.findUnique({
            where: { id: req.params.id },
            include: { branch: true, machines: true }
        });
        if (!customer) return res.status(404).json({ error: 'Customer not found' });
        res.json(customer);
    } catch (error) {
        logger.error('Failed to fetch customer:', error);
        res.status(500).json({ error: 'Failed to fetch customer' });
    }
});

// Get customer machines
router.get('/:id/machines', async (req, res) => {
    try {
        const machines = await prisma.posMachine.findMany({
            where: { customerId: req.params.id },
            include: { branch: true }
        });
        res.json(machines);
    } catch (error) {
        logger.error('Failed to fetch customer machines:', error);
        res.status(500).json({ error: 'Failed to fetch customer machines' });
    }
});

// Get customer SIM cards
router.get('/:customerId/simcards', async (req, res) => {
    try {
        const sims = await prisma.simCard.findMany({
            where: { customerId: req.params.customerId },
            include: { branch: true }
        });
        res.json(sims);
    } catch (error) {
        logger.error('Failed to fetch customer SIMs:', error);
        res.status(500).json({ error: 'Failed to fetch SIM cards' });
    }
});

// Get customer SIM history
router.get('/:customerId/sim-history', async (req, res) => {
    try {
        const movements = await prisma.simMovementLog.findMany({
            where: { simId: { in: (await prisma.simCard.findMany({ where: { customerId: req.params.customerId }, select: { id: true } })).map(s => s.id) } },
            orderBy: { createdAt: 'desc' },
            take: 100
        });
        res.json(movements);
    } catch (error) {
        logger.error('Failed to fetch SIM history:', error);
        res.status(500).json({ error: 'Failed to fetch SIM history' });
    }
});

// Create Customer
router.post('/', async (req, res) => {
    try {
        const customer = await prisma.customer.create({
            data: req.body
        });
        res.status(201).json(customer);
    } catch (error) {
        logger.error('Failed to create customer:', error);
        res.status(500).json({ error: 'Failed to create customer' });
    }
});

// Update Customer
router.put('/:id', async (req, res) => {
    try {
        const customer = await prisma.customer.update({
            where: { id: req.params.id },
            data: req.body
        });
        res.json(customer);
    } catch (error) {
        logger.error('Failed to update customer:', error);
        res.status(500).json({ error: 'Failed to update customer' });
    }
});

// Delete Customer
router.delete('/:id', async (req, res) => {
    try {
        await prisma.customer.delete({ where: { id: req.params.id } });
        res.json({ message: 'Customer deleted' });
    } catch (error) {
        logger.error('Failed to delete customer:', error);
        res.status(500).json({ error: 'Failed to delete customer' });
    }
});

// Download import template
router.get('/template/download', async (req, res) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const ws = workbook.addWorksheet('Customers');
        ws.columns = [
            { header: 'bkcode', key: 'bkcode' },
            { header: 'client_name', key: 'client_name' },
            { header: 'supply_office', key: 'supply_office' },
            { header: 'telephone_1', key: 'telephone_1' },
            { header: 'telephone_2', key: 'telephone_2' },
            { header: 'address', key: 'address' },
            { header: 'contact_person', key: 'contact_person' }
        ];
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=customers_template.xlsx');
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        logger.error('Failed to generate template:', error);
        res.status(500).json({ error: 'Failed to generate template' });
    }
});

// Import customers
router.post('/import', async (req, res) => {
    try {
        res.json({ success: true, message: 'Import endpoint - use file upload middleware' });
    } catch (error) {
        logger.error('Failed to import customers:', error);
        res.status(500).json({ error: 'Failed to import customers' });
    }
});

// Export customers
router.get('/export', async (req, res) => {
    try {
        const customers = await prisma.customer.findMany({
            include: { branch: true },
            orderBy: { client_name: 'asc' }
        });

        const workbook = new ExcelJS.Workbook();
        const ws = workbook.addWorksheet('Customers');
        ws.columns = [
            { header: 'Code', key: 'bkcode' },
            { header: 'Name', key: 'client_name' },
            { header: 'Branch', key: 'branchName' },
            { header: 'Phone', key: 'telephone_1' },
            { header: 'Address', key: 'address' }
        ];
        customers.forEach(c => ws.addRow({ bkcode: c.bkcode, client_name: c.client_name, branchName: c.branch?.name || '-', telephone_1: c.telephone_1 || '', address: c.address || '' }));

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=customers_export_${new Date().toISOString().split('T')[0]}.xlsx`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        logger.error('Failed to export customers:', error);
        res.status(500).json({ error: 'Failed to export customers' });
    }
});

module.exports = router;
