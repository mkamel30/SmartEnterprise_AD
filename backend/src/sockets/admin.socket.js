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
    validateEntityArray
} = require('../routes/sync.schema');

const ALLOWED_WAREHOUSE_MACHINE_FIELDS = ['serialNumber', 'model', 'manufacturer', 'status', 'resolution', 'notes', 'complaint', 'importDate', 'updatedAt', 'originalOwnerId', 'readyForPickup', 'requestId', 'customerId', 'customerName', 'customerBkcode'];
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

async function updateBranchEntitySync(branchId, entityType, recordCount, status, errorMessage = null) {
    try {
        await prisma.branchEntitySync.upsert({
            where: { branchId_entityType: { branchId, entityType } },
            update: { lastSyncedAt: new Date(), recordCount, status, errorMessage },
            create: { branchId, entityType, lastSyncedAt: new Date(), recordCount, status, errorMessage }
        });
    } catch (e) { logger.error({ err: e.message }, `Failed to update entity sync for ${entityType}`); }
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
                    const validMovements = entities.movements.filter(mov => !mov.partId || existingPartIds.has(mov.partId));
                    const ops = validMovements.map(mov => {
                        const safe = pickFields(mov, ALLOWED_STOCK_MOVEMENT_FIELDS);
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

                if (entities.maintenanceRequests && Array.isArray(entities.maintenanceRequests)) {
                    const validation = validateEntityArray(entities.maintenanceRequests, maintenanceRequestSchema, 'maintenanceRequests');
                    if (validation.errors.length > 0) {
                        errors.maintenanceRequests = validation.errors;
                        logger.warn(`[Sync] Validation errors in maintenanceRequests: ${validation.errors.length} records skipped`);
                    }
                    if (validation.results.length > 0) {
                        const ops = validation.results.map(r => prisma.maintenanceRequest.upsert({
                            where: { id: r.id },
                            update: { ...r, branchId: socket.branchId },
                            create: { ...r, branchId: socket.branchId }
                        }));
                        await prisma.$transaction(ops);
                    }
                    results.maintenanceRequests = validation.results.length;
                    totalSynced += validation.results.length;
                }

                if (entities.payments && Array.isArray(entities.payments)) {
                    const validation = validateEntityArray(entities.payments, paymentItemSchema, 'payments');
                    if (validation.errors.length > 0) {
                        errors.payments = validation.errors;
                        logger.warn(`[Sync] Validation errors in payments: ${validation.errors.length} records skipped`);
                    }
                    if (validation.results.length > 0) {
                        const ops = validation.results.map(r => prisma.payment.upsert({
                            where: { id: r.id },
                            update: { ...r, branchId: socket.branchId },
                            create: { ...r, branchId: socket.branchId }
                        }));
                        await prisma.$transaction(ops);
                    }
                    results.payments = validation.results.length;
                    totalSynced += validation.results.length;
                }

                if (entities.stockMovements && Array.isArray(entities.stockMovements)) {
                    const existingPartIds = new Set(
                        (await prisma.masterSparePart.findMany({ select: { id: true } })).map(p => p.id)
                    );
                    const validMovements = entities.stockMovements.filter(m => !m.partId || existingPartIds.has(m.partId));
                    const validation = validateEntityArray(validMovements, stockMovementSchema, 'stockMovements');
                    if (validation.errors.length > 0) {
                        errors.stockMovements = validation.errors;
                    }
                    if (validation.results.length > 0) {
                        const ops = validation.results.map(r => prisma.stockMovement.upsert({
                            where: { id: r.id },
                            update: { ...r, branchId: socket.branchId },
                            create: { ...r, branchId: socket.branchId }
                        }));
                        await prisma.$transaction(ops);
                    }
                    results.stockMovements = validation.results.length;
                    totalSynced += validation.results.length;
                }

                if (entities.machineSales && Array.isArray(entities.machineSales)) {
                    const validation = validateEntityArray(entities.machineSales, machineSaleSchema, 'machineSales');
                    if (validation.errors.length > 0) {
                        errors.machineSales = validation.errors;
                    }
                    if (validation.results.length > 0) {
                        const ops = validation.results.map(r => prisma.machineSale.upsert({
                            where: { id: r.id },
                            update: { ...r, branchId: socket.branchId },
                            create: { ...r, branchId: socket.branchId }
                        }));
                        await prisma.$transaction(ops);
                    }
                    results.machineSales = validation.results.length;
                    totalSynced += validation.results.length;
                }

                if (entities.installments && Array.isArray(entities.installments)) {
                    const validation = validateEntityArray(entities.installments, installmentSchema, 'installments');
                    if (validation.errors.length > 0) {
                        errors.installments = validation.errors;
                    }
                    if (validation.results.length > 0) {
                        const ops = validation.results.map(r => prisma.installment.upsert({
                            where: { id: r.id },
                            update: { ...r, branchId: socket.branchId },
                            create: { ...r, branchId: socket.branchId }
                        }));
                        await prisma.$transaction(ops);
                    }
                    results.installments = validation.results.length;
                    totalSynced += validation.results.length;
                }

                if (entities.simCards && Array.isArray(entities.simCards)) {
                    const validation = validateEntityArray(entities.simCards, simCardSchema, 'simCards');
                    if (validation.errors.length > 0) {
                        errors.simCards = validation.errors;
                    }
                    if (validation.results.length > 0) {
                        const ops = validation.results.map(r => prisma.simCard.upsert({
                            where: { id: r.id },
                            update: { ...r, branchId: socket.branchId },
                            create: { ...r, branchId: socket.branchId }
                        }));
                        await prisma.$transaction(ops);
                    }
                    results.simCards = validation.results.length;
                    totalSynced += validation.results.length;
                }

                if (entities.simMovements && Array.isArray(entities.simMovements)) {
                    const validation = validateEntityArray(entities.simMovements, simMovementSchema, 'simMovements');
                    if (validation.errors.length > 0) {
                        errors.simMovements = validation.errors;
                    }
                    if (validation.results.length > 0) {
                        const ops = validation.results.map(r => prisma.simMovementLog.upsert({
                            where: { id: r.id },
                            update: { ...r, branchId: socket.branchId },
                            create: { ...r, branchId: socket.branchId }
                        }));
                        await prisma.$transaction(ops);
                    }
                    results.simMovements = validation.results.length;
                    totalSynced += validation.results.length;
                }

                if (entities.warehouseMachines && Array.isArray(entities.warehouseMachines)) {
                    const validation = validateEntityArray(entities.warehouseMachines, warehouseMachineSchema, 'warehouseMachines');
                    if (validation.errors.length > 0) {
                        errors.warehouseMachines = validation.errors;
                    }
                    if (validation.results.length > 0) {
                        const ops = validation.results.map(r => prisma.warehouseMachine.upsert({
                            where: { serialNumber: r.serialNumber },
                            update: { ...r, branchId: socket.branchId, updatedAt: new Date() },
                            create: { ...r, branchId: socket.branchId }
                        }));
                        await prisma.$transaction(ops);
                    }
                    results.warehouseMachines = validation.results.length;
                    totalSynced += validation.results.length;
                }

                if (entities.warehouseSims && Array.isArray(entities.warehouseSims)) {
                    const validation = validateEntityArray(entities.warehouseSims, warehouseSimSchema, 'warehouseSims');
                    if (validation.errors.length > 0) {
                        errors.warehouseSims = validation.errors;
                    }
                    if (validation.results.length > 0) {
                        const ops = validation.results.map(r => prisma.warehouseSim.upsert({
                            where: { serialNumber: r.serialNumber },
                            update: { ...r, branchId: socket.branchId, updatedAt: new Date() },
                            create: { ...r, branchId: socket.branchId }
                        }));
                        await prisma.$transaction(ops);
                    }
                    results.warehouseSims = validation.results.length;
                    totalSynced += validation.results.length;
                }

                if (entities.posMachines && Array.isArray(entities.posMachines)) {
                    const validation = validateEntityArray(entities.posMachines, posMachineSchema, 'posMachines');
                    if (validation.errors.length > 0) {
                        errors.posMachines = validation.errors;
                    }
                    if (validation.results.length > 0) {
                        const ops = validation.results.map(r => prisma.posMachine.upsert({
                            where: { id: r.id },
                            update: { ...r, branchId: socket.branchId },
                            create: { ...r, branchId: socket.branchId }
                        }));
                        await prisma.$transaction(ops);
                    }
                    results.posMachines = validation.results.length;
                    totalSynced += validation.results.length;
                }

                if (entities.customers && Array.isArray(entities.customers)) {
                    const validation = validateEntityArray(entities.customers, customerSchema, 'customers');
                    if (validation.errors.length > 0) {
                        errors.customers = validation.errors;
                    }
                    if (validation.results.length > 0) {
                        const ops = validation.results.map(r => prisma.customer.upsert({
                            where: { id: r.id },
                            update: { ...r, branchId: socket.branchId },
                            create: { ...r, branchId: socket.branchId }
                        }));
                        await prisma.$transaction(ops);
                    }
                    results.customers = validation.results.length;
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
            } catch (error) {
                logger.error('[Sync] Error processing report push:', error.message);
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
                        update: { recordCount: count, totalAmount, lastUpdatedAt: new Date() },
                        create: { branchId: socket.branchId, entityType, recordCount: count, totalAmount, lastUpdatedAt: new Date() }
                    });
                });

                if (ops.length > 0) {
                    await prisma.$transaction(ops);
                }

                await updateBranchEntitySync(socket.branchId, '_summary', Object.values(summary).length, 'SUCCESS');
                logPortalSync(socket.branchId, socket.branchCode, socket.branchName, 'PUSH', 'SUCCESS', `Summary push: ${ops.length} entity counts updated`);
                socket.emit('summary_ack', { status: 'SUCCESS', entities: ops.length });
            } catch (error) {
                logger.error('[Sync] Error processing summary push:', error.message);
                logPortalSync(socket.branchId, socket.branchCode, socket.branchName, 'PUSH', 'FAILED', `Summary push failed: ${error.message}`);
                socket.emit('summary_ack', { status: 'FAILED', error: error.message });
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
