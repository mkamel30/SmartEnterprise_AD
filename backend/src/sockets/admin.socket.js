const prisma = require('../db');
const syncQueueService = require('../services/syncQueue.service');
const logger = require('../../utils/logger');
const {
    paymentItemSchema,
    maintenanceRequestSchema,
    stockMovementSchema,
    machineSaleSchema,
    installmentSchema,
    simCardSchema,
    simMovementSchema,
    warehouseMachineSchema,
    warehouseSimSchema,
    posMachineSchema,
    customerSchema,
    inventorySchema,
    usedPartLogSchema,
    validateEntityArray
} = require('../routes/sync.schema');

const ALLOWED_WAREHOUSE_MACHINE_FIELDS = ['serialNumber', 'model', 'manufacturer', 'status', 'resolution', 'notes', 'complaint', 'importDate', 'updatedAt', 'originalOwnerId', 'readyForPickup', 'requestId', 'customerId', 'customerName', 'customerBkcode'];
const ALLOWED_MACHINE_SALE_FIELDS = ['serialNumber', 'customerId', 'customerName', 'customerBkcode', 'saleDate', 'type', 'totalPrice', 'paidAmount', 'status', 'notes'];
const ALLOWED_WAREHOUSE_SIM_FIELDS = ['serialNumber', 'type', 'networkType', 'status', 'notes', 'importDate', 'updatedAt'];
const ALLOWED_STOCK_MOVEMENT_FIELDS = ['id', 'partId', 'type', 'quantity', 'reason', 'requestId', 'userId', 'performedBy', 'isPaid', 'paidAmount', 'receiptNumber', 'customerId', 'customerName', 'customerBkcode', 'machineSerial', 'machineModel', 'paymentPlace', 'createdAt'];
const ALLOWED_PAYMENT_FIELDS = ['customerId', 'customerName', 'customerBkcode', 'requestId', 'amount', 'type', 'reason', 'paymentPlace', 'paymentMethod', 'receiptNumber', 'notes', 'userId', 'userName'];
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

async function updateBranchEntitySync(branchId, entityType, recordCount, status, errorMessage = null) {
    try {
        await prisma.branchEntitySync.upsert({
            where: { branchId_entityType: { branchId, entityType } },
            update: { lastSyncedAt: new Date(), recordCount, status, errorMessage },
            create: { branchId, entityType, lastSyncedAt: new Date(), recordCount, status, errorMessage }
        });
    } catch (e) { logger.error({ err: e.message }, `Failed to update entity sync for ${entityType}`); }
}

async function ensureCustomerExists(customerId, customerName, customerBkcode, branchId) {
    if (!customerId) return;
    try {
        let finalBkcode = customerBkcode || `AUTO-${customerId.substring(0, 8)}`;
        const hasRealData = customerName && customerName !== 'غير معروف (تلقائي)';
        
        await prisma.customer.upsert({
            where: { id: customerId },
            update: hasRealData ? {
                client_name: customerName,
                bkcode: customerBkcode || undefined,
                status: 'SYNCED'
            } : {
                status: 'AUTO_SYNC'
            },
            create: {
                id: customerId,
                client_name: customerName || 'غير معروف (تلقائي)',
                bkcode: finalBkcode,
                branchId: branchId,
                status: hasRealData ? 'SYNCED' : 'AUTO_SYNC'
            }
        });
    } catch (e) {
        if (e.code === 'P2002' && e.meta?.target?.includes('bkcode')) {
            logger.warn(`[Socket Sync] Customer bkcode conflict for ${customerId}, skipping bkcode update`);
            try {
                await prisma.customer.upsert({
                    where: { id: customerId },
                    update: hasRealData ? { client_name: customerName } : {},
                    create: {
                        id: customerId,
                        client_name: customerName || 'غير معروف (تلقائي)',
                        bkcode: `AUTO-${customerId.substring(0, 8)}-${Date.now()}`,
                        branchId: branchId,
                        status: 'AUTO_SYNC'
                    }
                });
            } catch (e2) {
                logger.error(`[Socket Sync] Failed to create customer ${customerId} even with unique bkcode: ${e2.message}`);
            }
        } else {
            logger.error(`[Socket Sync] Failed to ensure customer ${customerId}: ${e.message}`);
        }
    }
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
                    logPortalSync(socket.branchId, socket.branchCode, branch.name, 'CONNECT', 'SUCCESS', `${socket.branchCode} (${branch.name}) connected via WebSocket`);
                }
            }).catch((e) => { logger.error({ err: e.message }, 'Failed to update branch status on connect'); });

            socket.join(`branch_${socket.branchId}`);
            syncQueueService.pushPendingToBranch(socket.branchId);
        }

        if (socket.isAdmin) {
            socket.join('admin');
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

        socket.on('branch_identify', async (data) => {
            const { branchCode } = data;
            logger.info(`[Socket] Branch identity confirmed: ${branchCode}`);
            const branch = await prisma.branch.findFirst({ where: { code: branchCode } });
            if (branch && socket.isBranch) {
                socket.branchId = branch.id;
                socket.branchCode = branch.code;
                socket.branchName = branch.name;
                await prisma.branch.update({
                    where: { id: branch.id },
                    data: { status: 'ONLINE', lastSeen: new Date() }
                });
                socket.join(`branch_${branch.id}`);
                logger.info(`[Socket] Branch ${branchCode} associated via identity event`);
            }
        });

        socket.on('branch_ping', async (data) => {
            if (socket.branchId) {
                await prisma.branch.update({
                    where: { id: socket.branchId },
                    data: { lastSeen: new Date(), status: 'ONLINE' }
                }).catch(() => {});
            }
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
                            id: true, uid: true, username: true, email: true,
                            displayName: true, role: true, isActive: true,
                            branchId: true, createdAt: true
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

                if (!entities || entities.includes('syncPolicies')) {
                    const defaults = [
                        { entityType: 'payments', syncLevel: 'FULL', enabled: true },
                        { entityType: 'sales', syncLevel: 'FULL', enabled: true },
                        { entityType: 'customers', syncLevel: 'COUNT_ONLY', enabled: true },
                        { entityType: 'requests', syncLevel: 'FULL', enabled: true },
                        { entityType: 'stockMovements', syncLevel: 'SUMMARY', enabled: true },
                        { entityType: 'installments', syncLevel: 'FULL', enabled: true },
                        { entityType: 'simMovements', syncLevel: 'SUMMARY', enabled: true },
                        { entityType: 'posMachines', syncLevel: 'COUNT_ONLY', enabled: true },
                        { entityType: 'simCards', syncLevel: 'FULL', enabled: true },
                        { entityType: 'warehouseMachines', syncLevel: 'FULL', enabled: true },
                        { entityType: 'warehouseSims', syncLevel: 'FULL', enabled: true }
                    ];

                    const dbPolicies = await prisma.syncPolicy.findMany();
                    const policyMap = {};
                    dbPolicies.forEach(p => { policyMap[p.entityType] = p; });

                    result.syncPolicies = defaults.map(def => ({
                        ...def,
                        ...(policyMap[def.entityType] || { syncLevel: def.syncLevel, enabled: true })
                    }));
                }

                socket.emit('portal_sync_response', { success: true, data: result });
                logPortalSync(socket.branchId, socket.branchCode, socket.branchName, 'PULL', 'SUCCESS', `${socket.branchCode} pulled master data`);
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
                            action: cleanUser._deleted ? 'DELETED' : 'SYNCED',
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

                logPortalSync(socket.branchId, socket.branchCode, socket.branchName, 'PUSH', 'SUCCESS', `Full push: ${users?.length || 0} users, ${machineParams?.length || 0} params`);
                logger.info(`[Sync] Full Push completed for branch ${socket.branchCode}`);
            } catch (error) {
                logger.error('[Sync] Full Push processing failed:', error.message);
                logPortalSync(socket.branchId, socket.branchCode, socket.branchName, 'PUSH', 'FAILED', `Full push failed: ${error.message}`);
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
                    
                    await updateBranchEntitySync(socket.branchId, 'inventory', inventory.length, 'SUCCESS');
                    logPortalSync(socket.branchId, socket.branchCode, socket.branchName, 'PUSH', 'SUCCESS', `Updated inventory: ${inventory.length} parts`, inventory.length);
                }
            } catch (error) {
                logger.error('[Sync] Error processing inventory push:', error.message);
                await updateBranchEntitySync(socket.branchId, 'inventory', 0, 'FAILED', error.message);
                logPortalSync(socket.branchId, socket.branchCode, socket.branchName, 'PUSH', 'FAILED', `Inventory push failed: ${error.message}`);
            }
        });

        socket.on('branch_data_push', async (data) => {
            const { entities, branchCode } = data;
            if (!socket.isBranch || !socket.branchId) return;

            logger.info(`[Sync] Received data push (${Object.keys(entities || {}).length} types) from branch ${branchCode || socket.branchCode}`);

            try {
                const results = {};
                let totalSynced = 0;

                if (entities.machines && Array.isArray(entities.machines)) {
                    const ops = entities.machines.map(m => {
                        const safe = pickFields(m, ALLOWED_WAREHOUSE_MACHINE_FIELDS);
                        return prisma.warehouseMachine.upsert({
                            where: { serialNumber: m.serialNumber },
                            update: { ...safe, branchId: socket.branchId, updatedAt: new Date() },
                            create: { ...safe, branchId: socket.branchId }
                        });
                    });
                    await prisma.$transaction(ops);
                    results.warehouseMachines = entities.machines.length;
                    totalSynced += entities.machines.length;
                }

                if (entities.sales && Array.isArray(entities.sales)) {
                    const ops = entities.sales.map(s => {
                        const safe = pickFields(s, ALLOWED_MACHINE_SALE_FIELDS);
                        return prisma.machineSale.upsert({
                            where: { id: s.id },
                            update: { ...safe, branchId: socket.branchId },
                            create: { ...safe, branchId: socket.branchId }
                        });
                    });
                    await prisma.$transaction(ops);
                    results.machineSales = entities.sales.length;
                    totalSynced += entities.sales.length;
                }

                if (entities.sims && Array.isArray(entities.sims)) {
                    const ops = entities.sims.map(sim => {
                        const safe = pickFields(sim, ALLOWED_WAREHOUSE_SIM_FIELDS);
                        return prisma.warehouseSim.upsert({
                            where: { serialNumber: sim.serialNumber },
                            update: { ...safe, branchId: socket.branchId, updatedAt: new Date() },
                            create: { ...safe, branchId: socket.branchId }
                        });
                    });
                    await prisma.$transaction(ops);
                    results.warehouseSims = entities.sims.length;
                    totalSynced += entities.sims.length;
                }

                if (entities.movements && Array.isArray(entities.movements)) {
                    const existingPartIds = new Set(
                        (await prisma.masterSparePart.findMany({ select: { id: true } })).map(p => p.id)
                    );
                    // Also get valid request IDs for FK validation
                    const existingRequestIds = new Set(
                        (await prisma.maintenanceRequest.findMany({ select: { id: true } })).map(r => r.id)
                    );
                    const validMovements = entities.movements
                        .filter(mov => !mov.partId || existingPartIds.has(mov.partId))
                        .filter(mov => !mov.requestId || existingRequestIds.has(mov.requestId));
                    const ops = validMovements.map(mov => {
                        const safe = pickFields(mov, ALLOWED_STOCK_MOVEMENT_FIELDS);
                        // Clear invalid requestId to avoid FK error
                        if (mov.requestId && !existingRequestIds.has(mov.requestId)) {
                            safe.requestId = null;
                        }
                        return prisma.stockMovement.upsert({
                            where: { id: mov.id },
                            update: { ...safe, branchId: socket.branchId },
                            create: { ...safe, branchId: socket.branchId }
                        });
                    });
                    if (ops.length > 0) await prisma.$transaction(ops);
                    results.stockMovements = entities.movements.length;
                    totalSynced += entities.movements.length;
                }

                if (entities.payments && Array.isArray(entities.payments)) {
                    for (const pay of entities.payments) {
                        if (pay.customerId) await ensureCustomerExists(pay.customerId, pay.customerName, pay.customerBkcode, socket.branchId);
                    }
                    const ops = entities.payments.map(pay => {
                        const safe = pickFields(pay, ALLOWED_PAYMENT_FIELDS);
                        return prisma.payment.upsert({
                            where: { id: pay.id },
                            update: { ...safe, branchId: socket.branchId },
                            create: { ...safe, branchId: socket.branchId }
                        });
                    });
                    await prisma.$transaction(ops);
                    results.payments = entities.payments.length;
                    totalSynced += entities.payments.length;
                }

                for (const [entityType, count] of Object.entries(results)) {
                    await updateBranchEntitySync(socket.branchId, entityType, count, 'SUCCESS');
                }

                logPortalSync(socket.branchId, socket.branchCode, socket.branchName, 'PUSH', 'SUCCESS', `Data push: ${totalSynced} items`, totalSynced);
                socket.emit('sync_ack', { status: 'SUCCESS', totalSynced, results });

                io.to('admin').emit('data_updated', {
                    branchId: socket.branchId,
                    branchCode: socket.branchCode || socket.branchCode,
                    branchName: socket.branchName || socket.branchCode,
                    type: 'DATA_PUSH',
                    entities: Object.keys(results),
                    count: totalSynced,
                    timestamp: new Date()
                });
            } catch (error) {
                logger.error('[Sync] Error processing data push:', error.message);
                logPortalSync(socket.branchId, socket.branchCode, socket.branchName, 'PUSH', 'FAILED', `Data push failed: ${error.message}`);
                socket.emit('sync_ack', { status: 'FAILED', error: error.message });
            }
        });

        socket.on('branch_report_push', async (data) => {
            const { branchCode, entities, timestamp } = data;
            if (!socket.isBranch || !socket.branchId) return;

            logger.info(`[Sync] Received REPORT push (${Object.keys(entities || {}).length} types) from branch ${branchCode || socket.branchCode}`);

            try {
                let totalSynced = 0;
                const results = {};
                const errors = {};

                // FULL REPLACE: Delete all existing data for this branch first, then insert fresh
                // Order matters due to foreign key constraints
                logger.info(`[Sync] Full replace: deleting existing data for branch ${socket.branchId}`);
                const deleteCounts = await prisma.$transaction(async (tx) => {
                    // Delete in FK-safe order (children before parents)
                    await tx.installment.deleteMany({ where: { sale: { branchId: socket.branchId } } });
                    await tx.payment.deleteMany({ where: { branchId: socket.branchId } });
                    await tx.stockMovement.deleteMany({ where: { branchId: socket.branchId } });
                    await tx.usedPartLog.deleteMany({ where: { branchId: socket.branchId } });
                    await tx.machineSale.deleteMany({ where: { branchId: socket.branchId } });
                    await tx.maintenanceRequest.deleteMany({ where: { branchId: socket.branchId } });
                    await tx.posMachine.deleteMany({ where: { branchId: socket.branchId } });
                    await tx.simMovementLog.deleteMany({ where: { branchId: socket.branchId } });
                    await tx.simCard.deleteMany({ where: { branchId: socket.branchId } });
                    await tx.warehouseMachine.deleteMany({ where: { branchId: socket.branchId } });
                    await tx.warehouseSim.deleteMany({ where: { branchId: socket.branchId } });
                    await tx.machineMovementLog.deleteMany({ where: { branchId: socket.branchId } });
                    await tx.branchSparePart.deleteMany({ where: { branchId: socket.branchId } });

                    // Count remaining after delete for logging
                    const counts = {
                        sales: await tx.machineSale.count({ where: { branchId: socket.branchId } }),
                        installments: await tx.installment.count({ where: { sale: { branchId: socket.branchId } } }),
                        payments: await tx.payment.count({ where: { branchId: socket.branchId } }),
                        stockMovements: await tx.stockMovement.count({ where: { branchId: socket.branchId } }),
                        usedPartLogs: await tx.usedPartLog.count({ where: { branchId: socket.branchId } }),
                        maintenanceRequests: await tx.maintenanceRequest.count({ where: { branchId: socket.branchId } }),
                    };
                    return counts;
                });
                logger.info(`[Sync] Full replace: deleted existing data for branch ${socket.branchId}`, deleteCounts);

                // Now insert fresh data from the branch

                // 1. Customers first (upsert since they may be referenced by other entities across branches)
                if (entities.customers && Array.isArray(entities.customers)) {
                    const validation = validateEntityArray(entities.customers, customerSchema, 'customers');
                    if (validation.errors.length > 0) {
                        errors.customers = validation.errors;
                    }
                    if (validation.results.length > 0) {
                        for (const r of validation.results) {
                            await prisma.customer.upsert({
                                where: { id: r.id },
                                update: { ...r, branchId: socket.branchId },
                                create: { ...r, branchId: socket.branchId }
                            });
                        }
                    }
                    results.customers = validation.results.length;
                    totalSynced += validation.results.length;
                }

                // 2. MasterSparePart (global, upsert only)
                if (entities.stockMovements && Array.isArray(entities.stockMovements)) {
                    for (const m of entities.stockMovements) {
                        if (m.partId && (m.partNumber || m.partName)) {
                            await prisma.masterSparePart.upsert({
                                where: { id: m.partId },
                                update: { name: m.partName || undefined, partNumber: m.partNumber || undefined },
                                create: { id: m.partId, name: m.partName || 'Unknown', partNumber: m.partNumber || m.partId }
                            });
                        }
                    }
                }
                if (entities.inventory && Array.isArray(entities.inventory)) {
                    for (const inv of entities.inventory) {
                        if (inv.partId && (inv.partNumber || inv.partName)) {
                            await prisma.masterSparePart.upsert({
                                where: { id: inv.partId },
                                update: { name: inv.partName || undefined, partNumber: inv.partNumber || undefined },
                                create: { id: inv.partId, name: inv.partName || 'Unknown', partNumber: inv.partNumber || inv.partId }
                            });
                        }
                    }
                }

                // 3. PosMachines (referenced by maintenanceRequests)
                if (entities.posMachines && Array.isArray(entities.posMachines)) {
                    const validation = validateEntityArray(entities.posMachines, posMachineSchema, 'posMachines');
                    if (validation.errors.length > 0) {
                        errors.posMachines = validation.errors;
                    }
                    if (validation.results.length > 0) {
                        for (const r of validation.results) {
                            if (r.customerId) await ensureCustomerExists(r.customerId, r.customerName, r.customerBkcode, socket.branchId);
                            await prisma.posMachine.upsert({
                                where: { id: r.id },
                                update: { ...r, branchId: socket.branchId },
                                create: { ...r, branchId: socket.branchId }
                            });
                        }
                    }
                    results.posMachines = validation.results.length;
                    totalSynced += validation.results.length;
                }

                // 4. MaintenanceRequests (referenced by payments, stockMovements, usedPartLogs)
                if (entities.maintenanceRequests && Array.isArray(entities.maintenanceRequests)) {
                    try {
                        const validation = validateEntityArray(entities.maintenanceRequests, maintenanceRequestSchema, 'maintenanceRequests');
                        if (validation.results.length > 0) {
                            for (const r of validation.results) {
                                if (r.customerId) await ensureCustomerExists(r.customerId, r.customerName, r.customerBkcode, socket.branchId);
                                await prisma.maintenanceRequest.upsert({
                                    where: { id: r.id },
                                    update: { ...r, branchId: socket.branchId },
                                    create: { ...r, branchId: socket.branchId }
                                });
                            }
                        }
                        results.maintenanceRequests = validation.results.length;
                        totalSynced += validation.results.length;
                    } catch (e) { logger.error({ err: e.message }, '[Sync] Blocked on maintenanceRequests'); }
                }

                // 5. MachineSales (referenced by installments)
                if (entities.machineSales && Array.isArray(entities.machineSales)) {
                    try {
                        const validation = validateEntityArray(entities.machineSales, machineSaleSchema, 'machineSales');
                        if (validation.results.length > 0) {
                            for (const r of validation.results) {
                                if (r.customerId) await ensureCustomerExists(r.customerId, r.customerName, r.customerBkcode, socket.branchId);
                                await prisma.machineSale.upsert({
                                    where: { id: r.id },
                                    update: { ...r, branchId: socket.branchId },
                                    create: { ...r, branchId: socket.branchId }
                                });
                            }
                        }
                        results.machineSales = validation.results.length;
                        totalSynced += validation.results.length;
                    } catch (e) { logger.error({ err: e.message }, '[Sync] machineSales failed'); }
                }

                // 6. Installments (depends on machineSales)
                if (entities.installments && Array.isArray(entities.installments)) {
                    try {
                        const validation = validateEntityArray(entities.installments, installmentSchema, 'installments');
                        if (validation.results.length > 0) {
                            for (const r of validation.results) {
                                await prisma.installment.upsert({
                                    where: { id: r.id },
                                    update: { ...r, branchId: socket.branchId },
                                    create: { ...r, branchId: socket.branchId }
                                });
                            }
                        }
                        results.installments = validation.results.length;
                        totalSynced += validation.results.length;
                    } catch (e) { logger.error({ err: e.message }, '[Sync] installments failed'); }
                }

                // 7. Payments (depends on customers, maintenanceRequests)
                if (entities.payments && Array.isArray(entities.payments)) {
                    try {
                        const validation = validateEntityArray(entities.payments, paymentItemSchema, 'payments');
                        if (validation.results.length > 0) {
                            for (const r of validation.results) {
                                if (r.customerId) await ensureCustomerExists(r.customerId, r.customerName, r.customerBkcode, socket.branchId);
                                await prisma.payment.upsert({
                                    where: { id: r.id },
                                    update: { ...r, branchId: socket.branchId },
                                    create: { ...r, branchId: socket.branchId }
                                });
                            }
                        }
                        results.payments = validation.results.length;
                        totalSynced += validation.results.length;
                    } catch (e) { logger.error({ err: e.message }, '[Sync] Blocked on payments'); }
                }

                // 8. StockMovements (depends on masterSparePart, maintenanceRequests)
                if (entities.stockMovements && Array.isArray(entities.stockMovements)) {
                    try {
                        const validation = validateEntityArray(entities.stockMovements, stockMovementSchema, 'stockMovements');
                        if (validation.results.length > 0) {
                            for (const r of validation.results) {
                                if (r.customerId) await ensureCustomerExists(r.customerId, r.customerName, r.customerBkcode, socket.branchId);
                                await prisma.stockMovement.upsert({
                                    where: { id: r.id },
                                    update: { ...r, branchId: socket.branchId },
                                    create: { ...r, branchId: socket.branchId }
                                });
                            }
                        }
                        results.stockMovements = validation.results.length;
                        totalSynced += validation.results.length;
                    } catch (e) { logger.error({ err: e.message }, '[Sync] stockMovements failed'); }
                }

                // 9. UsedPartLogs (depends on maintenanceRequests, customers)
                if (entities.usedPartLogs && Array.isArray(entities.usedPartLogs)) {
                    const validation = validateEntityArray(entities.usedPartLogs, usedPartLogSchema, 'usedPartLogs');
                    if (validation.results.length > 0) {
                        for (const r of validation.results) {
                            if (r.customerId) await ensureCustomerExists(r.customerId, r.customerName, r.customerBkcode, socket.branchId);
                            await prisma.usedPartLog.upsert({
                                where: { id: r.id },
                                update: { ...r, branchId: socket.branchId },
                                create: { ...r, branchId: socket.branchId }
                            });
                        }
                    }
                    results.usedPartLogs = validation.results.length;
                    totalSynced += validation.results.length;
                }

                // 10. SimCards (depends on customers)
                if (entities.simCards && Array.isArray(entities.simCards)) {
                    const validation = validateEntityArray(entities.simCards, simCardSchema, 'simCards');
                    if (validation.errors.length > 0) {
                        errors.simCards = validation.errors;
                    }
                    if (validation.results.length > 0) {
                        for (const r of validation.results) {
                            await prisma.simCard.upsert({
                                where: { id: r.id },
                                update: { ...r, branchId: socket.branchId },
                                create: { ...r, branchId: socket.branchId }
                            });
                        }
                    }
                    results.simCards = validation.results.length;
                    totalSynced += validation.results.length;
                }

                // 11. SimMovementLogs (independent)
                if (entities.simMovements && Array.isArray(entities.simMovements)) {
                    const validation = validateEntityArray(entities.simMovements, simMovementSchema, 'simMovements');
                    if (validation.errors.length > 0) {
                        errors.simMovements = validation.errors;
                    }
                    if (validation.results.length > 0) {
                        for (const r of validation.results) {
                            await prisma.simMovementLog.upsert({
                                where: { id: r.id },
                                update: { ...r, branchId: socket.branchId },
                                create: { ...r, branchId: socket.branchId }
                            });
                        }
                    }
                    results.simMovements = validation.results.length;
                    totalSynced += validation.results.length;
                }

                // 12. WarehouseMachines (independent, keyed by serialNumber)
                if (entities.warehouseMachines && Array.isArray(entities.warehouseMachines)) {
                    const validation = validateEntityArray(entities.warehouseMachines, warehouseMachineSchema, 'warehouseMachines');
                    if (validation.errors.length > 0) {
                        errors.warehouseMachines = validation.errors;
                    }
                    if (validation.results.length > 0) {
                        for (const r of validation.results) {
                            await prisma.warehouseMachine.upsert({
                                where: { serialNumber: r.serialNumber },
                                update: { ...r, branchId: socket.branchId, updatedAt: new Date() },
                                create: { ...r, branchId: socket.branchId }
                            });
                        }
                    }
                    results.warehouseMachines = validation.results.length;
                    totalSynced += validation.results.length;
                }

                // 13. WarehouseSims (independent, keyed by serialNumber)
                if (entities.warehouseSims && Array.isArray(entities.warehouseSims)) {
                    const validation = validateEntityArray(entities.warehouseSims, warehouseSimSchema, 'warehouseSims');
                    if (validation.errors.length > 0) {
                        errors.warehouseSims = validation.errors;
                    }
                    if (validation.results.length > 0) {
                        for (const r of validation.results) {
                            await prisma.warehouseSim.upsert({
                                where: { serialNumber: r.serialNumber },
                                update: { ...r, branchId: socket.branchId, updatedAt: new Date() },
                                create: { ...r, branchId: socket.branchId }
                            });
                        }
                    }
                    results.warehouseSims = validation.results.length;
                    totalSynced += validation.results.length;
                }

                // 14. Inventory (branch spare parts, keyed by composite)
                if (entities.inventory && Array.isArray(entities.inventory)) {
                    const validation = validateEntityArray(entities.inventory, inventorySchema, 'inventory');
                    if (validation.errors.length > 0) {
                        errors.inventory = validation.errors;
                    }
                    if (validation.results.length > 0) {
                        const ops = validation.results.map(r => prisma.branchSparePart.upsert({
                            where: { branchId_partId: { branchId: socket.branchId, partId: r.partId } },
                            update: { quantity: r.quantity, lastUpdated: new Date() },
                            create: { branchId: socket.branchId, partId: r.partId, quantity: r.quantity }
                        }));
                        await prisma.$transaction(ops);
                    }
                    results.inventory = validation.results.length;
                    totalSynced += validation.results.length;
                }

                for (const [entityType, count] of Object.entries(results)) {
                    await updateBranchEntitySync(socket.branchId, entityType, count, Object.keys(errors).includes(entityType) ? 'PARTIAL' : 'SUCCESS');
                }

                const hasErrors = Object.keys(errors).length > 0;
                const status = hasErrors ? 'PARTIAL' : 'SUCCESS';
                const msg = hasErrors
                    ? `Report push: ${totalSynced} items (${Object.keys(errors).length} entity types with validation errors)`
                    : `Report push: ${totalSynced} items synced successfully`;

                logPortalSync(socket.branchId, socket.branchCode, socket.branchName, 'PUSH', status, msg, totalSynced);
                logger.info(`[Sync] Report push completed for ${branchCode}: ${totalSynced} items, status: ${status}`);

                socket.emit('sync_ack', {
                    status,
                    totalSynced,
                    results,
                    errors: Object.keys(errors).length > 0 ? Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, v.length])) : null
                });

                if (status !== 'FAILED') {
                    io.to('admin').emit('data_updated', {
                        branchId: socket.branchId,
                        branchCode: socket.branchCode || branchCode,
                        branchName: socket.branchName || branchCode,
                        type: 'REPORT_PUSH',
                        entities: Object.keys(results),
                        count: totalSynced,
                        timestamp: new Date()
                    });
                }
            } catch (error) {
                logger.error({ err: error.message, stack: error.stack }, '[Sync] Error processing report push');
                logPortalSync(socket.branchId, socket.branchCode, socket.branchName, 'PUSH', 'FAILED', `Report push failed: ${error.message}`);
                socket.emit('sync_ack', { status: 'FAILED', error: error.message });
            }
        });

        socket.on('branch_summary_push', async (data) => {
            const { branchCode, summary, timestamp } = data;
            if (!socket.isBranch || !socket.branchId) return;

            logger.info(`[Sync] Received SUMMARY push from branch ${branchCode || socket.branchCode}`);

            try {
                const ops = Object.entries(summary).map(([entityType, info]) => {
                    const count = typeof info === 'object' ? (info.count || 0) : info;
                    const totalAmount = typeof info === 'object' ? (info.totalAmount || 0) : 0;
                    return prisma.branchSummary.upsert({
                        where: { branchId_entityType: { branchId: socket.branchId, entityType } },
                        update: { recordCount: count, totalAmount, details: info, lastUpdatedAt: new Date() },
                        create: { branchId: socket.branchId, entityType, recordCount: count, totalAmount, details: info, lastUpdatedAt: new Date() }
                    });
                });

                if (ops.length > 0) {
                    await prisma.$transaction(ops);
                }

                await updateBranchEntitySync(socket.branchId, '_summary', Object.values(summary).length, 'SUCCESS');
                logPortalSync(socket.branchId, socket.branchCode, socket.branchName, 'PUSH', 'SUCCESS', `Summary push: ${ops.length} entity counts updated`);
                socket.emit('summary_ack', { status: 'SUCCESS', entities: ops.length });

                io.to('admin').emit('data_updated', {
                    branchId: socket.branchId,
                    branchCode: socket.branchCode || branchCode,
                    branchName: socket.branchName || branchCode,
                    type: 'SUMMARY_PUSH',
                    entities: Object.keys(summary),
                    timestamp: new Date()
                });
            } catch (error) {
                logger.error({ err: error.message, stack: error.stack }, '[Sync] Error processing summary push');
                logPortalSync(socket.branchId, socket.branchCode, socket.branchName, 'PUSH', 'FAILED', `Summary push failed: ${error.message}`);
                socket.emit('summary_ack', { status: 'FAILED', error: error.message });
            }
        });

        socket.on('monthly_closing_push', async (data) => {
            const { branchCode, month, sections, data: reportData, timestamp } = data;
            if (!socket.isBranch || !socket.branchId) return;

            logger.info(`[Sync] Received MONTHLY CLOSING push from branch ${branchCode || socket.branchCode} for month ${month}`);

            try {
                const existing = await prisma.monthlyClosingReport.findUnique({
                    where: { branchId_month: { branchId: socket.branchId, month } }
                });

                if (existing) {
                    await prisma.monthlyClosingReport.update({
                        where: { id: existing.id },
                        data: {
                            data: reportData,
                            sections: sections || 'all',
                            status: 'RECEIVED',
                            receivedAt: new Date(),
                            sentAt: timestamp ? new Date(timestamp) : new Date()
                        }
                    });
                } else {
                    await prisma.monthlyClosingReport.create({
                        data: {
                            branchId: socket.branchId,
                            branchCode: branchCode || socket.branchCode,
                            branchName: socket.branchName || branchCode || 'Unknown',
                            month,
                            data: reportData,
                            sections: sections || 'all',
                            status: 'RECEIVED',
                            sentAt: timestamp ? new Date(timestamp) : new Date(),
                            receivedAt: new Date()
                        }
                    });
                }

                await prisma.monthlyClosingLog.create({
                    data: {
                        branchId: socket.branchId,
                        branchCode: branchCode || socket.branchCode,
                        branchName: socket.branchName || branchCode || 'Unknown',
                        month,
                        direction: 'RECEIVED',
                        sections: sections || 'all',
                        status: 'SUCCESS',
                        recordCount: 1,
                        notes: `Monthly closing report received for ${month}`
                    }
                });

                const admins = await prisma.user.findMany({
                    where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] } },
                    select: { id: true }
                });

                for (const admin of admins) {
                    await prisma.notification.create({
                        data: {
                            userId: admin.id,
                            branchId: socket.branchId,
                            type: 'MONTHLY_CLOSING_RECEIVED',
                            title: 'تقرير تقفيلة شهرية',
                            message: `تم استلام تقرير التقفيلة الشهرية لشهر ${month} من فرع ${socket.branchName || branchCode}`,
                            data: JSON.stringify({ month, branchId: socket.branchId, branchCode: branchCode || socket.branchCode }),
                            isRead: false
                        }
                    });
                }

                io.to('admin').emit('report_received', {
                    type: 'MONTHLY_CLOSING',
                    branchId: socket.branchId,
                    branchCode: branchCode || socket.branchCode,
                    branchName: socket.branchName || branchCode,
                    month,
                    sections: sections || 'all',
                    timestamp: new Date()
                });

                logPortalSync(socket.branchId, socket.branchCode, socket.branchName, 'PUSH', 'SUCCESS', `Monthly closing report received for ${month}`);
                socket.emit('monthly_closing_ack', { status: 'SUCCESS', month, sections });
            } catch (err) {
                logger.error({ err: err.message, stack: err.stack }, '[Sync] Error processing monthly closing push');
                logPortalSync(socket.branchId, socket.branchCode, socket.branchName, 'PUSH', 'FAILED', `Monthly closing push failed: ${err.message}`);
                socket.emit('monthly_closing_ack', { status: 'FAILED', error: err.message });
            }
        });

        socket.on('disconnect', async () => {
            logger.info(`[Socket] Branch Disconnected: ${socket.branchCode}`);
            if (socket.branchId && socket.isBranch) {
                logPortalSync(socket.branchId, socket.branchCode, socket.branchName, 'DISCONNECT', 'SUCCESS', `${socket.branchCode} (${socket.branchName}) disconnected`);
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
