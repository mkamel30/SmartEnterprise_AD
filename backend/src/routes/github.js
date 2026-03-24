const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../../db');
const { authenticateToken, requireSuperAdmin } = require('../../../middleware/auth');
const { success, error } = require('../../../utils/apiResponse');
const asyncHandler = require('../../../utils/asyncHandler');

const GITHUB_API_BASE = 'https://api.github.com';
const DEFAULT_REPO_OWNER = 'mkamel30';
const DEFAULT_REPO_NAME = 'SmartEnterprise_BR';

async function getGitHubSettings() {
    let settings = await db.gitHubSettings.findFirst();
    if (!settings) {
        settings = await db.gitHubSettings.create({
            data: {
                patToken: process.env.GITHUB_PAT || '',
                repoOwner: DEFAULT_REPO_OWNER,
                repoName: DEFAULT_REPO_NAME
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
        console.error('GitHub API Error:', err.response?.data || err.message);
        throw err;
    }
}

router.get('/releases', authenticateToken, requireSuperAdmin, asyncHandler(async (req, res) => {
    const settings = await getGitHubSettings();
    
    if (!settings.patToken) {
        return error(res, 'GitHub PAT token not configured. Please configure in settings.', 400);
    }

    try {
        const releases = await githubRequest(`/repos/${settings.repoOwner}/${settings.repoName}/releases`, settings);
        
        const formattedReleases = releases.map(r => ({
            id: r.id,
            version: r.tag_name || r.name,
            name: r.name,
            body: r.body,
            htmlUrl: r.html_url,
            publishedAt: r.published_at,
            draft: r.draft,
            prerelease: r.prerelease,
            assets: (r.assets || []).map(a => ({
                name: a.name,
                size: a.size,
                downloadCount: a.download_count,
                browserDownloadUrl: a.browser_download_url
            }))
        }));

        return success(res, { releases: formattedReleases, count: formattedReleases.length });
    } catch (err) {
        if (err.response?.status === 404) {
            return success(res, { releases: [], count: 0, message: 'No releases found or repository is private.' });
        }
        return error(res, 'Failed to fetch releases: ' + (err.message || 'Unknown error'), 500);
    }
}));

router.get('/releases/latest', authenticateToken, requireSuperAdmin, asyncHandler(async (req, res) => {
    const settings = await getGitHubSettings();
    
    if (!settings.patToken) {
        return error(res, 'GitHub PAT token not configured.', 400);
    }

    try {
        const release = await githubRequest(`/repos/${settings.repoOwner}/${settings.repoName}/releases/latest`, settings);
        
        const formattedRelease = {
            id: release.id,
            version: release.tag_name || release.name,
            name: release.name,
            body: release.body,
            htmlUrl: release.html_url,
            publishedAt: release.published_at,
            assets: (release.assets || []).map(a => ({
                name: a.name,
                size: a.size,
                downloadCount: a.download_count,
                browserDownloadUrl: a.browser_download_url
            }))
        };

        return success(res, { release: formattedRelease });
    } catch (err) {
        if (err.response?.status === 404) {
            return error(res, 'No release found. Create a release on GitHub first.', 404);
        }
        return error(res, 'Failed to fetch latest release: ' + (err.message || 'Unknown error'), 500);
    }
}));

router.get('/download/:version', authenticateToken, requireSuperAdmin, asyncHandler(async (req, res) => {
    const { version } = req.params;
    const settings = await getGitHubSettings();
    
    if (!settings.patToken) {
        return error(res, 'GitHub PAT token not configured.', 400);
    }

    try {
        const release = await githubRequest(`/repos/${settings.repoOwner}/${settings.repoName}/releases/tags/${version}`, settings);
        
        const asset = release.assets?.find(a => a.name.endsWith('.exe') || a.name.includes('windows'));
        
        if (!asset) {
            return error(res, 'No executable found in this release.', 404);
        }

        return success(res, {
            downloadUrl: asset.browser_download_url,
            version: release.tag_name || release.name,
            size: asset.size,
            name: asset.name
        });
    } catch (err) {
        return error(res, 'Failed to get download URL: ' + (err.message || 'Unknown error'), 500);
    }
}));

router.get('/settings', authenticateToken, requireSuperAdmin, asyncHandler(async (req, res) => {
    const settings = await getGitHubSettings();
    return success(res, {
        repoOwner: settings.repoOwner,
        repoName: settings.repoName,
        autoCheck: settings.autoCheck,
        checkInterval: settings.checkInterval,
        hasToken: !!settings.patToken
    });
}));

router.post('/settings', authenticateToken, requireSuperAdmin, asyncHandler(async (req, res) => {
    const { patToken, repoOwner, repoName, autoCheck, checkInterval } = req.body;
    
    const settings = await getGitHubSettings();
    
    const updated = await db.gitHubSettings.update({
        where: { id: settings.id },
        data: {
            patToken: patToken || settings.patToken,
            repoOwner: repoOwner || settings.repoOwner,
            repoName: repoName || settings.repoName,
            autoCheck: autoCheck !== undefined ? autoCheck : settings.autoCheck,
            checkInterval: checkInterval || settings.checkInterval
        }
    });

    return success(res, { message: 'Settings updated successfully', settings: { repoOwner: updated.repoOwner, repoName: updated.repoName, autoCheck: updated.autoCheck, hasToken: !!updated.patToken } });
}));

router.get('/test', authenticateToken, requireSuperAdmin, asyncHandler(async (req, res) => {
    const settings = await getGitHubSettings();
    
    if (!settings.patToken) {
        return error(res, 'GitHub PAT token not configured.', 400);
    }

    try {
        const repo = await githubRequest(`/repos/${settings.repoOwner}/${settings.repoName}`, settings, { timeout: 10000 });
        
        return success(res, {
            connected: true,
            repo: {
                name: repo.name,
                fullName: repo.full_name,
                description: repo.description,
                stars: repo.stargazers_count,
                forks: repo.forks_count,
                visibility: repo.visibility
            }
        });
    } catch (err) {
        return success(res, {
            connected: false,
            error: err.message || 'Failed to connect to GitHub'
        });
    }
}));

module.exports = router;
