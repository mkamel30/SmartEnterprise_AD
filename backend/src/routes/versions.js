const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../../db');
const { authenticateToken, requireSuperAdmin } = require('../../../middleware/auth');
const { success, error } = require('../../../utils/apiResponse');
const asyncHandler = require('../../../utils/asyncHandler');

const GITHUB_API_BASE = 'https://api.github.com';

async function getGitHubSettings() {
    let settings = await db.gitHubSettings.findFirst();
    if (!settings) {
        settings = await db.gitHubSettings.create({
            data: {
                patToken: process.env.GITHUB_PAT || '',
                repoOwner: 'mkamel30',
                repoName: 'SmartEnterprise_BR'
            }
        });
    }
    return settings;
}

async function githubRequest(endpoint, settings, options = {}) {
    const url = `${GITHUB_API_BASE}${endpoint}`;
    try {
        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${settings.patToken}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'User-Agent': 'SmartEnterprise-Admin'
            },
            timeout: options.timeout || 30000,
            ...options
        });
        return response.data;
    } catch (err) {
        throw err;
    }
}

router.get('/', authenticateToken, requireSuperAdmin, asyncHandler(async (req, res) => {
    const branches = await db.branchVersion.findMany({
        orderBy: { updatedAt: 'desc' }
    });

    const branchesData = await db.branch.findMany({
        where: { isActive: true },
        select: { code: true, name: true }
    });

    const branchMap = {};
    branchesData.forEach(b => { branchMap[b.code] = b.name; });

    const formatted = branches.map(b => ({
        branchCode: b.branchCode,
        branchName: branchMap[b.branchCode] || 'Unknown',
        appVersion: b.appVersion,
        lastChecked: b.lastChecked,
        lastUpdated: b.lastUpdated,
        updateStatus: b.updateStatus
    }));

    const missingBranches = branchesData.filter(b => !branches.find(v => v.branchCode === b.code));
    missingBranches.forEach(b => {
        formatted.push({
            branchCode: b.code,
            branchName: b.name,
            appVersion: 'Unknown',
            lastChecked: null,
            lastUpdated: null,
            updateStatus: 'not_registered'
        });
    });

    return success(res, { branches: formatted, total: formatted.length });
}));

router.get('/:branchCode', authenticateToken, requireSuperAdmin, asyncHandler(async (req, res) => {
    const { branchCode } = req.params;
    
    let version = await db.branchVersion.findUnique({ where: { branchCode } });
    
    if (!version) {
        version = await db.branchVersion.create({
            data: { branchCode, appVersion: '1.0.0', updateStatus: 'not_registered' }
        });
    }

    const branch = await db.branch.findUnique({ where: { code: branchCode } });

    return success(res, {
        branchCode: version.branchCode,
        branchName: branch?.name || 'Unknown',
        appVersion: version.appVersion,
        lastChecked: version.lastChecked,
        lastUpdated: version.lastUpdated,
        updateStatus: version.updateStatus,
        createdAt: version.createdAt,
        updatedAt: version.updatedAt
    });
}));

router.post('/:branchCode/check', authenticateToken, requireSuperAdmin, asyncHandler(async (req, res) => {
    const { branchCode } = req.params;
    const initiatedBy = req.user?.username || 'system';

    const settings = await getGitHubSettings();
    
    if (!settings.patToken) {
        await db.versionLog.create({
            data: {
                branchCode,
                action: 'check',
                status: 'failed',
                errorMessage: 'GitHub PAT not configured',
                initiatedBy
            }
        });
        return error(res, 'GitHub PAT token not configured.', 400);
    }

    try {
        const release = await githubRequest(`/repos/${settings.repoOwner}/${settings.repoName}/releases/latest`, settings);
        const latestVersion = release.tag_name?.replace(/^v/, '') || release.name;

        let version = await db.branchVersion.findUnique({ where: { branchCode } });
        
        if (!version) {
            version = await db.branchVersion.create({
                data: { branchCode, appVersion: latestVersion, updateStatus: 'up_to_date' }
            });
        }

        const isUpdateAvailable = version.appVersion !== latestVersion;
        const updateStatus = isUpdateAvailable ? 'update_available' : 'up_to_date';

        await db.branchVersion.update({
            where: { branchCode },
            data: { 
                appVersion: latestVersion,
                lastChecked: new Date(),
                updateStatus
            }
        });

        await db.versionLog.create({
            data: {
                branchCode,
                action: 'check',
                toVersion: latestVersion,
                fromVersion: version.appVersion,
                status: 'success',
                initiatedBy
            }
        });

        return success(res, {
            currentVersion: version.appVersion,
            latestVersion,
            updateAvailable: isUpdateAvailable,
            updateStatus
        });
    } catch (err) {
        await db.versionLog.create({
            data: {
                branchCode,
                action: 'check',
                status: 'failed',
                errorMessage: err.message,
                initiatedBy
            }
        });
        return error(res, 'Failed to check version: ' + err.message, 500);
    }
}));

router.post('/:branchCode/push', authenticateToken, requireSuperAdmin, asyncHandler(async (req, res) => {
    const { branchCode } = req.params;
    const { version } = req.body;
    const initiatedBy = req.user?.username || 'system';

    const branch = await db.branch.findUnique({ where: { code: branchCode } });
    if (!branch) {
        return error(res, 'Branch not found.', 404);
    }

    if (!branch.apiKey) {
        await db.versionLog.create({
            data: {
                branchCode,
                action: 'force_push',
                status: 'failed',
                errorMessage: 'Branch has no API key configured',
                initiatedBy
            }
        });
        return error(res, 'Branch has no API key configured. Please configure the branch first.', 400);
    }

    await db.branchVersion.upsert({
        where: { branchCode },
        create: { branchCode, updateStatus: 'updating' },
        update: { updateStatus: 'updating', lastUpdated: new Date() }
    });

    await db.versionLog.create({
        data: {
            branchCode,
            action: 'force_push',
            toVersion: version || 'latest',
            status: 'in_progress',
            initiatedBy
        }
    });

    try {
        const response = await axios.post(
            `${process.env.BRANCH_API_URL || 'http://localhost:5002'}/api/system/update/trigger`,
            { version: version || 'latest' },
            {
                headers: {
                    'x-portal-sync-key': branch.apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        return success(res, {
            message: 'Update pushed successfully',
            branchCode,
            version: version || 'latest'
        });
    } catch (err) {
        await db.branchVersion.update({
            where: { branchCode },
            data: { updateStatus: 'failed' }
        });

        await db.versionLog.create({
            data: {
                branchCode,
                action: 'force_push',
                status: 'failed',
                errorMessage: err.message,
                initiatedBy
            }
        });

        return error(res, 'Failed to push update to branch: ' + err.message, 500);
    }
}));

router.post('/:branchCode/rollback', authenticateToken, requireSuperAdmin, asyncHandler(async (req, res) => {
    const { branchCode } = req.params;
    const initiatedBy = req.user?.username || 'system';

    const branch = await db.branch.findUnique({ where: { code: branchCode } });
    if (!branch || !branch.apiKey) {
        return error(res, 'Branch not found or has no API key.', 404);
    }

    await db.versionLog.create({
        data: {
            branchCode,
            action: 'rollback',
            status: 'in_progress',
            initiatedBy
        }
    });

    try {
        await axios.post(
            `${process.env.BRANCH_API_URL || 'http://localhost:5002'}/api/system/update/rollback`,
            {},
            {
                headers: {
                    'x-portal-sync-key': branch.apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 60000
            }
        );

        return success(res, { message: 'Rollback initiated', branchCode });
    } catch (err) {
        await db.versionLog.create({
            data: {
                branchCode,
                action: 'rollback',
                status: 'failed',
                errorMessage: err.message,
                initiatedBy
            }
        });
        return error(res, 'Failed to rollback: ' + err.message, 500);
    }
}));

router.get('/logs', authenticateToken, requireSuperAdmin, asyncHandler(async (req, res) => {
    const { branchCode, action, status, limit = 50, offset = 0 } = req.query;

    const where = {};
    if (branchCode) where.branchCode = branchCode;
    if (action) where.action = action;
    if (status) where.status = status;

    const logs = await db.versionLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset)
    });

    const total = await db.versionLog.count({ where });

    return success(res, { logs, total, limit: parseInt(limit), offset: parseInt(offset) });
}));

router.post('/:branchCode/status', asyncHandler(async (req, res) => {
    const { branchCode } = req.params;
    const { status, version, progress, errorMessage } = req.body;

    const branch = await db.branch.findUnique({ where: { code: branchCode } });
    if (!branch) {
        return error(res, 'Branch not found.', 404);
    }

    await db.branchVersion.upsert({
        where: { branchCode },
        create: { 
            branchCode, 
            appVersion: version || '1.0.0',
            updateStatus: status === 'completed' ? 'up_to_date' : status,
            lastUpdated: status === 'completed' ? new Date() : null
        },
        update: { 
            updateStatus: status === 'completed' ? 'up_to_date' : status,
            lastUpdated: status === 'completed' ? new Date() : undefined,
            lastChecked: new Date()
        }
    });

    await db.versionLog.create({
        data: {
            branchCode,
            action: status === 'downloading' ? 'download' : status === 'installing' ? 'apply' : status,
            toVersion: version,
            status: status === 'failed' ? 'failed' : status === 'completed' ? 'success' : status,
            errorMessage,
            downloadProgress: progress?.download || null,
            installProgress: progress?.install || null,
            initiatedBy: 'system'
        }
    });

    return success(res, { message: 'Status updated' });
}));

module.exports = router;
