require('dotenv').config();
require('express-async-errors');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');
const { Server } = require('socket.io');
const prisma = require('./db');
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(morgan('dev'));

// Routes
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

app.use('/api/auth', authRoutes);
app.use('/api/licenses', licenseRoutes);
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
app.use('/api', miscRoutes);

// Basic Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'Central Admin Portal API is running' });
});

// Setup Socket.io Event Handlers
require('./src/sockets/admin.socket')(io);

// Initialize SyncQueue Service
const syncQueueService = require('./src/services/syncQueue.service');
syncQueueService.init(io);

// Serve React frontend static files
const path = require('path');
const frontendDist = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDist));
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(frontendDist, 'index.html'));
    }
});

const logger = require('./utils/logger');
const PORT = process.env.PORT || 5005;

async function ensureAdminUser() {
    try {
        const bcrypt = require('bcryptjs');
        const prisma = require('./src/db');
        const adminPassword = 'Mk@351762';
        const hashedPassword = await bcrypt.hash(adminPassword, 10);

        const existing = await prisma.adminUser.findUnique({ where: { username: 'Admin@' } });
        if (!existing) {
            await prisma.adminUser.create({
                data: {
                    username: 'Admin@',
                    passwordHash: hashedPassword,
                    name: 'Super Admin',
                    role: 'SUPER_ADMIN'
                }
            });
            logger.info('Super Admin created: Admin@ / Mk@351762');
        } else {
            logger.info('Super Admin verified: Admin@ / Mk@351762');
        }
        await prisma.$disconnect();
    } catch (error) {
        logger.warn({ err: error }, 'Admin user check failed — will retry on next startup');
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
