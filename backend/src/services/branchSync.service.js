const axios = require('axios');
const prisma = require('../db');
const logger = require('../../utils/logger');

/**
 * Service to synchronize data from the Central Portal to Branches
 */
const branchSyncService = {
    /**
     * Common push function
     */
    async pushToBranches(payload) {
        const branches = await prisma.branch.findMany({
            where: { isActive: true, url: { not: null }, NOT: { url: '' } }
        });

        if (branches.length === 0) return { success: 0, total: 0 };

        const results = await Promise.allSettled(branches.map(async (branch) => {
            const branchUrl = branch.url.endsWith('/') ? branch.url.slice(0, -1) : branch.url;
            return axios.post(`${branchUrl}/api/system/sync/parameters`, payload, {
                timeout: 5000,
                headers: {
                    'x-portal-sync-key': process.env.PORTAL_API_KEY,
                    'Content-Type': 'application/json'
                }
            });
        }));

        const successful = results.filter(r => r.status === 'fulfilled').length;
        return { success: successful, total: branches.length };
    },

    /**
     * Broadcast all global parameters
     */
    async broadcastParameters() {
        logger.info('[BranchSync] Broadcasting global parameters...');
        try {
            const parameters = await prisma.globalParameter.findMany();
            return await this.pushToBranches({ globalParameters: parameters });
        } catch (error) {
            logger.error({ err: error.message }, '[BranchSync] Global parameters broadcast failed');
        }
    },

    /**
     * Broadcast machine parameters
     */
    async broadcastMachineParameters() {
        logger.info('[BranchSync] Broadcasting machine parameters...');
        try {
            const machineParameters = await prisma.machineParameter.findMany();
            return await this.pushToBranches({ machineParameters });
        } catch (error) {
            logger.error({ err: error.message }, '[BranchSync] Machine parameters broadcast failed');
        }
    },

    /**
     * Broadcast master spare parts
     */
    async broadcastMasterSpareParts() {
        logger.info('[BranchSync] Broadcasting spare parts catalog...');
        try {
            const masterParts = await prisma.masterSparePart.findMany();
            return await this.pushToBranches({ masterSpareParts: masterParts });
        } catch (error) {
            logger.error({ err: error.message }, '[BranchSync] Spare parts broadcast failed');
        }
    }
};

module.exports = branchSyncService;
