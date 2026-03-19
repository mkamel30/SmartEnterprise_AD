const express = require('express');
const router = express.Router();
const prisma = require('../db');
const crypto = require('crypto');

router.post('/register-branch', async (req, res) => {
    const { secret, name, address, authorizedHWID } = req.body;
    
    if (secret !== process.env.BOOTSTRAP_SECRET) {
        return res.status(403).json({ error: 'Invalid bootstrap secret' });
    }
    
    const branches = await prisma.branch.findMany({
        where: { code: { startsWith: 'BR' } },
        select: { code: true }
    });
    
    let nextNum = 1;
    if (branches.length > 0) {
        const maxNum = branches.map(b => {
            const match = b.code.match(/BR(\d+)/);
            return match ? parseInt(match[1], 10) : 0;
        }).sort((a, b) => b - a)[0];
        nextNum = maxNum + 1;
    }
    let code = `BR${String(nextNum).padStart(3, '0')}`;
    while (await prisma.branch.findUnique({ where: { code } })) {
        nextNum++;
        code = `BR${String(nextNum).padStart(3, '0')}`;
    }
    
    const apiKey = crypto.randomBytes(32).toString('hex');
    
    const branch = await prisma.branch.create({
        data: { code, name, address, apiKey, authorizedHWID }
    });
    
    res.status(201).json({ ...branch, apiKey });
});

module.exports = router;
