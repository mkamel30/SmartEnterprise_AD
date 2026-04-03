const express = require('express');
const logger = require('../../utils/logger');
const router = express.Router();
const prisma = require('../db');
const { adminAuth } = require('../middleware/auth');

router.use(adminAuth);

// Get all maintenance requests with filters
router.get('/', async (req, res) => {
    try {
        const { branchId, status, startDate, endDate, search } = req.query;
        
        const where = {};
        
        // Branch filter
        if (branchId) {
            where.branchId = branchId;
        }
        
        // Status filter
        if (status && status !== 'ALL') {
            where.status = status;
        }
        
        // Date filter
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                where.createdAt.lte = end;
            }
        }

        const requests = await prisma.maintenanceRequest.findMany({
            where,
            include: {
                branch: { select: { id: true, name: true } },
                customer: { select: { id: true, client_name: true, bkcode: true } },
                posMachine: { select: { serialNumber: true, model: true } }
            },
            orderBy: { createdAt: 'desc' },
            take: 500
        });

        // Format response
        const formatted = requests.map(r => ({
            id: r.id,
            date: r.createdAt,
            branchId: r.branchId,
            branchName: r.branch?.name || '-',
            customerId: r.customerId,
            customerName: r.customer?.client_name || '-',
            customerCode: r.customer?.bkcode || '-',
            machineSerial: r.serialNumber || r.posMachine?.serialNumber || '-',
            machineModel: r.model || r.posMachine?.model || '-',
            status: r.status,
            actionTaken: r.actionTaken || '-',
            technicianName: r.technician || '-',
            receiptNumber: r.receiptNumber,
            totalCost: r.totalCost || 0,
            notes: r.notes
        }));

        // Search filter
        let filtered = formatted;
        if (search) {
            const s = search.toLowerCase();
            filtered = formatted.filter(r => 
                r.customerName.toLowerCase().includes(s) ||
                r.machineSerial.toLowerCase().includes(s) ||
                r.branchName.toLowerCase().includes(s)
            );
        }

        res.json({ success: true, data: filtered, total: filtered.length });
    } catch (error) {
        logger.error('Failed to fetch maintenance requests:', error);
        res.status(500).json({ error: 'Failed to fetch maintenance requests' });
    }
});

// Export to Excel
router.get('/export', async (req, res) => {
    try {
        const { branchId, status, startDate, endDate } = req.query;
        
        const where = {};
        
        if (branchId) where.branchId = branchId;
        if (status && status !== 'ALL') where.status = status;
        
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                where.createdAt.lte = end;
            }
        }

        const requests = await prisma.maintenanceRequest.findMany({
            where,
            include: {
                branch: { select: { name: true } },
                customer: { select: { client_name: true, bkcode: true } },
                posMachine: { select: { serialNumber: true, model: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        const statusMap = {
            'NEW': 'جديد',
            'ASSIGNED': 'محدد له فني',
            'IN_PROGRESS': 'قيد الصيانة',
            'PENDING_APPROVAL': 'في انتظار الموافقة',
            'PENDING_PARTS': 'في انتظار قطع الغيار',
            'CLOSED': 'مغلق',
            'CANCELLED': 'ملغى'
        };

        const data = requests.map(r => ({
            'التاريخ': new Date(r.createdAt).toLocaleString('ar-EG'),
            'الفرع': r.branch?.name || '-',
            'العميل': r.customer?.client_name || '-',
            'كود العميل': r.customer?.bkcode || '-',
            'سيريال الماكينة': r.serialNumber || r.posMachine?.serialNumber || '-',
            'موديل الماكينة': r.model || r.posMachine?.model || '-',
            'الحالة': statusMap[r.status] || r.status,
            'الاجمالي': r.totalCost || 0,
            'رقم الايصال': r.receiptNumber || '-',
            'الفني': r.technician || '-',
            'الاجراء المتخذ': r.actionTaken || '-',
            'ملاحظات': r.notes || '-'
        }));

        res.json({ success: true, data, count: data.length });
    } catch (error) {
        logger.error('Failed to export maintenance requests:', error);
        res.status(500).json({ error: 'Failed to export maintenance requests' });
    }
});

// Get summary stats
router.get('/summary', async (req, res) => {
    try {
        const { branchId, startDate, endDate } = req.query;
        
        const where = {};
        if (branchId) where.branchId = branchId;
        
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                where.createdAt.lte = end;
            }
        }

        // Get counts by status
        const statusCounts = await prisma.maintenanceRequest.groupBy({
            by: ['status'],
            where,
            _count: true
        });

        // Get total
        const total = await prisma.maintenanceRequest.count({ where });

        // Get total cost for closed requests
        const costAggregation = await prisma.maintenanceRequest.aggregate({
            where: { ...where, status: 'CLOSED' },
            _sum: { totalCost: true }
        });

        const statusMap = {
            'NEW': 'جديد',
            'ASSIGNED': 'محدد له فني',
            'IN_PROGRESS': 'قيد الصيانة',
            'PENDING_APPROVAL': 'في انتظار الموافقة',
            'PENDING_PARTS': 'في انتظار قطع الغيار',
            'CLOSED': 'مغلق',
            'CANCELLED': 'ملغى'
        };

        const statusBreakdown = statusCounts.reduce((acc, s) => {
            acc[statusMap[s.status] || s.status] = s._count;
            return acc;
        }, {});

        res.json({
            success: true,
            total,
            totalCost: costAggregation._sum.totalCost || 0,
            statusBreakdown
        });
    } catch (error) {
        logger.error('Failed to fetch summary:', error);
        res.status(500).json({ error: 'Failed to fetch summary' });
    }
});

module.exports = router;