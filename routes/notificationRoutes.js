const express = require('express');
const router = express.Router();
const {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getNotificationStats,
  generateSystemNotifications,
  sendTestAiNotification
} = require('../controllers/notificationController');

const { authenticateToken } = require('../middleware/auth');
const { generalLimiter } = require('../middleware/rateLimit');

// All routes require authentication
router.use(authenticateToken);

// Get notifications with optional filters
router.get('/', generalLimiter, getNotifications);

// Get notification stats
router.get('/stats', generalLimiter, getNotificationStats);

// Generate system notifications based on user data
router.post('/generate-system', generalLimiter, generateSystemNotifications);

// Send test AI notification
router.post('/test-ai', generalLimiter, sendTestAiNotification);

// Mark specific notification as read
router.patch('/:notificationId/read', generalLimiter, markAsRead);

// Mark all notifications as read
router.patch('/read-all', generalLimiter, markAllAsRead);

// Delete notification
router.delete('/:notificationId', generalLimiter, deleteNotification);

module.exports = router;