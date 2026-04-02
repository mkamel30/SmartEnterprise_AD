const prisma = require('../db');
const syncQueueService = require('../services/syncQueue.service');
const logger = require('../../utils/logger');

// Helper to log portal sync operations
async function logPortalSync(branchId, branchCode, branchName, type, status, message, itemCount = 0) {
    try {
        await prisma.portalSyncLog.create({
            data: { branchId, branchCode, branchName, type, status, message, itemCount }
        });
    } catch (e) { /* ignore */ }
}

module.exports = (io) => {
    io.use(async (socket, next) => {
        const apiKey = socket.handshake.auth.apiKey || socket.handshake.headers['x-api-key'] || socket.handshake.query.apiKey;
        const token = socket.handshake.auth.token;

        // Check API key first (for branch connections) - API key doesn't expire
        if (apiKey) {
            const globalApiKey = process.env.PORTAL_API_KEY;
            try {
                // Check if this key belongs to an existing branch
                let branch = await prisma.branch.findFirst({ where: { apiKey: apiKey } });

                // Master key check: find branch by code from handshake query
                if (!branch && apiKey === globalApiKey) {
                    const branchCode = socket.handshake.query.branchCode;
                    if (branchCode) {
                        branch = await prisma.branch.findFirst({ where: { code: branchCode } });
                    }
                }

                if (branch) {
                    socket.branchId = branch.id;
                    socket.branchCode = branch.code;
                    socket.isAdmin = false;
                    socket.isBranch = true;
                    logger.info(`[Socket] Branch connected: ${branch.code}`);
                    return next();
                }
            } catch (err) {
                logger.error('[Socket] API key auth error:', err.message);
            }
        }

        // If no API key or API key not found, check token (for admin users)
        if (token) {
            try {
                const jwt = require('jsonwebtoken');
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                socket.adminUser = decoded;
                socket.isAdmin = true;
                socket.isBranch = false;
                logger.info(`[Socket] Admin user connected: ${decoded.username}`);
                return next();
            } catch (err) {
                logger.warn('[Socket] Token verification failed:', err.message);
            }
        }

        // No valid auth provided
        return next(new Error('Authentication error: Invalid API Key or Token'));
    });

    io.on('connection', (socket) => {
        logger.info(`[Socket] ${socket.isAdmin ? 'Admin' : 'Branch'} Connected: ${socket.branchCode || socket.adminUser?.username}`);

        // If this is a branch, update status and join room
        if (socket.isBranch && socket.branchId) {
            const branchUrl = socket.handshake.query.branchUrl || null;
            
            // Update branch status to ONLINE
            prisma.branch.update({
                where: { id: socket.branchId },
                data: { 
                    status: 'ONLINE', 
                    lastSeen: new Date(),
                    url: branchUrl
                }
            }).then(branch => {
                if (branch) {
                    logPortalSync(socket.branchId, socket.branchCode, branch.name, 'CONNECT', 'SUCCESS', `${socket.branchCode} (${branch.name}) اتصل عبر WebSocket`);
                }
            }).catch(() => {});

            // Join branch room
            socket.join(`branch_${socket.branchId}`);

            // Push any pending updates to the branch that just connected
            syncQueueService.pushPendingToBranch(socket.branchId);
        }

        // Listen for acknowledgments of synced updates
        socket.on('ack_update', async (data) => {
            const { queueId } = data;
            if (queueId) {
                try {
                    await prisma.syncQueue.update({
                        where: { id: queueId },
                        data: { status: 'SYNCED' }
                    });
                    logger.info(`[Sync] Queue item ${queueId} marked as SYNCED for branch ${socket.branchCode}`);
                } catch (error) {
                    logger.error('[Sync] Error marking queue item as synced:', error.message);
                }
            }
        });

        // Handle branch_identify event
        socket.on('branch_identify', (data) => {
            logger.info(`[Socket] Branch identity confirmed: ${data.branchCode}`);
            // Could respond or update state if needed
        });

        // Handle branch requesting data sync (initial sync / HTTP fallback)
        socket.on('branch_request_sync', async (data) => {
            const { branchCode, entities } = data;
            logger.info(`[Sync] Branch ${branchCode} requesting sync for: ${entities?.join(', ') || 'all'}`);

            try {
                const result = {};

                if (!entities || entities.includes('branches')) {
                    result.branches = await prisma.branch.findMany({ where: { isActive: true } });
                }

                if (!entities || entities.includes('users')) {
                    result.users = await prisma.user.findMany({
                        where: { isActive: true, branchId: socket.branchId },
                        select: {
                            id: true,
                            uid: true,
                            username: true,
                            email: true,
                            displayName: true,
                            role: true,
                            isActive: true,
                            branchId: true,
                            createdAt: true
                        }
                    });
                }

                if (!entities || entities.includes('machineParameters')) {
                    result.machineParameters = await prisma.machineParameter.findMany();
                }

                if (!entities || entities.includes('spareParts')) {
                    result.masterSpareParts = await prisma.masterSparePart.findMany();
                    result.sparePartPriceLogs = await prisma.sparePartPriceLog.findMany();
                }

                if (!entities || entities.includes('globalParameters')) {
                    result.globalParameters = await prisma.globalParameter.findMany();
                }

                socket.emit('portal_sync_response', { success: true, data: result });
                logger.info(`[Sync] Sent sync response to branch ${socket.branchCode}`);
            } catch (error) {
                logger.error('[Sync] Error serving sync request:', error.message);
                socket.emit('portal_sync_response', { success: false, error: error.message });
            }
        });

        // Handle user updates from branch (upward sync)
        socket.on('branch_user_update', async (data) => {
            const { user, branchCode } = data;
            logger.info(`[Sync] Received user update from branch ${branchCode || socket.branchCode}: ${user?.username}`);

            try {
                if (user) {
                    const { branch, ...cleanUser } = user;
                    const targetBranchCode = branchCode || socket.branchCode;
                    const targetBranch = await prisma.branch.findFirst({ where: { code: targetBranchCode } });

                    if (cleanUser._deleted) {
                        await prisma.user.update({
                            where: { id: cleanUser.id },
                            data: { isActive: false }
                        });
                        logger.info(`[Sync] User '${user.username}' deactivated on portal`);
                    } else {
                             const { id, uid, username, email, displayName, role, isActive } = cleanUser;
                             const existingUser = id ? await prisma.user.findUnique({ where: { id } }) 
                                                : (username ? await prisma.user.findFirst({ where: { username, branchId: targetBranch?.id } }) : null);
     
                             if (existingUser) {
                                 await prisma.user.update({
                                     where: { id: existingUser.id },
                                     data: { uid, email, displayName, role, isActive, branchId: targetBranch?.id }
                                 });
                                 logger.info(`[Sync] User '${username}' updated from branch ${targetBranchCode}`);
                             } else {
                                 await prisma.user.create({
                                     data: { id, uid, username, email, displayName, role, isActive, branchId: targetBranch?.id }
                                 });
                                 logger.info(`[Sync] User '${username}' created from branch ${targetBranchCode}`);
                             }
                    }

                    // Log to UserSyncLog
                    await prisma.userSyncLog.create({
                        data: {
                            branchCode: targetBranchCode,
                            userId: cleanUser.id,
                            username: user.username,
                            email: user.email,
                            action: cleanUser._deleted ? 'DELETED' : (existingUser ? 'SYNCED' : 'CREATED'),
                            source: 'BRANCH',
                            status: 'SUCCESS'
                        }
                    });
                }
            } catch (error) {
                logger.error('[Sync] Error upserting user from branch:', error.message);
                
                // Log failure
                await prisma.userSyncLog.create({
                    data: {
                        branchCode: branchCode || socket.branchCode,
                        userId: user?.id,
                        username: user?.username,
                        action: 'SYNCED',
                        source: 'BRANCH',
                        status: 'FAILED',
                        errorMessage: error.message
                    }
                }).catch(() => {});
            }
        });

        // Upward Sync: Listen for Full Push from Branch
        socket.on('branch_push_all', async (payload) => {
            logger.info(`[Sync] Received Full Push from branch ${socket.branchCode}`);
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
                             const { id, uid, username, email, displayName, role, isActive } = cleanUser;
                             const existingUser = id ? await prisma.user.findUnique({ where: { id } }) : null;
                             if (existingUser) {
                                 await prisma.user.update({
                                     where: { id },
                                     data: { uid, username, email, displayName, role, isActive, branchId: socket.branchId }
                                 });
                             } else {
                                 await prisma.user.create({
                                     data: { id, uid, username, email, displayName, role, isActive, branchId: socket.branchId }
                                 });
                             }
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

                // 3. Sync Spare Parts — DISABLED: Admin Portal is the source of truth
                // Branches receive spare parts via normal sync, not via branch_push_all

                logger.info(`[Sync] Full Push completed for branch ${socket.branchCode}`);
            } catch (error) {
                logger.error('[Sync] Full Push processing failed:', error.message);
            }
        });

                // Admin requests branch stock for a specific spare part
                // Broadcasts to all connected branches; each branch responds with its stock
        socket.on('request_branch_stock', async (data) => {
            // Only allow admin users to request stock
            if (!socket.isAdmin) {
                logger.warn('[Sync] Non-admin attempted to request branch stock');
                return;
            }
            
            const { partId, requestId } = data;
            socket.adminRequestId = requestId;
            logger.info(`[Sync] Admin ${socket.adminUser?.username} requested stock for part ${partId} (requestId: ${requestId})`);

            io.emit('admin_request_branch_stock', {
                partId,
                requestId
            });
            logger.info(`[Sync] Broadcast admin_request_branch_stock to all branches for part ${partId}`);
        });

        socket.on('branch_stock_response', (data) => {
            const { requestId } = data;
            if (socket.branchId && requestId) {
                io.emit('admin_branch_stock_response', data);
            }
        });

        // Handle full inventory push from branch
        socket.on('branch_inventory_push', async (data) => {
            const { inventory, branchCode } = data;
            if (!socket.isBranch || !socket.branchId) return;
            
            logger.info(`[Sync] Received inventory push (${inventory?.length || 0} items) from branch ${branchCode || socket.branchCode}`);

            try {
                if (inventory && Array.isArray(inventory)) {
                    // Use a transaction to ensure atomic updates
                    await prisma.$transaction(
                        inventory.map(item => prisma.branchSparePart.upsert({
                            where: {
                                branchId_partId: {
                                    branchId: socket.branchId,
                                    partId: item.partId
                                }
                            },
                            update: { quantity: item.quantity, lastUpdated: new Date() },
                            create: {
                                branchId: socket.branchId,
                                partId: item.partId,
                                quantity: item.quantity
                            }
                        }))
                    );
                    
                    logPortalSync(socket.branchId, socket.branchCode, null, 'PULL', 'SUCCESS', `تم تحديث مخزون ${inventory.length} قطعة غيار`, inventory.length);
                }
            } catch (error) {
                logger.error('[Sync] Error processing inventory push:', error.message);
                logPortalSync(socket.branchId, socket.branchCode, null, 'PULL', 'FAILED', `فشل تحديث المخزون: ${error.message}`);
            }
        });

        // Handle comprehensive reporting data push from branch
        socket.on('branch_data_push', async (data) => {
            const { entities, branchCode } = data;
            if (!socket.isBranch || !socket.branchId) return;

            logger.info(`[Sync] Received data push (${Object.keys(entities || {}).length} types) from branch ${branchCode || socket.branchCode}`);

            try {
                // We use individual updates to handle potential schema differences or missing fields gracefully
                if (entities.machines) {
                    for (const m of entities.machines) {
                        await prisma.warehouseMachine.upsert({
                            where: { serialNumber: m.serialNumber },
                            update: { ...m, branchId: socket.branchId, updatedAt: new Date() },
                            create: { ...m, branchId: socket.branchId }
                        });
                    }
                }

                if (entities.sales) {
                    for (const s of entities.sales) {
                        await prisma.machineSale.upsert({
                            where: { id: s.id },
                            update: { ...s, branchId: socket.branchId },
                            create: { ...s, branchId: socket.branchId }
                        });
                    }
                }

                if (entities.sims) {
                    for (const sim of entities.sims) {
                        await prisma.warehouseSim.upsert({
                            where: { serialNumber: sim.serialNumber },
                            update: { ...sim, branchId: socket.branchId, updatedAt: new Date() },
                            create: { ...sim, branchId: socket.branchId }
                        });
                    }
                }

                if (entities.movements) {
                    for (const mov of entities.movements) {
                        await prisma.stockMovement.upsert({
                            where: { id: mov.id },
                            update: { ...mov, branchId: socket.branchId },
                            create: { ...mov, branchId: socket.branchId }
                        });
                    }
                }

                if (entities.payments) {
                    for (const pay of entities.payments) {
                        await prisma.payment.upsert({
                            where: { id: pay.id },
                            update: { ...pay, branchId: socket.branchId },
                            create: { ...pay, branchId: socket.branchId }
                        });
                    }
                }

                logPortalSync(socket.branchId, socket.branchCode, null, 'PULL', 'SUCCESS', `تم تحديث بيانات التقارير (ماكينات، مبيعات، شرائح، حركات، مدفوعات)`);
            } catch (error) {
                logger.error('[Sync] Error processing data push:', error.message);
                logPortalSync(socket.branchId, socket.branchCode, null, 'PULL', 'FAILED', `فشل تحديث بيانات التقارير: ${error.message}`);
            }
        });

        // Handle comprehensive report data push from branch (new full report sync)
        socket.on('branch_report_push', async (data) => {
            const { branchCode, branchId: reportedBranchId, entities, timestamp } = data;
            if (!socket.isBranch || !socket.branchId) return;

            logger.info(`[Sync] Received REPORT push (${Object.keys(entities || {}).length} types) from branch ${branchCode || socket.branchCode}`);

            try {
                let totalSynced = 0;
                const results = {};

                // 1. Maintenance Requests
                if (entities.maintenanceRequests && Array.isArray(entities.maintenanceRequests)) {
                    for (const r of entities.maintenanceRequests) {
                        await prisma.maintenanceRequest.upsert({
                            where: { id: r.id },
                            update: { ...r, branchId: socket.branchId },
                            create: { ...r, branchId: socket.branchId }
                        });
                    }
                    results.maintenanceRequests = entities.maintenanceRequests.length;
                    totalSynced += entities.maintenanceRequests.length;
                }

                // 2. Payments
                if (entities.payments && Array.isArray(entities.payments)) {
                    for (const p of entities.payments) {
                        await prisma.payment.upsert({
                            where: { id: p.id },
                            update: { ...p, branchId: socket.branchId },
                            create: { ...p, branchId: socket.branchId }
                        });
                    }
                    results.payments = entities.payments.length;
                    totalSynced += entities.payments.length;
                }

                // 3. Stock Movements
                if (entities.stockMovements && Array.isArray(entities.stockMovements)) {
                    for (const m of entities.stockMovements) {
                        await prisma.stockMovement.upsert({
                            where: { id: m.id },
                            update: { ...m, branchId: socket.branchId },
                            create: { ...m, branchId: socket.branchId }
                        });
                    }
                    results.stockMovements = entities.stockMovements.length;
                    totalSynced += entities.stockMovements.length;
                }

                // 4. Machine Sales
                if (entities.machineSales && Array.isArray(entities.machineSales)) {
                    for (const s of entities.machineSales) {
                        await prisma.machineSale.upsert({
                            where: { id: s.id },
                            update: { ...s, branchId: socket.branchId },
                            create: { ...s, branchId: socket.branchId }
                        });
                    }
                    results.machineSales = entities.machineSales.length;
                    totalSynced += entities.machineSales.length;
                }

                // 5. Installments
                if (entities.installments && Array.isArray(entities.installments)) {
                    for (const i of entities.installments) {
                        await prisma.installment.upsert({
                            where: { id: i.id },
                            update: { ...i, branchId: socket.branchId },
                            create: { ...i, branchId: socket.branchId }
                        });
                    }
                    results.installments = entities.installments.length;
                    totalSynced += entities.installments.length;
                }

                // 6. SIM Cards
                if (entities.simCards && Array.isArray(entities.simCards)) {
                    for (const sim of entities.simCards) {
                        await prisma.simCard.upsert({
                            where: { id: sim.id },
                            update: { ...sim, branchId: socket.branchId },
                            create: { ...sim, branchId: socket.branchId }
                        });
                    }
                    results.simCards = entities.simCards.length;
                    totalSynced += entities.simCards.length;
                }

                // 7. SIM Movements
                if (entities.simMovements && Array.isArray(entities.simMovements)) {
                    for (const m of entities.simMovements) {
                        await prisma.simMovementLog.upsert({
                            where: { id: m.id },
                            update: { ...m, branchId: socket.branchId },
                            create: { ...m, branchId: socket.branchId }
                        });
                    }
                    results.simMovements = entities.simMovements.length;
                    totalSynced += entities.simMovements.length;
                }

                // 8. Warehouse Machines
                if (entities.warehouseMachines && Array.isArray(entities.warehouseMachines)) {
                    for (const m of entities.warehouseMachines) {
                        await prisma.warehouseMachine.upsert({
                            where: { serialNumber: m.serialNumber },
                            update: { ...m, branchId: socket.branchId, updatedAt: new Date() },
                            create: { ...m, branchId: socket.branchId }
                        });
                    }
                    results.warehouseMachines = entities.warehouseMachines.length;
                    totalSynced += entities.warehouseMachines.length;
                }

                // 9. Warehouse SIMs
                if (entities.warehouseSims && Array.isArray(entities.warehouseSims)) {
                    for (const s of entities.warehouseSims) {
                        await prisma.warehouseSim.upsert({
                            where: { serialNumber: s.serialNumber },
                            update: { ...s, branchId: socket.branchId, updatedAt: new Date() },
                            create: { ...s, branchId: socket.branchId }
                        });
                    }
                    results.warehouseSims = entities.warehouseSims.length;
                    totalSynced += entities.warehouseSims.length;
                }

                // 10. POS Machines
                if (entities.posMachines && Array.isArray(entities.posMachines)) {
                    for (const p of entities.posMachines) {
                        await prisma.posMachine.upsert({
                            where: { id: p.id },
                            update: { ...p, branchId: socket.branchId },
                            create: { ...p, branchId: socket.branchId }
                        });
                    }
                    results.posMachines = entities.posMachines.length;
                    totalSynced += entities.posMachines.length;
                }

                // 11. Customers
                if (entities.customers && Array.isArray(entities.customers)) {
                    for (const c of entities.customers) {
                        await prisma.customer.upsert({
                            where: { id: c.id },
                            update: { ...c, branchId: socket.branchId },
                            create: { ...c, branchId: socket.branchId }
                        });
                    }
                    results.customers = entities.customers.length;
                    totalSynced += entities.customers.length;
                }

                logPortalSync(socket.branchId, socket.branchCode, null, 'PULL', 'SUCCESS', `تم تحديث جميع بيانات التقارير (${totalSynced} عنصر)`, totalSynced);
                logger.info(`[Sync] Report push completed for ${branchCode}: ${totalSynced} items synced`);
            } catch (error) {
                logger.error('[Sync] Error processing report push:', error.message);
                logPortalSync(socket.branchId, socket.branchCode, null, 'PULL', 'FAILED', `فشل تحديث بيانات التقارير: ${error.message}`);
            }
        });

        socket.on('disconnect', async () => {
            logger.info(`[Socket] Branch Disconnected: ${socket.branchCode}`);
            logPortalSync(socket.branchId, socket.branchCode, socket.branchName, 'DISCONNECT', 'SUCCESS', `${socket.branchCode} (${socket.branchName}) انقطع`);
            try {
                await prisma.branch.update({
                    where: { id: socket.branchId },
                    data: { status: 'OFFLINE', lastSeen: new Date() }
                });
            } catch (error) {
                logger.error('[Socket] Error updating branch status:', error.message);
            }
        });
    });
};
