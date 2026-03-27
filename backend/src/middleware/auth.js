const jwt = require('jsonwebtoken');

const adminAuth = (req, res, next) => {
    const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.admin = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};

const authenticateToken = adminAuth;

const requireSuperAdmin = (req, res, next) => {
    if (!req.admin || req.admin.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Super Admin access required' });
    }
    next();
};

module.exports = { adminAuth, authenticateToken, requireSuperAdmin };
