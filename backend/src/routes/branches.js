const express = require('express');
const router = express.Router();
const prisma = require('../db');
const crypto = require('crypto');
const { adminAuth } = require('../middleware/auth');

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
        const hashedPassword = await bcrypt.hash('admin123', 10);
        
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
                password: 'admin123'
            },
            message: 'Branch registered successfully'
        });
    } catch (error) {
        console.error('Failed to register branch:', error);
        res.status(500).json({ error: 'Failed to register branch: ' + error.message });
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
        console.error('Failed to create branch:', error);
        res.status(500).json({ error: 'Failed to create branch: ' + error.message });
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
        console.error('Failed to fetch branches:', error);
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
        console.error('Failed to register branch:', error);
        res.status(500).json({ error: 'Failed to register branch' });
    }
});

// Update branch
router.put('/:id', async (req, res) => {
    try {
        const { name, address, authorizedHWID, status, type, phone, managerEmail, maintenanceCenterId, parentBranchId } = req.body;
        
        const branch = await prisma.branch.update({
            where: { id: req.params.id },
            data: {
                name,
                address,
                authorizedHWID,
                type,
                phone,
                managerEmail,
                maintenanceCenterId,
                parentBranchId,
                status
            }
        });
        
        res.json(branch);
    } catch (error) {
        console.error('Failed to update branch:', error);
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
        console.error('Failed to delete branch:', error);
        res.status(500).json({ error: 'Failed to delete branch' });
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
        console.error('Failed to fetch branch:', error);
        res.status(500).json({ error: 'Failed to fetch branch' });
    }
});

module.exports = router;
