const { z } = require('zod');

const requestSyncSchema = z.object({
    body: z.object({
        entities: z.array(z.string()).optional()
    })
});

const pushSchema = z.object({
    body: z.object({
        payments: z.array(z.any()).optional(),
        maintenanceRequests: z.array(z.any()).optional(),
        users: z.array(z.any()).optional(),
        customers: z.array(z.any()).optional(),
        posMachines: z.array(z.any()).optional()
    })
});

module.exports = {
    requestSyncSchema,
    pushSchema
};
