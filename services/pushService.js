const axios = require('axios');
const User = require('../models/User');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

async function sendPushToToken(expoPushToken, notification) {
  try {
    if (!expoPushToken || !expoPushToken.startsWith('ExponentPushToken')) {
      console.warn('⚠️ Invalid or missing Expo push token, skipping push');
      return;
    }

    const payload = {
      to: expoPushToken,
      sound: 'default',
      title: notification.title,
      body: notification.message,
      data: {
        type: notification.type,
        notificationId: notification._id ? notification._id.toString() : undefined,
        url: notification.url, // Deep link URL
        metadata: notification.metadata || {},
      },
    };

    await axios.post(EXPO_PUSH_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    console.log(`✅ Push sent to ${expoPushToken.slice(0, 20)}... | Title: "${notification.title}"`);
  } catch (error) {
    console.error('❌ Expo push error:', error.response?.data || error.message || error);
  }
}

async function sendNotificationToUser(userId, notification) {
  try {
    const user = await User.findById(userId).select('expoPushToken');
    if (!user || !user.expoPushToken) return;
    await sendPushToToken(user.expoPushToken, notification);
  } catch (error) {
    console.error('❌ Error sending push to user:', error.message || error);
  }
}

async function sendNotificationsToUser(userId, notifications) {
  for (const n of notifications) {
    await sendNotificationToUser(userId, n);
  }
}

module.exports = {
  sendPushToToken,
  sendNotificationToUser,
  sendNotificationsToUser,
};