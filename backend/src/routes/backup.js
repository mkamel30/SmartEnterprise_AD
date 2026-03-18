const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { adminAuth } = require('../middleware/auth');
const { logAuditAction } = require('../utils/auditLogger');

router.use(adminAuth);

const BACKUP_DIR = path.join(__dirname, '../../backups');
const DB_PATH = path.join(__dirname, '../../dev.db');

// Ensure directory exists
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

router.get('/list', (req, res) => {
    try {
        const files = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.endsWith('.sqlite') || f.endsWith('.db'))
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
        res.status(500).json({ error: 'Failed' });
    }
});

router.post('/create', async (req, res) => {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `backup-${timestamp}.sqlite`;
        const dest = path.join(BACKUP_DIR, filename);
        
        fs.copyFileSync(DB_PATH, dest);
        
        await logAuditAction({
            userId: req.admin.id,
            userName: req.admin.username,
            entityType: 'BACKUP',
            action: 'CREATE',
            details: `Created backup file ${filename}`,
            req
        });
        
        res.json({ success: true, filename });
    } catch (e) {
        res.status(500).json({ error: 'Backup failed' });
    }
});

router.delete('/delete/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const target = path.join(BACKUP_DIR, filename);
        if (fs.existsSync(target)) {
            fs.unlinkSync(target);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'File not found' });
        }
    } catch (e) {
        res.status(500).json({ error: 'Delete failed' });
    }
});

router.get('/logs', async (req, res) => {
    // Just returning central logs related to backups
    try {
        const logs = await prisma.centralLog.findMany({
            where: { message: { contains: 'Backup' } },
            take: 5,
            orderBy: { createdAt: 'desc' }
        });
        res.json(logs);
    } catch (e) {
        res.json([]);
    }
});

module.exports = router;
