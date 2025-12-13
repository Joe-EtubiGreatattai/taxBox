const express = require('express');
const router = express.Router();
const {
    getDashboardStats,
    getAllUsers,
    getAllReceipts,
    getAllPayments,
    adminLogin,
    updateAdminProfile,
    createAdmin,
    suspendUser,
    unsuspendUser,
    requestUserDeletion,
    deleteUserNow,
    handleAdminChat
} = require('../controllers/adminController');
const { requireAdmin } = require('../middleware/admin');
const { generalLimiter } = require('../middleware/rateLimit');

// Public admin route
router.post('/login', generalLimiter, adminLogin);

// Protected admin routes
router.use(requireAdmin);
router.get('/stats', getDashboardStats);
router.get('/users', getAllUsers);
router.get('/receipts', getAllReceipts);
router.get('/receipts', getAllReceipts);
router.get('/payments', getAllPayments);
router.put('/profile', updateAdminProfile);
router.post('/create-admin', createAdmin);

// User management
router.patch('/users/:userId/suspend', suspendUser);
router.patch('/users/:userId/unsuspend', unsuspendUser);
router.post('/users/:userId/delete-request', requestUserDeletion);
router.delete('/users/:userId', deleteUserNow);

// AI Chat
router.post('/chat', handleAdminChat);

module.exports = router;
