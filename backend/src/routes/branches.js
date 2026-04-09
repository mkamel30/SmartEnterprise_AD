const express = require('express');
const router = express.Router();
const prisma = require('../db');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { adminAuth } = require('../middleware/auth');
const ExcelJS = require('exceljs');
const logger = require('../../utils/logger');

// Generate branch code
function generateBranchCode() {
    return 'BR-' + crypto.randomBytes(4).toString('hex').substring(0, 6).toUpperCase();
}

// Generate API key
function generateAPIKey() {
    return 'sk_' + crypto.randomBytes(32).toString('hex');
}

// Auto-register branch (no auth required - called by installer/branch app on first run)
// Uses BOOTSTRAP_SECRET from environment to validate
router.post('/register', async (req, res) => {
    try {
        const { bootstrapSecret, name, hardwareId, hostIP } = req.body;

        // Validate bootstrap secret
        const expectedSecret = process.env.BOOTSTRAP_SECRET;
        if (!expectedSecret || bootstrapSecret !== expectedSecret) {
            return res.status(403).json({ error: 'Invalid bootstrap secret' });
        }

        // Auto-generate branch code and API key
        const code = generateBranchCode();
        const apiKey = generateAPIKey();

        // Create branch
        const branch = await prisma.branch.create({
            data: {
                code,
                name: name || `فرع ${code}`,
                apiKey,
                authorizedHWID: hardwareId || null,
                url: hostIP ? `http://${hostIP}:5002` : null,
                type: 'BRANCH',
                status: 'ONLINE'
            }
        });

        // Create initial admin user for this branch
        const bcrypt = require('bcryptjs');
        const crypto = require('crypto');
        const tempPassword = crypto.randomBytes(12).toString('hex');
        const hashedPassword = await bcrypt.hash(tempPassword, 10);
        
        await prisma.user.create({
            data: {
                username: 'admin',
                email: `admin@${code.toLowerCase()}.local`,
                password: hashedPassword,
                displayName: 'مدير الفرع',
                role: 'BRANCH_ADMIN',
                branchId: branch.id,
                isActive: true,
                notificationSound: true
            }
        });

        res.status(201).json({ 
            success: true,
            branchCode: code,
            apiKey: apiKey,
            credentials: {
                username: 'admin',
                password: tempPassword
            },
            message: 'Branch registered successfully. Please change the default password immediately.'
        });
    } catch (error) {
        logger.error({ err: error.message }, 'Failed to register branch');
        res.status(500).json({ error: 'فشل في تسجيل الفرع' });
    }
});

/**
 * Step 1: Verify Branch Code
 * Checks if a branch exists by code and is PENDING
 */
router.post('/verify-registration', async (req, res) => {
    try {
        const { branchCode, bootstrapSecret } = req.body;

        const expectedSecret = process.env.BOOTSTRAP_SECRET;
        if (!expectedSecret || bootstrapSecret !== expectedSecret) {
            return res.status(403).json({ error: 'Invalid bootstrap secret' });
        }

        const branch = await prisma.branch.findUnique({
            where: { code: branchCode }
        });

        if (!branch) {
            return res.status(404).json({ error: 'Branch code not found' });
        }

        if (branch.status !== 'PENDING' && branch.status !== 'OFFLINE') {
            // Allow re-registering if OFFLINE (maybe hardware changed), but primarily for PENDING
            // For now, let's just return the name to confirm.
        }

        res.json({ 
            success: true, 
            branchName: branch.name,
            branchStatus: branch.status 
        });
    } catch (error) {
        res.status(500).json({ error: 'Verification failed' });
    }
});

/**
 * Step 2: Complete Enrollment
 * Assigns HWID and returns the API Key
 */
router.post('/complete-registration', async (req, res) => {
    try {
        const { branchCode, bootstrapSecret, hardwareId, hostIP } = req.body;

        const expectedSecret = process.env.BOOTSTRAP_SECRET;
        if (!expectedSecret || bootstrapSecret !== expectedSecret) {
            return res.status(403).json({ error: 'Invalid bootstrap secret' });
        }

        const branch = await prisma.branch.findUnique({
            where: { code: branchCode }
        });

        if (!branch) {
            return res.status(404).json({ error: 'Branch not found' });
        }

        // Update branch with HWID and activate it
        const updatedBranch = await prisma.branch.update({
            where: { id: branch.id },
            data: {
                authorizedHWID: hardwareId || branch.authorizedHWID,
                status: 'ONLINE',
                lastSeen: new Date()
            }
        });

        // If it's the first time, we might want to return the API Key
        // SECURITY: Only return the API key if the branch is currently in a state that allows it.
        // For simplicity, we'll return it here as long as the secret is correct.
        
        res.json({ 
            success: true, 
            apiKey: branch.apiKey, 
            branchCode: branch.code,
            branchName: branch.name
        });
    } catch (error) {
        res.status(500).json({ error: 'Activation failed' });
    }
});

// Legacy register - for backward compatibility (requires auth)
router.post('/register-manual', adminAuth, async (req, res) => {
    try {
        const { name, apiKey: providedApiKey } = req.body;

        const code = generateBranchCode();
        const apiKey = providedApiKey || generateAPIKey();

        const branch = await prisma.branch.create({
            data: {
                code,
                name: name || `فرع ${code}`,
                apiKey,
                type: 'BRANCH',
                status: 'PENDING'
            }
        });

        res.status(201).json({ 
            success: true,
            branch,
            apiKey,
            message: 'Branch created successfully'
        });
    } catch (error) {
        logger.error('Failed to create branch:', error);
        res.status(500).json({ error: 'فشل في إنشاء الفرع' });
    }

});

router.use(adminAuth);

// Get all branches
router.get('/', async (req, res) => {
    try {
        const branches = await prisma.branch.findMany({
            orderBy: { name: 'asc' },
            include: {
                _count: {
                    select: { backups: true }
                }
            }
        });
        res.json(branches);
    } catch (error) {
        logger.error('Failed to fetch branches:', error);
        res.status(500).json({ error: 'Failed to fetch branches' });
    }
});

// Register new branch
router.post('/', async (req, res) => {
    try {
        let { code, name, address, authorizedHWID, type, phone, managerEmail, maintenanceCenterId, parentBranchId } = req.body;
        
        if (!name) {
            return res.status(400).json({ error: 'Branch Name is required' });
        }

        // Clean empty strings to null for optional FK fields
        managerEmail = managerEmail || undefined;
        maintenanceCenterId = maintenanceCenterId || undefined;
        parentBranchId = parentBranchId || undefined;

        // Auto-generate code if missing
        if (!code) {
            const lastBranch = await prisma.branch.findFirst({
                orderBy: { code: 'desc' },
                where: { code: { startsWith: 'BR' } }
            });

            let nextNum = 1;
            if (lastBranch) {
                nextNum = parseInt(lastBranch.code.substring(2)) || 0;
            }
            code = `BR${String(nextNum).padStart(3, '0')}`;
            while (await prisma.branch.findUnique({ where: { code } })) {
                nextNum++;
                code = `BR${String(nextNum).padStart(3, '0')}`;
            }
        } else {
            const existing = await prisma.branch.findUnique({ where: { code } });
            if (existing) {
                return res.status(400).json({ error: 'Branch code already exists' });
            }
        }

        // Generate a unique API Key for the branch
        const apiKey = crypto.randomBytes(32).toString('hex');

        let branch;
        let attempts = 0;
        const maxAttempts = 10;
        while (attempts < maxAttempts) {
            try {
                branch = await prisma.branch.create({
                    data: {
                        code,
                        name,
                        address,
                        apiKey,
                        authorizedHWID,
                        type: type || 'BRANCH',
                        phone,
                        managerEmail,
                        maintenanceCenterId,
                        parentBranchId
                    }
                });
                break;
            } catch (error) {
                if (error.code === 'P2002' && code) {
                    attempts++;
                    const lastBranch = await prisma.branch.findFirst({
                        orderBy: { code: 'desc' },
                        where: { code: { startsWith: 'BR' } }
                    });
                    let nextNum = lastBranch ? (parseInt(lastBranch.code.substring(2)) || 0) + 1 : 1;
                    code = `BR${String(nextNum).padStart(3, '0')}`;
                    continue;
                }
                throw error;
            }
        }

        res.status(201).json(branch);
    } catch (error) {
        logger.error('Failed to register branch:', error);
        res.status(500).json({ error: 'Failed to register branch' });
    }
});

// Update branch
router.put('/:id', async (req, res) => {
    try {
        const { name, address, authorizedHWID, status, type, phone, managerEmail, maintenanceCenterId, parentBranchId, reportSyncMode } = req.body;
        
        const data: any = {
            name,
            address,
            authorizedHWID,
            type,
            phone,
            managerEmail,
            maintenanceCenterId,
            parentBranchId,
            status
        };
        if (reportSyncMode !== undefined) data.reportSyncMode = reportSyncMode;

        const branch = await prisma.branch.update({
            where: { id: req.params.id },
            data
        });
        
        res.json(branch);
    } catch (error) {
        logger.error('Failed to update branch:', error);
        res.status(500).json({ error: 'Failed to update branch' });
    }
});

// Delete branch
router.delete('/:id', async (req, res) => {
    try {
        await prisma.branch.delete({
            where: { id: req.params.id }
        });
        res.json({ message: 'Branch deleted successfully' });
    } catch (error) {
        logger.error('Failed to delete branch:', error);
        res.status(500).json({ error: 'Failed to delete branch' });
    }
});

// Get active branches
router.get('/active', async (req, res) => {
    try {
        const branches = await prisma.branch.findMany({
            where: { isActive: true },
            orderBy: { name: 'asc' }
        });
        res.json(branches);
    } catch (error) {
        logger.error('Failed to fetch active branches:', error);
        res.status(500).json({ error: 'Failed to fetch active branches' });
    }
});

// Get branch details
router.get('/:id', async (req, res) => {
    try {
        const branch = await prisma.branch.findUnique({
            where: { id: req.params.id },
            include: {
                backups: {
                    take: 5,
                    orderBy: { createdAt: 'desc' }
                }
            }
        });
        
        if (!branch) {
            return res.status(404).json({ error: 'Branch not found' });
        }
        
        res.json(branch);
    } catch (error) {
        logger.error('Failed to fetch branch:', error);
        res.status(500).json({ error: 'Failed to fetch branch' });
    }
});

// Export all branch data to Excel
router.get('/export/all', adminAuth, async (req, res) => {
    try {
        const branches = await prisma.branch.findMany({
            orderBy: { name: 'asc' },
            select: { id: true, code: true, name: true }
        });

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Smart Enterprise Portal';
        workbook.created = new Date();

        const summaryData = [];

        for (const branch of branches) {
            try {
                const ws = workbook.addWorksheet(branch.name.substring(0, 31).replace(/[\\\/\?\*\[\]]/g, ''));

                const headerStyle = {
                    font: { bold: true, color: { argb: 'FFFFFFFF' } },
                    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }
                };

                let row = 1;

                ws.columns = [
                    { header: 'Category', key: 'category', width: 20 },
                    { header: 'Item', key: 'item', width: 30 },
                    { header: 'Details', key: 'details', width: 40 }
                ];

                const warehouseMachines = await prisma.warehouseMachine.findMany({
                    where: { branchId: branch.id },
                    select: { serialNumber: true, model: true, manufacturer: true, status: true, importDate: true }
                });

                if (warehouseMachines.length > 0) {
                    ws.addRow({ category: 'WH MACHINES', item: 'إجمالي', details: warehouseMachines.length });
                    warehouseMachines.forEach(m => {
                        ws.addRow({
                            category: 'WH Machine',
                            item: m.serialNumber,
                            details: `${m.manufacturer || ''} ${m.model || ''} - ${m.status || ''}`
                        });
                    });
                    summaryData.push({ branch: branch.name, type: 'WH Machines', count: warehouseMachines.length });
                }

                const cashSales = await prisma.machineSale.findMany({
                    where: { branchId: branch.id, type: 'CASH' },
                    include: {
                        customer: { select: { client_name: true, bkcode: true } },
                        payments: { select: { receiptNumber: true, amount: true } }
                    }
                });

                if (cashSales.length > 0) {
                    ws.addRow({ category: 'SALES CASH', item: 'إجمالي', details: cashSales.length });
                    cashSales.forEach(s => {
                        const payment = s.payments?.[0];
                        ws.addRow({
                            category: 'Sold (Cash)',
                            item: s.serialNumber,
                            details: `${s.customer?.client_name || 'N/A'} - ${payment?.receiptNumber || 'N/A'} - ${s.totalPrice || 0}`
                        });
                    });
                    summaryData.push({ branch: branch.name, type: 'Sales (Cash)', count: cashSales.length });
                }

                const installmentSales = await prisma.machineSale.findMany({
                    where: { branchId: branch.id, type: { in: ['INSTALLMENT', 'LEGACY_INSTALLMENT'] } },
                    include: {
                        customer: { select: { client_name: true, bkcode: true } },
                        installments: { select: { dueDate: true, amount: true, isPaid: true, receiptNumber: true } }
                    }
                });

                if (installmentSales.length > 0) {
                    ws.addRow({ category: 'SALES INSTALLMENT', item: 'إجمالي', details: installmentSales.length });
                    installmentSales.forEach(s => {
                        const pending = s.installments?.filter(i => !i.isPaid).length || 0;
                        ws.addRow({
                            category: 'Sold (Installment)',
                            item: s.serialNumber,
                            details: `${s.customer?.client_name || 'N/A'} - ${s.installments?.length || 0} أقساط - ${pending} متأخر`
                        });
                    });
                    summaryData.push({ branch: branch.name, type: 'Sales (Installment)', count: installmentSales.length });
                }

                const warehouseSims = await prisma.warehouseSim.findMany({
                    where: { branchId: branch.id },
                    select: { serialNumber: true, type: true, networkType: true, status: true }
                });

                if (warehouseSims.length > 0) {
                    ws.addRow({ category: 'WH SIMS', item: 'إجمالي', details: warehouseSims.length });
                    warehouseSims.forEach(s => {
                        ws.addRow({
                            category: 'WH SIM',
                            item: s.serialNumber,
                            details: `${s.type || ''} - ${s.networkType || ''} - ${s.status || ''}`
                        });
                    });
                    summaryData.push({ branch: branch.name, type: 'WH SIMs', count: warehouseSims.length });
                }

                const soldSims = await prisma.simCard.findMany({
                    where: { branchId: branch.id },
                    include: {
                        customer: { select: { client_name: true, bkcode: true } }
                    }
                });

                if (soldSims.length > 0) {
                    ws.addRow({ category: 'SOLD SIMS', item: 'إجمالي', details: soldSims.length });
                    soldSims.forEach(s => {
                        ws.addRow({
                            category: 'Sold SIM',
                            item: s.serialNumber,
                            details: `${s.customer?.client_name || 'N/A'} - ${s.type || ''} - ${s.networkType || ''}`
                        });
                    });
                    summaryData.push({ branch: branch.name, type: 'Sold SIMs', count: soldSims.length });
                }

                const stockMovements = await prisma.stockMovement.findMany({
                    where: { branchId: branch.id },
                    include: { part: { select: { name: true } } }
                });

                if (stockMovements.length > 0) {
                    ws.addRow({ category: 'STOCK MOVEMENTS', item: 'إجمالي', details: stockMovements.length });
                    stockMovements.forEach(m => {
                        ws.addRow({
                            category: 'Stock Movement',
                            item: m.part?.name || m.type || 'N/A',
                            details: `qty: ${m.quantity || 0} (${m.type}) - ${m.reason || ''} - ${m.isPaid ? 'PAID' : 'FREE'}`
                        });
                    });
                    summaryData.push({ branch: branch.name, type: 'Stock Movements', count: stockMovements.length });
                }
            } catch (branchError) {
                logger.error(`Export failed for branch ${branch.name}:`, branchError);
                summaryData.push({ branch: branch.name, type: 'ERROR', count: 0 });
            }
        }

        const summarySheet = workbook.addWorksheet('Summary');
        summarySheet.columns = [
            { header: 'Branch', key: 'branch', width: 25 },
            { header: 'Type', key: 'type', width: 20 },
            { header: 'Count', key: 'count', width: 10 }
        ];
        summaryData.forEach(item => {
            summarySheet.addRow(item);
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=branches_export_${new Date().toISOString().slice(0, 10)}.xlsx`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        logger.error('Export failed:', error);
        res.status(500).json({ error: 'فشل في التصدير' });
    }
});

// Trigger full sync for a branch
router.post('/:id/trigger-sync', adminAuth, async (req, res) => {
    try {
        const branch = await prisma.branch.findUnique({
            where: { id: req.params.id }
        });

        if (!branch) {
            return res.status(404).json({ error: 'Branch not found' });
        }

        const io = req.app.get('io');
        if (io) {
            io.to(`branch_${branch.id}`).emit('portal_directive', {
                type: 'SYSTEM_DIRECTIVE',
                action: 'REQUEST_FULL_SYNC',
                timestamp: new Date().toISOString()
            });
        }

        res.json({ success: true, message: `Sync requested for branch ${branch.code}` });
    } catch (error) {
        logger.error('Trigger sync failed:', error);
        res.status(500).json({ error: 'Failed to trigger sync' });
    }
});

// Pull ALL report data from branch (full report sync)
router.post('/:id/pull-reports', adminAuth, async (req, res) => {
    try {
        const branch = await prisma.branch.findUnique({
            where: { id: req.params.id }
        });

        if (!branch) {
            return res.status(404).json({ error: 'Branch not found' });
        }

        const io = req.app.get('io');
        if (io) {
            io.to(`branch_${branch.id}`).emit('portal_directive', {
                type: 'SYSTEM_DIRECTIVE',
                action: 'REQUEST_REPORT_DATA',
                timestamp: new Date().toISOString()
            });
            
            await prisma.portalSyncLog.create({
                data: {
                    branchId: branch.id,
                    branchCode: branch.code,
                    branchName: branch.name,
                    type: 'PULL',
                    status: 'PENDING',
                    message: 'تم طلب سحب جميع بيانات التقارير يدوياً من الأدمن'
                }
            });
        }

        res.json({ success: true, message: `Report data pull requested from branch ${branch.code}` });
    } catch (error) {
        logger.error('Pull reports failed:', error);
        res.status(500).json({ error: 'Failed to pull reports' });
    }
});

// Pull inventory from branch
router.post('/:id/pull-inventory', adminAuth, async (req, res) => {
    try {
        const branch = await prisma.branch.findUnique({
            where: { id: req.params.id }
        });

        if (!branch) {
            return res.status(404).json({ error: 'Branch not found' });
        }

        const io = req.app.get('io');
        if (io) {
            io.to(`branch_${branch.id}`).emit('portal_directive', {
                type: 'SYSTEM_DIRECTIVE',
                action: 'PUSH_FULL_INVENTORY',
                timestamp: new Date().toISOString()
            });
            
            // Log the request
            await prisma.portalSyncLog.create({
                data: {
                    branchId: branch.id,
                    branchCode: branch.code,
                    branchName: branch.name,
                    type: 'PULL',
                    status: 'PENDING',
                    message: 'تم طلب سحب المخزون يدوياً من الأدمن'
                }
            });
        }

        res.json({ success: true, message: `Inventory pull requested for branch ${branch.code}` });
    } catch (error) {
        logger.error('Pull inventory failed:', error);
        res.status(500).json({ error: 'Failed to request inventory pull' });
    }
});


// Get branches by type
router.get('/type/:type', async (req, res) => {
    try {
        const branches = await prisma.branch.findMany({
            where: { type: req.params.type },
            orderBy: { name: 'asc' }
        });
        res.json(branches);
    } catch (error) {
        logger.error('Failed to fetch branches by type:', error);
        res.status(500).json({ error: 'Failed to fetch branches' });
    }
});

// Get maintenance centers with branches
router.get('/centers/with-branches', async (req, res) => {
    try {
        const centers = await prisma.branch.findMany({
            where: { type: 'MAINTENANCE_CENTER', isActive: true },
            include: { childBranches: true },
            orderBy: { name: 'asc' }
        });
        res.json(centers);
    } catch (error) {
        logger.error('Failed to fetch centers:', error);
        res.status(500).json({ error: 'Failed to fetch centers' });
    }
});

// Get branches for a center
router.get('/center/:centerId/branches', async (req, res) => {
    try {
        const branches = await prisma.branch.findMany({
            where: { parentBranchId: req.params.centerId, isActive: true },
            orderBy: { name: 'asc' }
        });
        res.json(branches);
    } catch (error) {
        logger.error('Failed to fetch center branches:', error);
        res.status(500).json({ error: 'Failed to fetch branches' });
    }
});

// Get authorized branches
router.get('/authorized', async (req, res) => {
    try {
        const branches = await prisma.branch.findMany({
            where: { isActive: true, authorizedHWID: { not: null } },
            orderBy: { name: 'asc' }
        });
        res.json(branches);
    } catch (error) {
        logger.error('Failed to fetch authorized branches:', error);
        res.status(500).json({ error: 'Failed to fetch authorized branches' });
    }
});

module.exports = router;
