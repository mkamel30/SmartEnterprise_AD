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

app.use('/api/auth', authRoutes);
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

// Basic Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'Central Admin Portal API is running' });
});

// VERY DANGEROUS: Emergency Reset Route (Only for setup phase)
app.post('/api/admin/reset-database', async (req, res) => {
    const { secret } = req.body;
    if (secret !== 'master_reset_2026') return res.status(403).json({ error: 'Unauthorized' });

    try {
        console.log('--- CRITICAL: DATA RESET INITIATED ---');
        // Order matters due to foreign keys
        await prisma.syncLog.deleteMany({});
        await prisma.syncQueue.deleteMany({});
        await prisma.payment.deleteMany({});
        await prisma.machineMovementLog.deleteMany({});
        await prisma.maintenanceRequest.deleteMany({});
        await prisma.posMachine.deleteMany({});
        await prisma.systemLog.deleteMany({});
        await prisma.machineParameter.deleteMany({});
        await prisma.sparePart.deleteMany({});
        await prisma.customer.deleteMany({});
        await prisma.user.deleteMany({ where: { role: { not: 'SUPER_ADMIN' } } });
        
        res.json({ status: 'SUCCESS', message: 'Database cleared. Ready for fresh Branch sync.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Setup Socket.io Event Handlers
require('./src/sockets/admin.socket')(io);

// Initialize SyncQueue Service
const syncQueueService = require('./src/services/syncQueue.service');
syncQueueService.init(io);

const logger = require('./utils/logger');
const PORT = process.env.PORT || 5005;

if (require.main === module) {
    server.listen(PORT, () => {
        logger.info(`--- Central Admin Portal running on port ${PORT} ---`);
    });
}

module.exports = { app, server, io };
