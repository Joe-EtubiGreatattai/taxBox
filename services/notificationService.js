const Notification = require('../models/Notification');
const User = require('../models/User');
const { getUserTaxStatus } = require('./userService');
const taxNewsService = require('./taxNewsService');

class NotificationService {
  // Generate and save notifications for a user
  async generateUserNotifications(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) return;

      const taxStatus = await getUserTaxStatus(user);
      const notifications = [];

      const now = new Date();

      // Unpaid months notifications
      if (taxStatus.unpaidMonths && taxStatus.unpaidMonths.length > 0) {
        taxStatus.unpaidMonths.forEach((month, index) => {
          notifications.push({
            user: userId,
            type: 'payment',
            title: 'Payment Overdue',
            message: `Your ${month.monthName} tax payment of ₦${month.taxAmount?.toLocaleString()} is pending.`,
            actionable: true,
            metadata: {
              monthName: month.monthName,
              amount: month.taxAmount,
              month: month.month,
              action: 'view_payments'
            }
          });
        });
      }

      // Save notifications
      if (notifications.length > 0) {
        await Notification.create(notifications);
      }

      return notifications;
    } catch (error) {
      console.error('Error generating user notifications:', error);
    }
  }

  // Create a single notification
  async createNotification(notificationData) {
    try {
      const created = await Notification.create(notificationData);
      return created;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  }

  // Get unread count for user
  async getUnreadCount(userId) {
    return await Notification.getUnreadCount(userId);
  }

  // Periodically fetch latest tax news and send as notifications to all active users
  async sendTaxNewsDigestToAllUsers() {
    try {
      const articles = await taxNewsService.fetchLatestTaxNews();
      if (!articles || articles.length === 0) {
        return;
      }

      // Use the top article as a digest for now
      const top = articles[0];

      const users = await User.find({ isActive: true }).select('_id');
      if (!users || users.length === 0) return;

      const notifications = users.map((u) => ({
        user: u._id,
        type: 'tax',
        title: top.title || 'Latest tax news',
        message: top.snippet || top.title || 'New tax news update',
        actionable: true,
        metadata: {
          url: top.link,
          source: top.source,
          published_at: top.date,
        },
      }));

      await Notification.create(notifications);
    } catch (error) {
      console.error('Error sending tax news digest notifications:', error);
    }
  }
}

module.exports = new NotificationService();
