require('dotenv').config();
require('express-async-errors');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const http = require('http');
const { Server } = require('socket.io');
const prisma = require('./db');
const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: process.env.FRONTEND_URL || true, methods: ['GET', 'POST'] }
});

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(morgan('dev'));

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV !== 'production' ? 1000 : 10,
    message: { error: 'Too many login attempts, please try again after 15 minutes' }
});

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV !== 'production' ? 2000 : 200,
    message: { error: 'Too many requests, please try again later' }
});

app.use('/api', apiLimiter);

const authRoutes = require('./src/routes/auth');
const branchRoutes = require('./src/routes/branches');
const parameterRoutes = require('./src/routes/parameters');
const posParameterRoutes = require('./src/routes/pos-parameters');
const sparePartsRoutes = require('./src/routes/spare-parts');
const dashboardRoutes = require('./src/routes/dashboard');
const userRoutes = require('./src/routes/users');
const customerRoutes = require('./src/routes/customers');
const warehouseRoutes = require('./src/routes/warehouse');
const reportRoutes = require('./src/routes/reports');
const syncRoutes = require('./src/routes/sync');
const syncQueueRoutes = require('./src/routes/syncQueue');
const permissionRoutes = require('./src/routes/permissions');
const adminStoreRoutes = require('./src/routes/admin-store');
const adminRoutes = require('./src/routes/admin');
const backupRoutes = require('./src/routes/backup');
const miscRoutes = require('./src/routes/misc');
const settingsRoutes = require('./src/routes/settings');
const mfaRoutes = require('./src/routes/mfa');
const bootstrapRoutes = require('./src/routes/bootstrap');
const branchSetupRoutes = require('./src/routes/branch-setup');
const githubRoutes = require('./src/routes/github');
const versionRoutes = require('./src/routes/versions');
const licenseRoutes = require('./src/routes/licenses');
const inventoryRoutes = require('./src/routes/inventory');
const stockMovementsRoutes = require('./src/routes/stockMovements');
const maintenanceRequestsRoutes = require('./src/routes/maintenanceRequests');
const paymentsRoutes = require('./src/routes/payments');
const salesRoutes = require('./src/routes/sales');
const simcardsRoutes = require('./src/routes/simcards');
const simcardsReportsRoutes = require('./src/routes/simcards-reports');

app.use('/api/auth', loginLimiter, authRoutes);
app.use('/api/branch-setup', branchSetupRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/parameters', parameterRoutes);
app.use('/api/pos-parameters', posParameterRoutes);
app.use('/api/spare-parts', sparePartsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/users', userRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/warehouse', warehouseRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/sync-queue', syncQueueRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/admin-store', adminStoreRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/mfa', mfaRoutes);
app.use('/api/bootstrap', bootstrapRoutes);
app.use('/api/github', githubRoutes);
app.use('/api/versions', versionRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/stock-movements', stockMovementsRoutes);
app.use('/api/maintenance-requests', maintenanceRequestsRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/simcards', simcardsRoutes);
app.use('/api/simcard-reports', simcardsReportsRoutes);
app.use('/api/licenses', licenseRoutes);
app.use('/api', miscRoutes);

app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'Central Admin Portal API is running' });
});

app.set('io', io);

require('./src/sockets/admin.socket')(io);

const syncQueueService = require('./src/services/syncQueue.service');
syncQueueService.init(io);

const path = require('path');
const frontendDist = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDist));
app.get('*', (req, res, next) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(frontendDist, 'index.html'));
    } else {
        next();
    }
});

const logger = require('./utils/logger');
app.use((err, req, res, next) => {
    logger.error({ err: err.message, stack: err.stack }, 'Unhandled error');
    res.status(err.status || 500).json({ error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message });
});

const PORT = process.env.PORT || 5005;

async function ensureAdminUser() {
    try {
        const bcrypt = require('bcryptjs');
        const crypto = require('crypto');
        
        const existing = await prisma.adminUser.findUnique({ where: { username: 'Admin@' } });
        if (!existing) {
            const tempPassword = crypto.randomBytes(8).toString('hex');
            const hashedPassword = await bcrypt.hash(tempPassword, 10);
            
            await prisma.adminUser.create({
                data: {
                    username: 'Admin@',
                    passwordHash: hashedPassword,
                    name: 'Super Admin',
                    role: 'SUPER_ADMIN'
                }
            });
            logger.info({ username: 'Admin@', tempPassword }, 'FIRST-TIME SETUP: Super Admin created. Please copy this temporary password and change it immediately. It will not be shown again.');
        } else {
            logger.info('Super Admin verified.');
        }
    } catch (error) {
        logger.warn({ err: error.message }, 'Admin user check failed — will retry on next startup');
    }
}

if (require.main === module) {
    ensureAdminUser().then(() => {
        server.listen(PORT, () => {
            logger.info(`--- Central Admin Portal running on port ${PORT} ---`);
        });
    });
}

module.exports = { app, server, io };
