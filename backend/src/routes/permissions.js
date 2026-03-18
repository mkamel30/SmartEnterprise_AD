const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { adminAuth } = require('../middleware/auth');

router.use(adminAuth);

// Default roles (mirrored from frontend permissions.ts)
const ROLES = {
    SUPER_ADMIN: 'SUPER_ADMIN',
    MANAGEMENT: 'MANAGEMENT',
    BRANCH_ADMIN: 'BRANCH_ADMIN',
    ACCOUNTANT: 'ACCOUNTANT',
    BRANCH_MANAGER: 'BRANCH_MANAGER',
    CS_SUPERVISOR: 'CS_SUPERVISOR',
    CS_AGENT: 'CS_AGENT',
    BRANCH_TECH: 'BRANCH_TECH',
};

// All system roles for default access
const ALL_SYSTEM = [
    ROLES.SUPER_ADMIN, ROLES.MANAGEMENT, ROLES.BRANCH_ADMIN, ROLES.ACCOUNTANT,
    ROLES.BRANCH_MANAGER, ROLES.CS_SUPERVISOR, ROLES.CS_AGENT, ROLES.BRANCH_TECH
];

const ALL_BRANCH = [ROLES.BRANCH_ADMIN, ROLES.BRANCH_MANAGER, ROLES.CS_SUPERVISOR, ROLES.CS_AGENT, ROLES.BRANCH_TECH];
const SUPERVISOR_UP = [ROLES.SUPER_ADMIN, ROLES.MANAGEMENT, ROLES.BRANCH_ADMIN, ROLES.BRANCH_MANAGER, ROLES.CS_SUPERVISOR];

const DEFAULT_PAGE_PERMISSIONS = {
    '/': ALL_SYSTEM,
    '/requests': ALL_BRANCH,
    '/customers': ALL_BRANCH,
    '/warehouse': ALL_BRANCH,
    '/warehouse-machines': ALL_BRANCH,
    '/warehouse-sims': ALL_BRANCH,
    '/transfer-orders': ALL_BRANCH,
    '/receive-orders': ALL_BRANCH,
    '/receipts': [...ALL_BRANCH, ROLES.ACCOUNTANT, ROLES.SUPER_ADMIN],
    '/payments': [...ALL_BRANCH, ROLES.ACCOUNTANT, ROLES.SUPER_ADMIN],
    '/reports': ALL_SYSTEM,
    '/technicians': [ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN],
    '/branches': [ROLES.SUPER_ADMIN],
    '/settings': [ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN, ROLES.BRANCH_MANAGER, ROLES.CS_SUPERVISOR],
    '/admin/backups': [ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN]
};

const DEFAULT_ACTION_PERMISSIONS = {
    CREATE_REQUEST: [ROLES.SUPER_ADMIN, ROLES.MANAGEMENT, ...ALL_BRANCH],
    CLOSE_REQUEST: [ROLES.SUPER_ADMIN, ROLES.MANAGEMENT, ...ALL_BRANCH],
    DELETE_REQUEST: [ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN, ROLES.BRANCH_MANAGER, ROLES.CS_SUPERVISOR],
    EXCHANGE_MACHINE: [ROLES.SUPER_ADMIN, ROLES.MANAGEMENT, ...ALL_BRANCH],
    RETURN_MACHINE: [ROLES.SUPER_ADMIN, ROLES.MANAGEMENT, ...ALL_BRANCH],
    SELL_MACHINE: [ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN, ROLES.BRANCH_MANAGER, ROLES.CS_SUPERVISOR],
    ADD_MACHINE: [ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN],
    DELETE_MACHINE: [ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN],
    EXCHANGE_SIM: [ROLES.SUPER_ADMIN, ROLES.MANAGEMENT, ...ALL_BRANCH],
    ADD_SIM: [ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN],
    DELETE_SIM: [ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN],
    CREATE_TRANSFER: [ROLES.SUPER_ADMIN, ...ALL_BRANCH],
    RECEIVE_TRANSFER: [ROLES.SUPER_ADMIN, ...ALL_BRANCH],
    REJECT_TRANSFER: [ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN, ROLES.BRANCH_MANAGER, ROLES.CS_SUPERVISOR],
    ADD_CUSTOMER: [ROLES.SUPER_ADMIN, ROLES.MANAGEMENT, ...ALL_BRANCH],
    EDIT_CUSTOMER: [ROLES.SUPER_ADMIN, ROLES.MANAGEMENT, ...ALL_BRANCH],
    DELETE_CUSTOMER: [ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN, ROLES.BRANCH_MANAGER, ROLES.CS_SUPERVISOR],
    VIEW_PAYMENTS: SUPERVISOR_UP,
    ADD_PAYMENT: [ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN, ROLES.BRANCH_MANAGER, ROLES.CS_SUPERVISOR],
    MANAGE_USERS: [ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN],
    MANAGE_BRANCHES: [ROLES.SUPER_ADMIN],
    VIEW_ALL_BRANCHES: [ROLES.SUPER_ADMIN, ROLES.MANAGEMENT],
    VIEW_EXECUTIVE_SUMMARY: [ROLES.SUPER_ADMIN, ROLES.MANAGEMENT],
    VIEW_BRANCH_RANKINGS: [ROLES.SUPER_ADMIN, ROLES.MANAGEMENT],
    VIEW_INVENTORY_VALUATION: [ROLES.SUPER_ADMIN, ROLES.MANAGEMENT]
};

router.get('/', async (req, res) => {
    try {
        const dbPermissions = await prisma.rolePermission.findMany();
        
        const matrix = {
            pages: {},
            actions: {},
            roles: Object.values(ROLES)
        };

        // Initialize with hardcoded defaults
        Object.entries(DEFAULT_PAGE_PERMISSIONS).forEach(([page, allowedRoles]) => {
            matrix.pages[page] = {};
            matrix.roles.forEach(role => {
                matrix.pages[page][role] = allowedRoles.includes(role);
            });
        });

        Object.entries(DEFAULT_ACTION_PERMISSIONS).forEach(([action, allowedRoles]) => {
            matrix.actions[action] = {};
            matrix.roles.forEach(role => {
                matrix.actions[action][role] = allowedRoles.includes(role);
            });
        });

        // Apply DB overrides
        dbPermissions.forEach((p) => {
            if (p.permissionType === 'PAGE') {
                if (matrix.pages[p.permissionKey]) matrix.pages[p.permissionKey][p.role] = p.isAllowed;
            } else {
                if (matrix.actions[p.permissionKey]) matrix.actions[p.permissionKey][p.role] = p.isAllowed;
            }
        });

        res.json(matrix);
    } catch (error) {
        console.error('Fetch permissions failed:', error);
        res.status(500).json({ error: 'Failed' });
    }
});

router.post('/bulk', async (req, res) => {
    try {
        const { permissions } = req.body;
        if (!Array.isArray(permissions)) return res.status(400).json({ error: 'Invalid payload' });

        await prisma.$transaction(
            permissions.map(p => prisma.rolePermission.upsert({
                where: {
                    role_permissionType_permissionKey: {
                        role: p.role,
                        permissionType: p.permissionType,
                        permissionKey: p.permissionKey
                    }
                },
                update: { isAllowed: p.isAllowed },
                create: {
                    role: p.role,
                    permissionType: p.permissionType,
                    permissionKey: p.permissionKey,
                    isAllowed: p.isAllowed
                }
            }))
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Bulk update failed:', error);
        res.status(500).json({ error: 'Failed' });
    }
});

router.post('/reset', async (req, res) => {
    try {
        await prisma.rolePermission.deleteMany();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Reset failed' });
    }
});

router.get('/check', async (req, res) => {
    try {
        const { type, key } = req.query;
        const role = req.admin.role;

        if (role === ROLES.SUPER_ADMIN) return res.json({ allowed: true });

        const override = await prisma.rolePermission.findUnique({
            where: {
                role_permissionType_permissionKey: {
                    role,
                    permissionType: String(type),
                    permissionKey: String(key)
                }
            }
        });

        if (override) return res.json({ allowed: override.isAllowed });

        // Fallback to defaults
        const defaults = type === 'PAGE' ? DEFAULT_PAGE_PERMISSIONS : DEFAULT_ACTION_PERMISSIONS;
        const isAllowed = defaults[key]?.includes(role) || false;

        res.json({ allowed: isAllowed });
    } catch (error) {
        res.status(500).json({ error: 'Check failed' });
    }
});

module.exports = router;
