const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { adminAuth } = require('../middleware/auth');
const { logAuditAction } = require('../utils/auditLogger');
const prisma = require('../db');
const logger = require('../../utils/logger');

const BACKUP_DIR = path.join(__dirname, '../../backups');

if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

router.use(adminAuth);

router.get('/list', (req, res) => {
    try {
        const files = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.endsWith('.sql') || f.endsWith('.dump'))
            .map(f => {
                const stats = fs.statSync(path.join(BACKUP_DIR, f));
                return {
                    filename: f,
                    size: stats.size,
                    createdAt: stats.mtime
                };
            })
            .sort((a,b) => b.createdAt - a.createdAt);
        res.json(files);
    } catch (e) {
        logger.error({ err: e.message }, 'Failed to list backups');
        res.status(500).json({ error: 'فشل في عرض النسخ الاحتياطية' });
    }
});

router.post('/create', async (req, res) => {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `backup-${timestamp}.sql`;
        const dest = path.join(BACKUP_DIR, filename);
        
        const dbUrl = process.env.DATABASE_URL;
        if (!dbUrl) {
            return res.status(500).json({ error: 'Database connection not configured' });
        }
        
        const url = new URL(dbUrl);
        const pgDump = spawn('pg_dump', [
            url.hostname,
            '-U', url.username,
            '-d', url.pathname.slice(1),
            '-p', url.port || '5432',
            '-F', 'p'
        ], {
            env: { ...process.env, PGPASSWORD: url.password }
        });
        
        const chunks = [];
        pgDump.stdout.on('data', chunk => chunks.push(chunk));
        
        await new Promise((resolve, reject) => {
            pgDump.on('close', code => {
                if (code === 0) resolve();
                else reject(new Error(`pg_dump exited with code ${code}`));
            });
            pgDump.on('error', reject);
        });
        
        const dump = Buffer.concat(chunks);
        fs.writeFileSync(dest, dump);
        
        await logAuditAction({
            userId: req.admin.id,
            userName: req.admin.username,
            entityType: 'BACKUP',
            action: 'CREATE',
            details: `Created PostgreSQL backup ${filename}`,
            req
        });
        
        logger.info({ filename }, 'PostgreSQL backup created successfully');
        res.json({ success: true, filename });
    } catch (e) {
        logger.error({ err: e.message }, 'Backup creation failed');
        res.status(500).json({ error: 'فشل في إنشاء النسخة الاحتياطية' });
    }
});

router.delete('/delete/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const sanitized = path.basename(filename);
        const target = path.join(BACKUP_DIR, sanitized);
        const resolved = path.resolve(target);
        
        if (!resolved.startsWith(path.resolve(BACKUP_DIR))) {
            return res.status(403).json({ error: 'اسم ملف غير صالح' });
        }
        
        if (fs.existsSync(target)) {
            fs.unlinkSync(target);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'الملف غير موجود' });
        }
    } catch (e) {
        logger.error({ err: e.message }, 'Backup deletion failed');
        res.status(500).json({ error: 'فشل في حذف النسخة الاحتياطية' });
    }
});

router.get('/logs', async (req, res) => {
    try {
        const logs = await prisma.auditLog.findMany({
            where: { entityType: 'BACKUP' },
            take: 20,
            orderBy: { createdAt: 'desc' }
        });
        res.json(logs);
    } catch (e) {
        logger.error({ err: e.message }, 'Failed to fetch backup logs');
        res.json([]);
    }
});

module.exports = router;
