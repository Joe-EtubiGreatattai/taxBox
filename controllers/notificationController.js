const Notification = require('../models/Notification');
const User = require('../models/User');
const { getUserTaxStatus } = require('../services/userService');
const { emitToUser } = require('../services/socketService');
const { chatWithMercy } = require('../services/openaiService');
const { sendPushNotification } = require('../services/expoPushService');

// Get all notifications for user
const getNotifications = async (req, res) => {
  try {
    const { limit = 50, skip = 0, unreadOnly } = req.query;
    const userId = req.user._id;

    console.log(`🔔 Fetching notifications for user: ${userId}`);
    const notifications = await Notification.findByUser(userId, {
      limit: parseInt(limit),
      skip: parseInt(skip),
      unreadOnly: unreadOnly === 'true'
    });

    console.log(`✅ Found ${notifications.length} notifications for user ${userId}`);

    const unreadCount = await Notification.getUnreadCount(userId);

    res.json({
      success: true,
      notifications,
      unreadCount,
      total: notifications.length
    });

  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching notifications'
    });
  }
};

// Get single notification detail
const getNotificationDetail = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user._id;

    const notification = await Notification.findOne({
      _id: notificationId,
      user: userId
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.json({
      success: true,
      notification
    });

  } catch (error) {
    console.error('Get notification detail error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching notification details'
    });
  }
};

// Mark notification as read
const markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user._id;

    const notification = await Notification.findOne({
      _id: notificationId,
      user: userId
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    await notification.markAsRead();

    emitToUser(userId, 'notifications:changed', {});

    res.json({
      success: true,
      message: 'Notification marked as read',
      notification
    });

  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while marking notification as read'
    });
  }
};

// Mark all notifications as read
const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user._id;

    await Notification.markAllAsRead(userId);

    emitToUser(userId, 'notifications:changed', {});

    res.json({
      success: true,
      message: 'All notifications marked as read'
    });

  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while marking all notifications as read'
    });
  }
};

// Delete notification
const deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user._id;

    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      user: userId
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    emitToUser(userId, 'notifications:changed', {});

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });

  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting notification'
    });
  }
};

// Get notification stats
const getNotificationStats = async (req, res) => {
  try {
    const userId = req.user._id;

    const unreadCount = await Notification.getUnreadCount(userId);
    const totalCount = await Notification.countDocuments({ user: userId });

    res.json({
      success: true,
      stats: {
        unreadCount,
        totalCount
      }
    });

  } catch (error) {
    console.error('Get notification stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching notification stats'
    });
  }
};

// Generate system notifications based on user data
const generateSystemNotifications = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const taxStatus = await getUserTaxStatus(user);
    const notifications = [];

    const now = new Date();

    // Check for unpaid months
    if (taxStatus.unpaidMonths && taxStatus.unpaidMonths.length > 0) {
      for (const month of taxStatus.unpaidMonths) {
        // Check if notification already exists
        const exists = await Notification.findOne({
          user: userId,
          type: 'payment',
          'metadata.monthName': month.monthName,
          // Removed metadata.year check as it's not always in month object, monthName is unique enough with createdAt check
          createdAt: { $gt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) } // Every 3 days
        });

        if (!exists) {
          notifications.push({
            user: userId,
            type: 'payment',
            title: 'Payment Overdue',
            message: `Your ${month.monthName} tax payment of ₦${month.taxAmount?.toLocaleString()} is pending. Please make payment to avoid penalties.`,
            actionable: true,
            metadata: {
              monthName: month.monthName,
              amount: month.taxAmount,
              month: month.month,
              action: 'view_payments'
            }
          });
        }
      }
    }

    // Current month reminder - only once per day
    if (taxStatus.currentMonth && taxStatus.currentMonth.totalTax > 0) {
      const exists = await Notification.findOne({
        user: userId,
        type: 'reminder',
        title: 'Monthly Tax Summary',
        createdAt: { $gt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) } // Every 3 days
      });

      if (!exists) {
        notifications.push({
          user: userId,
          type: 'reminder',
          title: 'Monthly Tax Summary',
          message: `You have ₦${taxStatus.currentMonth.totalTax?.toLocaleString()} in VAT for this month from ${taxStatus.currentMonth.receiptsCount} receipts.`,
          actionable: false,
          metadata: {
            action: 'view_receipts'
          }
        });
      }
    }

    // Receipt milestone
    if (taxStatus.totalReceipts > 0) {
      if (taxStatus.totalReceipts % 10 === 0) {
        const exists = await Notification.findOne({
          user: userId,
          type: 'receipt',
          title: '🎉 Milestone Achieved!',
          message: { $regex: `${taxStatus.totalReceipts} receipts` }
        });

        if (!exists) {
          notifications.push({
            user: userId,
            type: 'receipt',
            title: '🎉 Milestone Achieved!',
            message: `Congratulations! You've tracked ${taxStatus.totalReceipts} receipts. Keep up the great work!`,
            actionable: false
          });
        }
      }
    }

    // Low activity reminder (if no receipts in 7 days)
    const lastReceipt = user.taxRecords.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    if (lastReceipt) {
      const daysSinceLastReceipt = Math.floor((now - new Date(lastReceipt.date)) / (1000 * 60 * 60 * 24));
      if (daysSinceLastReceipt >= 7) {
        // Check if we sent a reminder recently
        const exists = await Notification.findOne({
          user: userId,
          title: 'Time to Track Receipts',
          createdAt: { $gt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) } // Every 3 days
        });

        if (!exists) {
          notifications.push({
            user: userId,
            type: 'reminder',
            title: 'Time to Track Receipts',
            message: `It's been ${daysSinceLastReceipt} days since your last receipt. Don't forget to track your purchases for accurate tax records.`,
            actionable: true,
            metadata: {
              action: 'add_receipt'
            }
          });
        }
      }
    }

    // Tax tip (random tip) - limit frequency to once per day
    const tipExists = await Notification.findOne({
      user: userId,
      type: 'tax',
      title: 'Tax Tip',
      createdAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });

    if (!tipExists) {
      const taxTips = [
        'Did you know? Keeping digital copies of your receipts helps during tax audits and ensures you never miss a deduction.',
        'Tip: Regularly review your receipts to identify potential tax deductions you might have missed.',
        'Remember: VAT on business expenses can often be reclaimed. Make sure to track all eligible purchases.',
        'Pro Tip: Categorize your receipts properly to make tax filing much easier at the end of the period.'
      ];

      const randomTip = taxTips[Math.floor(Math.random() * taxTips.length)];
      notifications.push({
        user: userId,
        type: 'tax',
        title: 'Tax Tip',
        message: randomTip,
        actionable: false
      });
    }

    // Save notifications to database
    let savedNotifications = [];
    if (notifications.length > 0) {
      savedNotifications = await Notification.create(notifications);
      emitToUser(userId, 'notifications:changed', {});

      // Send push notification if user has a token
      if (user.expoPushToken) {
        // Send the most recent or important notification as a push
        const latest = savedNotifications[savedNotifications.length - 1];
        sendPushNotification(
          user.expoPushToken,
          latest.title,
          latest.message,
          { notificationId: latest.id, type: latest.type }
        ).catch(err => console.error('Push notification failed:', err));
      }
    }

    res.json({
      success: true,
      message: 'System notifications generated',
      notifications: savedNotifications,
      count: savedNotifications.length
    });

  } catch (error) {
    console.error('Generate system notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while generating system notifications'
    });
  }
};

// Send test AI notification
const sendTestAiNotification = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Generate AI message
    const prompt = `Hey Nas! Send me a short, fun test notification to see if my push notifications are working. Keep it under 15 words.`;
    const aiResponse = await chatWithMercy(prompt, []);
    const message = aiResponse.content;

    console.log('🤖 Nas Generated Message:', message);

    // Save as notification
    await Notification.create({
      user: userId,
      type: 'tax',
      title: 'Message from Nas',
      message: message,
      actionable: false
    });

    // Sync to Chat History
    user.chatMessages.push({
      text: message,
      sender: 'eunice',
      timestamp: new Date(),
      read: false
    });
    await user.save();

    emitToUser(userId, 'notifications:changed', {});
    emitToUser(userId, 'chat:received', {
      text: message,
      sender: 'eunice',
      timestamp: new Date()
    });

    // Send push notification if token exists
    if (user.expoPushToken) {
      sendPushNotification(
        user.expoPushToken,
        'Message from Nas',
        message,
        { type: 'tax' }
      ).catch(err => console.error('Push notification failed:', err));
    }

    res.json({
      success: true,
      message: 'AI notification sent and synced to chat',
      aiMessage: message
    });

  } catch (error) {
    console.error('Send test AI notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while sending test notification'
    });
  }
};

module.exports = {
  getNotifications,
  getNotificationDetail,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getNotificationStats,
  generateSystemNotifications,
  sendTestAiNotification
};