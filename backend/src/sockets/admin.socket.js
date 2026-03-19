const prisma = require('../db');
const syncQueueService = require('../services/syncQueue.service');

module.exports = (io) => {
    io.use(async (socket, next) => {
        const apiKey = socket.handshake.auth.apiKey || socket.handshake.headers['x-api-key'];
        if (!apiKey) {
            return next(new Error('Authentication error: Missing API Key'));
        }

        const globalApiKey = process.env.PORTAL_API_KEY || 'master_portal_key_internal';
        
        try {
            // Check if this key belongs to an existing branch
            let branch = await prisma.branch.findFirst({ where: { apiKey: apiKey } });

            // Robust check: If it matches our master key, allow auto-creation/login
            if (!branch && apiKey === globalApiKey) {
                console.log(`[Socket] New branch detected with Master Key. Creating...`);
                // Use a default code or extract it from handshake query if available
                const branchCode = socket.handshake.query.branchCode || 'BR-GEN';
                branch = await prisma.branch.create({
                    data: {
                        name: 'Auto-Registered Branch',
                        code: branchCode,
                        apiKey: apiKey,
                        status: 'ONLINE',
                        lastSeen: new Date()
                    }
                });
            }

            if (!branch) {
                return next(new Error('Authentication error: Invalid API Key'));
            }

            // Bind branch info to socket
            socket.branchId = branch.id;
            socket.branchCode = branch.code;
            
            // Mark as ONLINE
            await prisma.branch.update({
                where: { id: branch.id },
                data: { status: 'ONLINE', lastSeen: new Date() }
            });
            
            socket.join(`branch_${branch.id}`);
            next();
        } catch (err) {
            console.error('Socket auth error:', err);
            next(new Error('Internal server error during auth'));
        }
    });

    io.on('connection', (socket) => {
        console.log(`[Socket] Branch Connected: ${socket.branchCode}`);

        // Push any pending updates to the branch that just connected
        syncQueueService.pushPendingToBranch(socket.branchId);

        // Listen for acknowledgments of synced updates
        socket.on('ack_update', async (data) => {
            const { queueId } = data;
            if (queueId) {
                try {
                    await prisma.syncQueue.update({
                        where: { id: queueId },
                        data: { status: 'SYNCED' }
                    });
                    console.log(`[Sync] Queue item ${queueId} marked as SYNCED for branch ${socket.branchCode}`);
                } catch (error) {
                    console.error('[Sync] Error marking queue item as synced:', error.message);
                }
            }
        });

        // Handle branch requesting data sync (initial sync / HTTP fallback)
        socket.on('branch_request_sync', async (data) => {
            const { branchCode, entities } = data;
            console.log(`[Sync] Branch ${branchCode} requesting sync for: ${entities?.join(', ') || 'all'}`);

            try {
                const result = {};

                if (!entities || entities.includes('branches')) {
                    result.branches = await prisma.branch.findMany({ where: { isActive: true } });
                }

                if (!entities || entities.includes('users')) {
                    result.users = await prisma.user.findMany({
                        where: { isActive: true, branchId: socket.branchId }
                    });
                }

                if (!entities || entities.includes('machineParameters')) {
                    result.machineParameters = await prisma.machineParameter.findMany();
                }

                if (!entities || entities.includes('spareParts')) {
                    result.spareParts = await prisma.masterSparePart.findMany();
                }

                if (!entities || entities.includes('globalParameters')) {
                    result.globalParameters = await prisma.globalParameter.findMany();
                }

                socket.emit('portal_sync_response', { success: true, data: result });
                console.log(`[Sync] Sent sync response to branch ${socket.branchCode}`);
            } catch (error) {
                console.error('[Sync] Error serving sync request:', error.message);
                socket.emit('portal_sync_response', { success: false, error: error.message });
            }
        });

        // Handle user updates from branch (upward sync)
        socket.on('branch_user_update', async (data) => {
            const { user } = data;
            console.log(`[Sync] Received user update from branch ${socket.branchCode}: ${user?.username}`);

            try {
                if (user) {
                    const { branch, ...cleanUser } = user;
                    if (cleanUser._deleted) {
                        await prisma.user.update({
                            where: { id: cleanUser.id },
                            data: { isActive: false }
                        });
                        console.log(`[Sync] User '${user.username}' deactivated on portal`);
                    } else {
                        await prisma.user.upsert({
                            where: { id: cleanUser.id || { username: cleanUser.username } },
                            update: { ...cleanUser, branchId: socket.branchId },
                            create: { ...cleanUser, branchId: socket.branchId }
                        });
                        console.log(`[Sync] User '${user.username}' upserted from branch ${socket.branchCode}`);
                    }
                }
            } catch (error) {
                console.error('[Sync] Error upserting user from branch:', error.message);
            }
        });

        // Upward Sync: Listen for Full Push from Branch
        socket.on('branch_push_all', async (payload) => {
            console.log(`[Sync] Received Full Push from branch ${socket.branchCode}`);
            try {
                const { users, machineParams, spareParts } = payload;

                // 1. Sync Users (Clean them first)
                if (users && Array.isArray(users)) {
                    for (const user of users) {
                        const { branch, ...cleanUser } = user;
                        if (cleanUser._deleted) {
                            await prisma.user.update({
                                where: { id: cleanUser.id },
                                data: { isActive: false }
                            }).catch(() => {});
                        } else {
                            await prisma.user.upsert({
                                where: { id: cleanUser.id },
                                update: { ...cleanUser, branchId: socket.branchId },
                                create: { ...cleanUser, branchId: socket.branchId }
                            });
                        }
                    }
                }

                // 2. Sync Machine Parameters (DISABLED: Portal is source of truth for parameters)
                /*
                if (machineParams && Array.isArray(machineParams)) {
                    for (const param of machineParams) {
                        await prisma.machineParameter.upsert({
                            where: { id: param.id },
                            update: param,
                            create: param
                        });
                    }
                }
                */

                // 3. Sync Spare Parts
                if (spareParts && Array.isArray(spareParts)) {
                    for (const part of spareParts) {
                        await prisma.sparePart.upsert({
                            where: { id: part.id },
                            update: part,
                            create: part
                        });
                    }
                }

                console.log(`[Sync] Full Push completed for branch ${socket.branchCode}`);
            } catch (error) {
                console.error('[Sync] Full Push processing failed:', error.message);
            }
        });

        socket.on('disconnect', async () => {
            console.log(`[Socket] Branch Disconnected: ${socket.branchCode}`);
            try {
                await prisma.branch.update({
                    where: { id: socket.branchId },
                    data: { status: 'OFFLINE', lastSeen: new Date() }
                });
            } catch (error) {
                console.error('[Socket] Error updating branch status:', error.message);
            }
        });
    });
};
