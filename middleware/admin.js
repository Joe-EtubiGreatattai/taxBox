const jwt = require('jsonwebtoken');
const User = require('../models/User');

const requireAdmin = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key');
        const user = await User.findById(decoded.userId);

        if (!user || user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }

        req.user = user;
        next();
    } catch (error) {
        res.status(401).json({ success: false, message: 'Invalid token' });
    }
};

module.exports = { requireAdmin };
