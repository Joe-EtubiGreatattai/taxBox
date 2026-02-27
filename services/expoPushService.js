const { Expo } = require('expo-server-sdk');

// Create a new Expo SDK client
let expo = new Expo();

/**
 * Send push notifications to one or more users
 * @param {string|string[]} pushTokens - One or more Expo push tokens
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {Object} data - Optional data payload
 */
const sendPushNotification = async (pushTokens, title, body, data = {}) => {
    const tokens = Array.isArray(pushTokens) ? pushTokens : [pushTokens];
    const messages = [];

    for (const pushToken of tokens) {
        // Check that all your push tokens appear to be valid Expo push tokens
        if (!Expo.isExpoPushToken(pushToken)) {
            console.error(`Push token ${pushToken} is not a valid Expo push token`);
            continue;
        }

        // Construct a message (see https://docs.expo.io/push-notifications/sending-notifications/)
        messages.push({
            to: pushToken,
            sound: 'default',
            title,
            body,
            data,
        });
    }

    // The Expo push notification service accepts batches of notifications.
    const chunks = expo.chunkPushNotifications(messages);
    const tickets = [];

    for (const chunk of chunks) {
        try {
            const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
            console.log('Push tickets:', ticketChunk);
            tickets.push(...ticketChunk);
        } catch (error) {
            console.error('Error sending push notification chunk:', error);
        }
    }

    // NOTE: In a production app, you should wait for the receipts to be available
    // and then check for errors like "DeviceNotRegistered".
    // For now, we'll just log the tickets.
    return tickets;
};

module.exports = {
    sendPushNotification
};
