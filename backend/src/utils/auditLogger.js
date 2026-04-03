const prisma = require('../db');
const logger = require('../../utils/logger');

/**
 * Log an administrative action to the AuditLog table
 */
async function logAuditAction({ userId, userName, entityType, entityId, action, details, req }) {
    try {
        await prisma.auditLog.create({
            data: {
                userId,
                userName,
                entityType,
                entityId: entityId ? String(entityId) : null,
                action,
                details: typeof details === 'object' ? JSON.stringify(details) : details,
                ipAddress: req?.ip || req?.socket?.remoteAddress,
                userAgent: req?.headers['user-agent']
            }
        });
    } catch (error) {
        logger.error({ err: error.message }, 'Audit logging failed');
    }
}

module.exports = { logAuditAction };
