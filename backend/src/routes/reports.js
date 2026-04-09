const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { adminAuth } = require('../middleware/auth');
const logger = require('../../utils/logger');

router.use(adminAuth);





router.get('/inventory-valuation', async (req, res) => {
    try {
        const inventory = await prisma.branchSparePart.findMany({
            include: {
                part: { select: { name: true, defaultCost: true } },
                branch: { select: { name: true } }
            }
        });

        let totalValuation = 0;
        const branchValuation = {};

        inventory.forEach(item => {
            const cost = item.part?.defaultCost || 0;
            const val = (item.quantity || 0) * cost;
            totalValuation += val;
            
            const bName = item.branch?.name || 'Unknown';
            branchValuation[bName] = (branchValuation[bName] || 0) + val;
        });

        res.json({
            totalValuation,
            branchValuation,
            itemCount: inventory.length
        });
    } catch (error) {
        logger.error({ err: error.message }, 'Inventory valuation failed');
        res.status(500).json({ error: 'فشل في تقييم المخزون' });
    }
});

router.get('/movements', async (req, res) => {
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

        const movements = await prisma.stockMovement.findMany({
            where,
            include: { branch: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'desc' },
            take: 500
        });

        res.json({ success: true, data: movements, total: movements.length });
    } catch (error) {
        logger.error('Movements report failed:', error);
        res.status(500).json({ error: 'Failed to fetch movements' });
    }
});

router.get('/performance', async (req, res) => {
    try {
        const { branchId, startDate, endDate } = req.query;
        const where = { status: 'Closed' };
        if (branchId) where.branchId = branchId;
        if (startDate || endDate) {
            where.closingTimestamp = {};
            if (startDate) where.closingTimestamp.gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                where.closingTimestamp.lte = end;
            }
        }

        const [requests, payments] = await Promise.all([
            prisma.maintenanceRequest.findMany({ 
                where, 
                select: { 
                    id: true, 
                    createdAt: true, 
                    closingTimestamp: true, 
                    totalCost: true,
                    usedParts: true,
                    branch: { select: { name: true } }
                } 
            }),
            prisma.payment.findMany({ 
                where: { 
                    ...(branchId ? { branchId } : {}),
                    ...(startDate ? { createdAt: { gte: new Date(startDate) } } : {}),
                    ...(endDate ? { createdAt: { lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)) } } : {})
                },
                select: { amount: true } 
            })
        ]);

        const totalRevenue = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
        const allDurations = requests.map(r => new Date(r.closingTimestamp).getTime() - new Date(r.createdAt).getTime()).filter(d => d > 0);
        const avgTimeMs = allDurations.length > 0 ? allDurations.reduce((s, d) => s + d, 0) / allDurations.length : 0;

        res.json({ 
            success: true, 
            totalRequests: requests.length, 
            totalRevenue,
            avgTimeToCompletionHours: (avgTimeMs / (1000 * 60 * 60)).toFixed(1),
            onTimeRate: requests.length > 0 ? Math.round((requests.filter(r => (new Date(r.closingTimestamp).getTime() - new Date(r.createdAt).getTime()) < 48 * 60 * 60 * 1000).length / requests.length) * 100) : 100
        });
    } catch (error) {
        logger.error('Performance report failed:', error);
        res.status(500).json({ error: 'Failed to fetch performance' });
    }
});



router.get('/monthly-closing', async (req, res) => {
    try {
        const { month, branchId } = req.query;
        if (!month || !/^\d{4}-\d{2}$/.test(month)) {
            return res.status(400).json({ error: 'الشهر مطلوب بصيغة YYYY-MM' });
        }

        const [year, mon] = month.split('-').map(Number);
        const startDate = new Date(year, mon - 1, 1);
        const endDate = new Date(year, mon, 0, 23, 59, 59, 999);
        const today = new Date();

        let allBranchIds = [];
        let branchInfo = null;
        let childBranchesList = [];

        if (branchId) {
            const branch = await prisma.branch.findUnique({
                where: { id: branchId },
                include: { childBranches: { where: { isActive: true }, select: { id: true, name: true, code: true } } }
            });
            if (!branch) return res.status(404).json({ error: 'الفرع غير موجود' });
            
            branchInfo = { id: branch.id, name: branch.name, code: branch.code };
            childBranchesList = branch.childBranches || [];
            allBranchIds = [branchId, ...childBranchesList.map(c => c.id)];
        } else {
            const allBranches = await prisma.branch.findMany({
                where: { isActive: true },
                select: { id: true, name: true, code: true }
            });
            branchInfo = { id: 'ALL', name: 'الشركة (إجمالي الفروع)', code: 'ALL' };
            childBranchesList = allBranches;
            allBranchIds = allBranches.map(b => b.id);
        }

        const dateFilter = { gte: startDate, lte: endDate };

        const [
            cashSales, installmentSales,
            collectedInstallments, overdueInstallments, upcomingInstallments,
            paidParts, freeParts, usedPartLogs,
            machineCount, simCount, outgoingTransfers, incomingTransfers,
            childBranchData
        ] = await Promise.all([
            // Sales
            prisma.machineSale.findMany({
                where: { branchId: { in: allBranchIds }, saleDate: dateFilter, type: 'CASH' },
                include: { customer: { select: { client_name: true, bkcode: true } }, branch: { select: { name: true } } },
                orderBy: { saleDate: 'desc' }
            }),
            prisma.machineSale.findMany({
                where: { branchId: { in: allBranchIds }, saleDate: dateFilter, type: { in: ['INSTALLMENT', 'LEGACY_INSTALLMENT'] } },
                include: { customer: { select: { client_name: true, bkcode: true } }, branch: { select: { name: true } } },
                orderBy: { saleDate: 'desc' }
            }),
            // Installments
            prisma.installment.findMany({
                where: { branchId: { in: allBranchIds }, isPaid: true, paidAt: dateFilter },
                include: { sale: { include: { customer: { select: { client_name: true, bkcode: true } }, branch: { select: { name: true } } } } },
                orderBy: { paidAt: 'desc' }
            }),
            prisma.installment.findMany({
                where: { branchId: { in: allBranchIds }, isPaid: false, dueDate: { lt: endDate } },
                include: { sale: { include: { customer: { select: { client_name: true, bkcode: true } }, branch: { select: { name: true } } } } },
                orderBy: { dueDate: 'asc' }
            }),
            prisma.installment.findMany({
                where: { branchId: { in: allBranchIds }, isPaid: false, dueDate: { gt: endDate } },
                include: { sale: { include: { customer: { select: { client_name: true, bkcode: true } }, branch: { select: { name: true } } } } },
                orderBy: { dueDate: 'asc' }, take: 50
            }),
            // Parts
            prisma.stockMovement.findMany({
                where: { branchId: { in: allBranchIds }, type: 'OUT', isPaid: true, createdAt: dateFilter },
                include: { request: { select: { customerName: true, customerBkcode: true } }, branch: { select: { name: true } } },
                orderBy: { createdAt: 'desc' }
            }),
            prisma.stockMovement.findMany({
                where: { branchId: { in: allBranchIds }, type: 'OUT', isPaid: false, createdAt: dateFilter },
                include: { request: { select: { customerName: true, customerBkcode: true } }, branch: { select: { name: true } } },
                orderBy: { createdAt: 'desc' }
            }),
            prisma.usedPartLog.findMany({
                where: { branchId: { in: allBranchIds }, closedAt: dateFilter },
                include: { branch: { select: { name: true } } },
                orderBy: { closedAt: 'desc' }
            }),
            // Inventory
            prisma.warehouseMachine.count({ where: { branchId: { in: allBranchIds }, status: 'IN_STOCK' } }),
            prisma.warehouseSim.count({ where: { branchId: { in: allBranchIds }, status: 'ACTIVE' } }),
            prisma.transferOrder.count({ where: { fromBranchId: { in: allBranchIds }, createdAt: dateFilter } }),
            prisma.transferOrder.count({ where: { toBranchId: { in: allBranchIds }, createdAt: dateFilter } }),
            // Branch aggregation loop
            childBranchesList.length > 0 ? Promise.all(childBranchesList.map(async (child) => {
                const [sales, installments, parts] = await Promise.all([
                    prisma.machineSale.aggregate({ where: { branchId: child.id, saleDate: dateFilter }, _sum: { totalPrice: true, paidAmount: true }, _count: true }),
                    prisma.installment.aggregate({ where: { branchId: child.id, isPaid: true, paidAt: dateFilter }, _sum: { paidAmount: true }, _count: true }),
                    prisma.stockMovement.count({ where: { branchId: child.id, type: 'OUT', createdAt: dateFilter } })
                ]);
                return { branchId: child.id, branchName: child.name, branchCode: child.code, sales: { count: sales._count, totalPrice: sales._sum.totalPrice || 0, paidAmount: sales._sum.paidAmount || 0 }, installmentsCollected: { count: installments._count, amount: installments._sum.paidAmount || 0 }, partsOut: parts };
            })) : []
        ]);
        // Helper for formatting customer names
        const getDisplayName = (c) => {
            if (!c) return '-';
            if (!c.client_name || c.client_name === 'غير معروف (تلقائي)' || c.client_name === 'غير معروف') {
                return c.bkcode || 'غير معروف';
            }
            return c.client_name;
        };

        const cashTotal = cashSales.reduce((sum, s) => sum + s.totalPrice, 0); const cashPaid = cashSales.reduce((sum, s) => sum + s.paidAmount, 0);
        const installmentTotal = installmentSales.reduce((sum, s) => sum + s.totalPrice, 0); const installmentPaid = installmentSales.reduce((sum, s) => sum + s.paidAmount, 0);
        const collectedTotal = collectedInstallments.reduce((sum, i) => sum + (i.paidAmount || i.amount), 0);
        const overdueTotal = overdueInstallments.reduce((sum, i) => sum + i.amount, 0);
        const upcomingTotal = upcomingInstallments.reduce((sum, i) => sum + i.amount, 0);

        let totalPaidPartsValue = 0; let totalFreePartsValue = 0;
        const partFrequencyMap = {}; const paidPartItems = []; const freePartItems = [];

        usedPartLogs.forEach(log => {
            let parts = []; try { parts = JSON.parse(log.parts || '[]'); } catch (e) { parts = []; }
            parts.forEach(p => {
                const partName = p.name || p.partName || 'غير معروف'; const qty = p.quantity || 1; const unitCost = parseFloat(p.cost) || 0; const isPaid = !!p.isPaid;
                const partItem = { partName, quantity: qty, unitCost, totalValue: unitCost * qty, customerName: log.customerName, customerBkcode: log.customerBkcode, technician: log.technician, closedAt: log.closedAt, receiptNumber: log.receiptNumber, branchName: log.branch?.name };
                if (isPaid) { totalPaidPartsValue += unitCost * qty; paidPartItems.push(partItem); }
                else { totalFreePartsValue += unitCost * qty; freePartItems.push(partItem); }
                if (!partFrequencyMap[partName]) partFrequencyMap[partName] = { name: partName, totalQuantity: 0, totalCost: 0, paidCount: 0, freeCount: 0 };
                partFrequencyMap[partName].totalQuantity += qty; partFrequencyMap[partName].totalCost += unitCost * qty;
                if (isPaid) partFrequencyMap[partName].paidCount += qty; else partFrequencyMap[partName].freeCount += qty;
            });
        });
        const topParts = Object.values(partFrequencyMap).sort((a, b) => b.totalQuantity - a.totalQuantity).slice(0, 15);

        res.json({
            success: true, month, branch: branchInfo, hasChildBranches: childBranchesList.length > 0,
            sales: {
                cash: { count: cashSales.length, totalPrice: cashTotal, paidAmount: cashPaid, remaining: cashTotal - cashPaid, details: cashSales.map(s => ({ id: s.id, serialNumber: s.serialNumber, customerName: getDisplayName(s.customer), customerCode: s.customer?.bkcode, saleDate: s.saleDate, totalPrice: s.totalPrice, paidAmount: s.paidAmount, status: s.status, branchName: s.branch?.name })) },
                installment: { count: installmentSales.length, totalPrice: installmentTotal, paidAmount: installmentPaid, remaining: installmentTotal - installmentPaid, details: installmentSales.map(s => ({ id: s.id, serialNumber: s.serialNumber, customerName: getDisplayName(s.customer), customerCode: s.customer?.bkcode, saleDate: s.saleDate, totalPrice: s.totalPrice, paidAmount: s.paidAmount, status: s.status, branchName: s.branch?.name })) },
                totalRevenue: cashTotal + installmentTotal, totalCollected: cashPaid + installmentPaid
            },
            installments: {
                collected: { count: collectedInstallments.length, totalAmount: collectedTotal, details: collectedInstallments.map(i => ({ id: i.id, amount: i.paidAmount || i.amount, paidAt: i.paidAt, receiptNumber: i.receiptNumber, customerName: getDisplayName(i.sale?.customer), customerCode: i.sale?.customer?.bkcode, branchName: i.sale?.branch?.name })) },
                overdue: { count: overdueInstallments.length, totalAmount: overdueTotal, details: overdueInstallments.map(i => ({ id: i.id, amount: i.amount, dueDate: i.dueDate, customerName: getDisplayName(i.sale?.customer), customerCode: i.sale?.customer?.bkcode, branchName: i.sale?.branch?.name, daysOverdue: Math.floor((today.getTime() - new Date(i.dueDate).getTime()) / (1000 * 60 * 60 * 24)) })) },
                upcoming: { count: upcomingInstallments.length, totalAmount: upcomingTotal, details: upcomingInstallments.map(i => ({ id: i.id, amount: i.amount, dueDate: i.dueDate, customerName: getDisplayName(i.sale?.customer), customerCode: i.sale?.customer?.bkcode, branchName: i.sale?.branch?.name })) }
            },
            spareParts: { paid: { count: paidPartItems.length, totalValue: totalPaidPartsValue, details: paidPartItems }, free: { count: freePartItems.length, totalValue: totalFreePartsValue, details: freePartItems }, topParts },
            inventory: { machines: machineCount, sims: simCount, outgoingTransfers, incomingTransfers },
            summary: { totalMonthlyRevenue: cashPaid + installmentPaid + collectedTotal, totalSalesValue: cashTotal + installmentTotal, totalOverdueAmount: overdueTotal, totalPaidParts: totalPaidPartsValue, totalFreeParts: totalFreePartsValue, totalPartsValue: totalPaidPartsValue + totalFreePartsValue },
            childBranches: childBranchData
        });
    } catch (error) {
        logger.error('Monthly closing failed:', error);
        res.status(500).json({ error: 'Failed to fetch monthly closing' });
    }
});

// GET /monthly-closing/versions - Get all versions of monthly closing reports for a month (to review old ones)
router.get('/monthly-closing/versions', async (req, res) => {
    try {
        const { month } = req.query;
        if (!month) return res.status(400).json({ error: 'Month is required (YYYY-MM)' });

        // Get all reports for this month, sorted by receivedAt descending
        const reports = await prisma.monthlyClosingReport.findMany({
            where: { month },
            select: { 
                id: true, branchId: true, branchCode: true, branchName: true, 
                month: true, status: true, sentAt: true, receivedAt: true, sections: true 
            },
            orderBy: { receivedAt: 'desc' }
        });

        // Group by branchId to show multiple versions per branch
        const versionsByBranch = reports.reduce((acc, r) => {
            if (!acc[r.branchId]) acc[r.branchId] = [];
            acc[r.branchId].push(r);
            return acc;
        }, {});

        res.json({ success: true, month, versionsByBranch, allVersions: reports });
    } catch (error) {
        logger.error('Failed to fetch monthly closing versions:', error);
        res.status(500).json({ error: 'Failed to fetch versions' });
    }
});

// GET /monthly-closing/version/:id - Get a specific version by ID
router.get('/monthly-closing/version/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const report = await prisma.monthlyClosingReport.findUnique({
            where: { id },
            include: { branch: { select: { id: true, name: true, code: true } } }
        });
        
        if (!report) return res.status(404).json({ error: 'Report not found' });
        
        res.json({ success: true, report });
    } catch (error) {
        logger.error('Failed to fetch monthly closing version:', error);
        res.status(500).json({ error: 'Failed to fetch version' });
    }
});

// DELETE /monthly-closing/flush - Flush synced transactional data for a month (for testing)
// NOTE: Must be defined BEFORE /:id route to avoid "flush" being matched as an id param
router.delete('/monthly-closing/flush', adminAuth, async (req, res) => {
    try {
        const { month, branchId } = req.query;
        if (!month || !/^\d{4}-\d{2}$/.test(month)) {
            return res.status(400).json({ error: 'الشهر مطلوب بصيغة YYYY-MM' });
        }

        const [year, mon] = month.split('-').map(Number);
        const startDate = new Date(year, mon - 1, 1);
        const endDate = new Date(year, mon, 0, 23, 59, 59, 999);

        const branchFilter = branchId ? { branchId: String(branchId) } : {};
        const dateFilter = { gte: startDate, lte: endDate };
        const dateFilterPaid = { gte: startDate, lte: endDate };

        logger.info(`[Reports] Flushing monthly closing data for ${month}`, { branchId });

        const result = await prisma.$transaction(async (tx) => {
            let stats = { sales: 0, installments: 0, payments: 0, stockMovements: 0, usedPartLogs: 0, reports: 0, logs: 0, summaries: 0 };

            const saleFilter = { ...branchFilter, saleDate: dateFilter };

            const sales = await tx.machineSale.findMany({ where: saleFilter, select: { id: true } });
            const saleIds = sales.map(s => s.id);

            if (saleIds.length > 0) {
                await tx.installment.deleteMany({ where: { saleId: { in: saleIds } } });
                stats.installments = await tx.installment.count({ where: { saleId: { in: saleIds } } });
                stats.sales = (await tx.machineSale.deleteMany({ where: { id: { in: saleIds } } })).count;
            } else {
                stats.sales = 0;
            }

            const paymentFilter = { ...branchFilter, createdAt: dateFilter };
            stats.payments = (await tx.payment.deleteMany({ where: paymentFilter })).count;

            const stockFilter = { ...branchFilter, createdAt: dateFilter };
            stats.stockMovements = (await tx.stockMovement.deleteMany({ where: stockFilter })).count;

            const usedPartFilter = { ...branchFilter, closedAt: dateFilter };
            stats.usedPartLogs = (await tx.usedPartLog.deleteMany({ where: usedPartFilter })).count;

            const reportFilter = { month: String(month) };
            const logFilter = { month: String(month) };
            if (branchId) {
                reportFilter.branchId = String(branchId);
                logFilter.branchId = String(branchId);
            }
            stats.reports = (await tx.monthlyClosingReport.deleteMany({ where: reportFilter })).count;
            stats.logs = (await tx.monthlyClosingLog.deleteMany({ where: logFilter })).count;

            if (branchId) {
                stats.summaries = (await tx.branchSummary.deleteMany({ where: { branchId: String(branchId) } })).count;
            } else {
                stats.summaries = (await tx.branchSummary.deleteMany({})).count;
            }

            return stats;
        });

        logger.info(`[Reports] Flushed monthly closing data for ${month}:`, result);

        res.json({
            success: true,
            message: `Flushed ${month}: ${result.sales} sales, ${result.payments} payments, ${result.stockMovements} stock movements, ${result.usedPartLogs} used part logs, ${result.reports} reports, ${result.logs} logs, ${result.summaries} summaries`,
            ...result
        });
    } catch (error) {
        console.error('[FLUSH ERROR]', error);
        logger.error('Failed to flush monthly closing data:', error.message, error.stack);
        res.status(500).json({ error: 'Failed to flush monthly closing data: ' + error.message });
    }
});

// DELETE /monthly-closing/:id - Delete a specific monthly closing report version
router.delete('/monthly-closing/:id', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        
        const deleted = await prisma.monthlyClosingReport.delete({
            where: { id }
        });

        // Also delete related logs
        await prisma.monthlyClosingLog.deleteMany({
            where: { branchId: deleted.branchId, month: deleted.month }
        });

        logger.info(`[Reports] Deleted monthly closing report ${id}`);
        res.json({ success: true, message: 'Report deleted' });
    } catch (error) {
        logger.error('Failed to delete monthly closing report:', error);
        res.status(500).json({ error: 'Failed to delete report' });
    }
});

module.exports = router;

// GET /monthly-closing/branches-status - Check which branches have sent reports for a given month
router.get('/monthly-closing/branches-status', async (req, res) => {
    try {
        const { month } = req.query;
        if (!month) return res.status(400).json({ error: 'Month is required (YYYY-MM)' });

        const branches = await prisma.branch.findMany({
            where: { isActive: true },
            select: { id: true, code: true, name: true, status: true, lastSeen: true, reportSyncMode: true }
        });

        const reports = await prisma.monthlyClosingReport.findMany({
            where: { month },
            select: { branchId: true, status: true, receivedAt: true, sections: true }
        });

        const reportMap = {};
        reports.forEach(r => { reportMap[r.branchId] = r; });

        const result = branches.map(b => ({
            ...b,
            reportStatus: reportMap[b.id] ? 'RECEIVED' : 'PENDING',
            receivedAt: reportMap[b.id]?.receivedAt || null,
            sections: reportMap[b.id]?.sections || null
        }));

        res.json({ success: true, month, branches: result, receivedCount: reports.length, totalCount: branches.length });
    } catch (error) {
        logger.error('Failed to fetch branches status:', error);
        res.status(500).json({ error: 'Failed to fetch branches status' });
    }
});

// GET /monthly-closing/logs - Get monthly closing logs
router.get('/monthly-closing/logs', async (req, res) => {
    try {
        const { month, branchId, limit = 50 } = req.query;
        const where = {};
        if (month) where.month = month;
        if (branchId) where.branchId = branchId;

        const logs = await prisma.monthlyClosingLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: parseInt(limit)
        });

        res.json({ success: true, data: logs });
    } catch (error) {
        logger.error('Failed to fetch monthly closing logs:', error);
        res.status(500).json({ error: 'Failed to fetch monthly closing logs' });
    }
});


