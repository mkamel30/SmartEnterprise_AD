const prisma = require('../db');
const syncQueueService = require('../services/syncQueue.service');
const logger = require('../../utils/logger');

const ALLOWED_WAREHOUSE_MACHINE_FIELDS = ['serialNumber', 'model', 'manufacturer', 'status', 'resolution', 'notes', 'complaint', 'importDate', 'updatedAt', 'originalOwnerId', 'readyForPickup'];
const ALLOWED_MACHINE_SALE_FIELDS = ['serialNumber', 'customerId', 'saleDate', 'type', 'totalPrice', 'paidAmount', 'status', 'notes'];
const ALLOWED_WAREHOUSE_SIM_FIELDS = ['serialNumber', 'type', 'networkType', 'status', 'notes', 'importDate', 'updatedAt'];
const ALLOWED_STOCK_MOVEMENT_FIELDS = ['partId', 'type', 'quantity', 'reason', 'requestId', 'userId', 'performedBy', 'isPaid', 'receiptNumber', 'customerId', 'customerName', 'machineSerial', 'machineModel', 'paymentPlace'];
const ALLOWED_PAYMENT_FIELDS = ['customerId', 'customerName', 'requestId', 'amount', 'type', 'reason', 'paymentPlace', 'paymentMethod', 'receiptNumber', 'notes', 'userId', 'userName'];
const ALLOWED_MAINTENANCE_REQUEST_FIELDS = ['customerId', 'posMachineId', 'customerName', 'customerBkcode', 'machineModel', 'machineManufacturer', 'serialNumber', 'status', 'technicianId', 'technician', 'type', 'description', 'createdBy', 'notes', 'complaint', 'actionTaken', 'closingUserId', 'closingUserName', 'closingTimestamp', 'usedParts', 'receiptNumber', 'totalCost'];
const ALLOWED_INSTALLMENT_FIELDS = ['saleId', 'dueDate', 'amount', 'isPaid', 'paidAt', 'description', 'paidAmount', 'paymentPlace', 'receiptNumber'];
const ALLOWED_SIM_CARD_FIELDS = ['serialNumber', 'type', 'networkType', 'customerId'];
const ALLOWED_SIM_MOVEMENT_FIELDS = ['simId', 'serialNumber', 'action', 'details', 'performedBy'];
const ALLOWED_POS_MACHINE_FIELDS = ['serialNumber', 'posId', 'model', 'manufacturer', 'customerId'];
const ALLOWED_CUSTOMER_FIELDS = ['bkcode', 'client_name', 'supply_office', 'operating_date', 'address', 'contact_person', 'scanned_id_path', 'national_id', 'dept', 'telephone_1', 'telephone_2', 'has_gates', 'bk_type', 'notes', 'papers_date', 'isSpecial', 'clienttype', 'status'];

function pickFields(obj, allowedFields) {
    if (!obj || typeof obj !== 'object') return {};
    const result = {};
    for (const field of allowedFields) {
        if (obj[field] !== undefined) {
            result[field] = obj[field];
        }
    }
    return result;
}

async function logPortalSync(branchId, branchCode, branchName, type, status, message, itemCount = 0) {
    try {
        await prisma.portalSyncLog.create({
            data: { branchId, branchCode, branchName, type, status, message, itemCount }
        });
    } catch (e) { logger.error({ err: e.message }, 'Failed to log portal sync'); }
}

module.exports = (io) => {
    io.use(async (socket, next) => {
        const apiKey = socket.handshake.auth.apiKey || socket.handshake.headers['x-api-key'] || socket.handshake.query.apiKey;
        const token = socket.handshake.auth.token;

        if (apiKey) {
            const globalApiKey = process.env.PORTAL_API_KEY;
            try {
                let branch = await prisma.branch.findFirst({ where: { apiKey: apiKey } });

                if (!branch && apiKey === globalApiKey) {
                    const branchCode = socket.handshake.query.branchCode;
                    if (branchCode) {
                        branch = await prisma.branch.findFirst({ where: { code: branchCode } });
                    }
                }

                if (branch) {
                    socket.branchId = branch.id;
                    socket.branchCode = branch.code;
                    socket.branchName = branch.name;
                    socket.isAdmin = false;
                    socket.isBranch = true;
                    logger.info(`[Socket] Branch connected: ${branch.code}`);
                    return next();
                }
            } catch (err) {
                logger.error('[Socket] API key auth error:', err.message);
            }
        }

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

        return next(new Error('Authentication error: Invalid API Key or Token'));
    });

    io.on('connection', (socket) => {
        logger.info(`[Socket] ${socket.isAdmin ? 'Admin' : 'Branch'} Connected: ${socket.branchCode || socket.adminUser?.username}`);

        if (socket.isBranch && socket.branchId) {
            const branchUrl = socket.handshake.query.branchUrl || null;
            
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
            }).catch((e) => { logger.error({ err: e.message }, 'Failed to update branch status on connect'); });

            socket.join(`branch_${socket.branchId}`);

            syncQueueService.pushPendingToBranch(socket.branchId);
        }

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

        socket.on('branch_identify', (data) => {
            logger.info(`[Socket] Branch identity confirmed: ${data.branchCode}`);
        });

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
                socket.emit('portal_sync_response', { success: false, error: 'Sync request failed' });
            }
        });

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

        socket.on('branch_push_all', async (payload) => {
            logger.info(`[Sync] Received Full Push from branch ${socket.branchCode}`);
            try {
                const { users, machineParams, spareParts } = payload;

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

                logger.info(`[Sync] Full Push completed for branch ${socket.branchCode}`);
            } catch (error) {
                logger.error('[Sync] Full Push processing failed:', error.message);
            }
        });

        socket.on('request_branch_stock', async (data) => {
            if (!socket.isAdmin) {
                logger.warn('[Sync] Non-admin attempted to request branch stock');
                return;
            }
            
            const { partId, requestId, targetBranchId } = data;
            socket.adminRequestId = requestId;
            logger.info(`[Sync] Admin ${socket.adminUser?.username} requested stock for part ${partId} (requestId: ${requestId})`);

            const emitTarget = targetBranchId ? io.to(`branch_${targetBranchId}`) : io;
            emitTarget.emit('admin_request_branch_stock', {
                partId,
                requestId,
                targetBranchId: targetBranchId || null
            });
            logger.info(`[Sync] Broadcast admin_request_branch_stock for part ${partId}${targetBranchId ? ` to branch ${targetBranchId}` : ' to all branches'}`);
        });

        socket.on('branch_stock_response', (data) => {
            const { requestId } = data;
            if (socket.branchId && requestId) {
                io.emit('admin_branch_stock_response', data);
            }
        });

        socket.on('branch_inventory_push', async (data) => {
            const { inventory, branchCode } = data;
            if (!socket.isBranch || !socket.branchId) return;
            
            logger.info(`[Sync] Received inventory push (${inventory?.length || 0} items) from branch ${branchCode || socket.branchCode}`);

            try {
                if (inventory && Array.isArray(inventory)) {
                    const validItems = inventory
                        .filter(item => item.partId && typeof item.quantity === 'number' && item.quantity >= 0)
                        .map(item => prisma.branchSparePart.upsert({
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
                        }));

                    if (validItems.length > 0) {
                        await prisma.$transaction(validItems);
                    }
                    
                    logPortalSync(socket.branchId, socket.branchCode, null, 'PULL', 'SUCCESS', `تم تحديث مخزون ${inventory.length} قطعة غيار`, inventory.length);
                }
            } catch (error) {
                logger.error('[Sync] Error processing inventory push:', error.message);
                logPortalSync(socket.branchId, socket.branchCode, null, 'PULL', 'FAILED', `فشل تحديث المخزون: ${error.message}`);
            }
        });

        socket.on('branch_data_push', async (data) => {
            const { entities, branchCode } = data;
            if (!socket.isBranch || !socket.branchId) return;

            logger.info(`[Sync] Received data push (${Object.keys(entities || {}).length} types) from branch ${branchCode || socket.branchCode}`);

            try {
                if (entities.machines) {
                    for (const m of entities.machines) {
                        const safe = pickFields(m, ALLOWED_WAREHOUSE_MACHINE_FIELDS);
                        await prisma.warehouseMachine.upsert({
                            where: { serialNumber: m.serialNumber },
                            update: { ...safe, branchId: socket.branchId, updatedAt: new Date() },
                            create: { ...safe, branchId: socket.branchId }
                        });
                    }
                }

                if (entities.sales) {
                    for (const s of entities.sales) {
                        const safe = pickFields(s, ALLOWED_MACHINE_SALE_FIELDS);
                        await prisma.machineSale.upsert({
                            where: { id: s.id },
                            update: { ...safe, branchId: socket.branchId },
                            create: { ...safe, branchId: socket.branchId }
                        });
                    }
                }

                if (entities.sims) {
                    for (const sim of entities.sims) {
                        const safe = pickFields(sim, ALLOWED_WAREHOUSE_SIM_FIELDS);
                        await prisma.warehouseSim.upsert({
                            where: { serialNumber: sim.serialNumber },
                            update: { ...safe, branchId: socket.branchId, updatedAt: new Date() },
                            create: { ...safe, branchId: socket.branchId }
                        });
                    }
                }

                if (entities.movements) {
                    const existingPartIds = new Set(
                        (await prisma.masterSparePart.findMany({ select: { id: true } })).map(p => p.id)
                    );
                    for (const mov of entities.movements) {
                        if (mov.partId && !existingPartIds.has(mov.partId)) {
                            logger.warn(`[Sync] Skipping StockMovement ${mov.id}: MasterSparePart ${mov.partId} not found`);
                            continue;
                        }
                        const safe = pickFields(mov, ALLOWED_STOCK_MOVEMENT_FIELDS);
                        await prisma.stockMovement.upsert({
                            where: { id: mov.id },
                            update: { ...safe, branchId: socket.branchId },
                            create: { ...safe, branchId: socket.branchId }
                        });
                    }
                }

                if (entities.payments) {
                    for (const pay of entities.payments) {
                        const safe = pickFields(pay, ALLOWED_PAYMENT_FIELDS);
                        await prisma.payment.upsert({
                            where: { id: pay.id },
                            update: { ...safe, branchId: socket.branchId },
                            create: { ...safe, branchId: socket.branchId }
                        });
                    }
                }

                logPortalSync(socket.branchId, socket.branchCode, null, 'PULL', 'SUCCESS', `تم تحديث بيانات التقارير (ماكينات، مبيعات، شرائح، حركات، مدفوعات)`);
            } catch (error) {
                logger.error('[Sync] Error processing data push:', error.message);
                logPortalSync(socket.branchId, socket.branchCode, null, 'PULL', 'FAILED', `فشل تحديث بيانات التقارير: ${error.message}`);
            }
        });

        socket.on('branch_report_push', async (data) => {
            const { branchCode, branchId: reportedBranchId, entities, timestamp } = data;
            if (!socket.isBranch || !socket.branchId) return;

            logger.info(`[Sync] Received REPORT push (${Object.keys(entities || {}).length} types) from branch ${branchCode || socket.branchCode}`);

            try {
                let totalSynced = 0;
                const results = {};

                if (entities.maintenanceRequests && Array.isArray(entities.maintenanceRequests)) {
                    for (const r of entities.maintenanceRequests) {
                        const safe = pickFields(r, ALLOWED_MAINTENANCE_REQUEST_FIELDS);
                        await prisma.maintenanceRequest.upsert({
                            where: { id: r.id },
                            update: { ...safe, branchId: socket.branchId },
                            create: { ...safe, branchId: socket.branchId }
                        });
                    }
                    results.maintenanceRequests = entities.maintenanceRequests.length;
                    totalSynced += entities.maintenanceRequests.length;
                }

                if (entities.payments && Array.isArray(entities.payments)) {
                    for (const p of entities.payments) {
                        const safe = pickFields(p, ALLOWED_PAYMENT_FIELDS);
                        await prisma.payment.upsert({
                            where: { id: p.id },
                            update: { ...safe, branchId: socket.branchId },
                            create: { ...safe, branchId: socket.branchId }
                        });
                    }
                    results.payments = entities.payments.length;
                    totalSynced += entities.payments.length;
                }

                if (entities.stockMovements && Array.isArray(entities.stockMovements)) {
                    const existingPartIds = new Set(
                        (await prisma.masterSparePart.findMany({ select: { id: true } })).map(p => p.id)
                    );
                    for (const m of entities.stockMovements) {
                        if (m.partId && !existingPartIds.has(m.partId)) {
                            logger.warn(`[Sync] Skipping StockMovement ${m.id}: MasterSparePart ${m.partId} not found`);
                            continue;
                        }
                        const safe = pickFields(m, ALLOWED_STOCK_MOVEMENT_FIELDS);
                        await prisma.stockMovement.upsert({
                            where: { id: m.id },
                            update: { ...safe, branchId: socket.branchId },
                            create: { ...safe, branchId: socket.branchId }
                        });
                    }
                    results.stockMovements = entities.stockMovements.length;
                    totalSynced += entities.stockMovements.length;
                }

                if (entities.machineSales && Array.isArray(entities.machineSales)) {
                    for (const s of entities.machineSales) {
                        const safe = pickFields(s, ALLOWED_MACHINE_SALE_FIELDS);
                        await prisma.machineSale.upsert({
                            where: { id: s.id },
                            update: { ...safe, branchId: socket.branchId },
                            create: { ...safe, branchId: socket.branchId }
                        });
                    }
                    results.machineSales = entities.machineSales.length;
                    totalSynced += entities.machineSales.length;
                }

                if (entities.installments && Array.isArray(entities.installments)) {
                    for (const i of entities.installments) {
                        const safe = pickFields(i, ALLOWED_INSTALLMENT_FIELDS);
                        await prisma.installment.upsert({
                            where: { id: i.id },
                            update: { ...safe, branchId: socket.branchId },
                            create: { ...safe, branchId: socket.branchId }
                        });
                    }
                    results.installments = entities.installments.length;
                    totalSynced += entities.installments.length;
                }

                if (entities.simCards && Array.isArray(entities.simCards)) {
                    for (const sim of entities.simCards) {
                        const safe = pickFields(sim, ALLOWED_SIM_CARD_FIELDS);
                        await prisma.simCard.upsert({
                            where: { id: sim.id },
                            update: { ...safe, branchId: socket.branchId },
                            create: { ...safe, branchId: socket.branchId }
                        });
                    }
                    results.simCards = entities.simCards.length;
                    totalSynced += entities.simCards.length;
                }

                if (entities.simMovements && Array.isArray(entities.simMovements)) {
                    for (const m of entities.simMovements) {
                        const safe = pickFields(m, ALLOWED_SIM_MOVEMENT_FIELDS);
                        await prisma.simMovementLog.upsert({
                            where: { id: m.id },
                            update: { ...safe, branchId: socket.branchId },
                            create: { ...safe, branchId: socket.branchId }
                        });
                    }
                    results.simMovements = entities.simMovements.length;
                    totalSynced += entities.simMovements.length;
                }

                if (entities.warehouseMachines && Array.isArray(entities.warehouseMachines)) {
                    for (const m of entities.warehouseMachines) {
                        const safe = pickFields(m, ALLOWED_WAREHOUSE_MACHINE_FIELDS);
                        await prisma.warehouseMachine.upsert({
                            where: { serialNumber: m.serialNumber },
                            update: { ...safe, branchId: socket.branchId, updatedAt: new Date() },
                            create: { ...safe, branchId: socket.branchId }
                        });
                    }
                    results.warehouseMachines = entities.warehouseMachines.length;
                    totalSynced += entities.warehouseMachines.length;
                }

                if (entities.warehouseSims && Array.isArray(entities.warehouseSims)) {
                    for (const s of entities.warehouseSims) {
                        const safe = pickFields(s, ALLOWED_WAREHOUSE_SIM_FIELDS);
                        await prisma.warehouseSim.upsert({
                            where: { serialNumber: s.serialNumber },
                            update: { ...safe, branchId: socket.branchId, updatedAt: new Date() },
                            create: { ...safe, branchId: socket.branchId }
                        });
                    }
                    results.warehouseSims = entities.warehouseSims.length;
                    totalSynced += entities.warehouseSims.length;
                }

                if (entities.posMachines && Array.isArray(entities.posMachines)) {
                    for (const p of entities.posMachines) {
                        const safe = pickFields(p, ALLOWED_POS_MACHINE_FIELDS);
                        await prisma.posMachine.upsert({
                            where: { id: p.id },
                            update: { ...safe, branchId: socket.branchId },
                            create: { ...safe, branchId: socket.branchId }
                        });
                    }
                    results.posMachines = entities.posMachines.length;
                    totalSynced += entities.posMachines.length;
                }

                if (entities.customers && Array.isArray(entities.customers)) {
                    for (const c of entities.customers) {
                        const safe = pickFields(c, ALLOWED_CUSTOMER_FIELDS);
                        await prisma.customer.upsert({
                            where: { id: c.id },
                            update: { ...safe, branchId: socket.branchId },
                            create: { ...safe, branchId: socket.branchId }
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
            if (socket.branchId && socket.isBranch) {
                logPortalSync(socket.branchId, socket.branchCode, socket.branchName, 'DISCONNECT', 'SUCCESS', `${socket.branchCode} (${socket.branchName}) انقطع`);
                try {
                    await prisma.branch.update({
                        where: { id: socket.branchId },
                        data: { status: 'OFFLINE', lastSeen: new Date() }
                    });
                } catch (error) {
                    logger.error('[Socket] Error updating branch status:', error.message);
                }
            }
        });
    });
};
