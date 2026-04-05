const { z } = require('zod');

const requestSyncSchema = z.object({
    body: z.object({
        entities: z.array(z.string()).optional()
    })
});

const paymentItemSchema = z.object({
    id: z.string().min(1),
    customerId: z.string().optional().nullable(),
    customerName: z.string().optional().nullable(),
    requestId: z.string().optional().nullable(),
    amount: z.number().positive(),
    type: z.string().max(50).optional().nullable(),
    reason: z.string().max(500).optional().nullable(),
    paymentPlace: z.string().max(100).optional().nullable(),
    paymentMethod: z.string().max(50).optional().nullable(),
    receiptNumber: z.string().max(100).optional().nullable(),
    notes: z.string().max(1000).optional().nullable(),
    userId: z.string().optional().nullable(),
    userName: z.string().max(100).optional().nullable()
});

const maintenanceRequestSchema = z.object({
    id: z.string().min(1),
    customerId: z.string().optional().nullable(),
    posMachineId: z.string().optional().nullable(),
    customerName: z.string().max(200).optional().nullable(),
    customerBkcode: z.string().max(50).optional().nullable(),
    machineModel: z.string().max(100).optional().nullable(),
    machineManufacturer: z.string().max(100).optional().nullable(),
    serialNumber: z.string().max(100).optional().nullable(),
    status: z.string().max(50).optional().nullable(),
    technicianId: z.string().optional().nullable(),
    technician: z.string().max(100).optional().nullable(),
    type: z.string().max(50).optional().nullable(),
    description: z.string().max(2000).optional().nullable(),
    createdBy: z.string().max(100).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    complaint: z.string().max(2000).optional().nullable(),
    actionTaken: z.string().max(2000).optional().nullable(),
    closingUserId: z.string().optional().nullable(),
    closingUserName: z.string().max(100).optional().nullable(),
    closingTimestamp: z.string().datetime().optional().nullable(),
    usedParts: z.string().max(2000).optional().nullable(),
    receiptNumber: z.string().max(100).optional().nullable(),
    totalCost: z.number().optional().nullable()
});

const stockMovementSchema = z.object({
    id: z.string().min(1),
    partId: z.string().min(1),
    type: z.string().max(50),
    quantity: z.number().int(),
    reason: z.string().max(500).optional().nullable(),
    requestId: z.string().optional().nullable(),
    userId: z.string().optional().nullable(),
    performedBy: z.string().max(100).optional().nullable(),
    isPaid: z.boolean().optional().nullable(),
    receiptNumber: z.string().max(100).optional().nullable(),
    customerId: z.string().optional().nullable(),
    customerName: z.string().max(200).optional().nullable(),
    machineSerial: z.string().max(100).optional().nullable(),
    machineModel: z.string().max(100).optional().nullable(),
    paymentPlace: z.string().max(100).optional().nullable(),
    paidAmount: z.number().min(0).optional().nullable()
});

const machineSaleSchema = z.object({
    id: z.string().min(1),
    serialNumber: z.string().min(1),
    customerId: z.string().min(1),
    saleDate: z.string().datetime().optional().nullable(),
    type: z.string().max(50),
    totalPrice: z.number().positive(),
    paidAmount: z.number().min(0),
    status: z.string().max(50).optional().nullable(),
    notes: z.string().max(2000).optional().nullable()
});

const installmentSchema = z.object({
    id: z.string().min(1),
    saleId: z.string().min(1),
    dueDate: z.string().datetime(),
    amount: z.number().positive(),
    isPaid: z.boolean().optional().nullable(),
    paidAt: z.string().datetime().optional().nullable(),
    description: z.string().max(500).optional().nullable(),
    paidAmount: z.number().min(0).optional().nullable(),
    paymentPlace: z.string().max(100).optional().nullable(),
    receiptNumber: z.string().max(100).optional().nullable()
});

const simCardSchema = z.object({
    id: z.string().min(1),
    serialNumber: z.string().min(1),
    type: z.string().max(50).optional().nullable(),
    networkType: z.string().max(50).optional().nullable(),
    customerId: z.string().optional().nullable()
});

const simMovementSchema = z.object({
    id: z.string().min(1),
    simId: z.string().min(1),
    serialNumber: z.string().min(1),
    action: z.string().max(50),
    details: z.string().max(1000).optional().nullable(),
    performedBy: z.string().max(100).optional().nullable()
});

const warehouseMachineSchema = z.object({
    id: z.string().min(1),
    serialNumber: z.string().min(1),
    model: z.string().max(100).optional().nullable(),
    manufacturer: z.string().max(100).optional().nullable(),
    status: z.string().max(50).optional().nullable(),
    resolution: z.string().max(100).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    complaint: z.string().max(2000).optional().nullable(),
    importDate: z.string().datetime().optional().nullable(),
    updatedAt: z.string().datetime().optional().nullable(),
    originalOwnerId: z.string().optional().nullable(),
    readyForPickup: z.boolean().optional().nullable(),
    requestId: z.string().optional().nullable(),
    customerId: z.string().optional().nullable(),
    customerName: z.string().max(200).optional().nullable(),
    customerBkcode: z.string().max(50).optional().nullable()
});

const warehouseSimSchema = z.object({
    id: z.string().min(1),
    serialNumber: z.string().min(1),
    type: z.string().max(50).optional().nullable(),
    networkType: z.string().max(50).optional().nullable(),
    status: z.string().max(50).optional().nullable(),
    notes: z.string().max(1000).optional().nullable(),
    importDate: z.string().datetime().optional().nullable(),
    updatedAt: z.string().datetime().optional().nullable()
});

const posMachineSchema = z.object({
    id: z.string().min(1),
    serialNumber: z.string().min(1),
    posId: z.string().max(100).optional().nullable(),
    model: z.string().max(100).optional().nullable(),
    manufacturer: z.string().max(100).optional().nullable(),
    customerId: z.string().optional().nullable()
});

const inventorySchema = z.object({
    partId: z.string().min(1),
    quantity: z.number().int().min(0),
    location: z.string().max(100).optional().nullable(),
    lastUpdated: z.string().datetime().optional().nullable()
});

const customerSchema = z.object({
    id: z.string().min(1),
    bkcode: z.string().min(1).max(50),
    client_name: z.string().min(1).max(200),
    supply_office: z.string().max(200).optional().nullable(),
    operating_date: z.string().datetime().optional().nullable(),
    address: z.string().max(500).optional().nullable(),
    contact_person: z.string().max(200).optional().nullable(),
    scanned_id_path: z.string().max(500).optional().nullable(),
    national_id: z.string().max(50).optional().nullable(),
    dept: z.string().max(100).optional().nullable(),
    telephone_1: z.string().max(50).optional().nullable(),
    telephone_2: z.string().max(50).optional().nullable(),
    has_gates: z.boolean().optional().nullable(),
    bk_type: z.string().max(50).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    papers_date: z.string().datetime().optional().nullable(),
    isSpecial: z.boolean().optional().nullable(),
    clienttype: z.string().max(50).optional().nullable(),
    status: z.string().max(50).optional().nullable()
});

function validateEntityArray(data, schema, entityName) {
    if (!Array.isArray(data)) return { valid: false, errors: [`${entityName} must be an array`] };
    const results = [];
    const errors = [];
    for (let i = 0; i < data.length; i++) {
        const parsed = schema.safeParse(data[i]);
        if (parsed.success) {
            results.push(parsed.data);
        } else {
            errors.push({ index: i, id: data[i]?.id || `item_${i}`, errors: parsed.error.issues.map(e => `${e.path.join('.')}: ${e.message}`) });
        }
    }
    return { valid: errors.length === 0, results, errors };
}

const pushSchema = z.object({
    body: z.object({
        payments: z.array(z.any()).optional(),
        maintenanceRequests: z.array(z.any()).optional(),
        users: z.array(z.any()).optional(),
        customers: z.array(z.any()).optional(),
        posMachines: z.array(z.any()).optional(),
        spareParts: z.array(z.any()).optional(),
        warehouseMachines: z.array(z.any()).optional(),
        simCards: z.array(z.any()).optional(),
        stockMovements: z.array(z.any()).optional(),
        machineSales: z.array(z.any()).optional(),
        simMovements: z.array(z.any()).optional(),
        warehouseSims: z.array(z.any()).optional(),
        inventory: z.array(z.any()).optional()
    })
});

module.exports = {
    requestSyncSchema,
    pushSchema,
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
    inventorySchema,
    customerSchema,
    validateEntityArray
};
