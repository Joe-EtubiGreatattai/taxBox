const User = require('../models/User');
const { generateEuniceResponse } = require('../services/chatService');

/**
 * Send a chat message and get Nas's response
 */
const sendMessage = async (req, res) => {
    try {
        const { text, replyToId } = req.body;
        const userId = req.user._id;

        if (!text || text.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Message text is required'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Prepare reply context if replying to a message
        let replyTo = null;
        if (replyToId) {
            const repliedMessage = user.chatMessages.id(replyToId);
            if (repliedMessage) {
                replyTo = {
                    messageId: repliedMessage._id,
                    text: repliedMessage.text,
                    sender: repliedMessage.sender
                };
            }
        }

        // Add user's message
        user.chatMessages.push({
            text: text.trim(),
            sender: 'user',
            timestamp: new Date(),
            read: true,
            replyTo: replyTo
        });

        // Get the subdocument (which has the _id)
        const userMessage = user.chatMessages[user.chatMessages.length - 1];
        await user.save();

        // Generate Nas's response
        const userProfile = {
            name: user.name,
            taxType: user.taxType,
            profession: user.profession,
            incomeRange: user.incomeRange
        };

        // Prepare tax data summary
        const taxSummary = user.getTaxSummary();
        const recentReceipts = user.taxRecords.slice(-5).map(receipt => ({
            date: receipt.date,
            description: receipt.description,
            amount: receipt.amount,
            taxAmount: receipt.taxAmount,
            category: receipt.category
        }));

        const userData = {
            taxSummary,
            recentReceipts,
            monthlyPayments: user.monthlyPayments.slice(-3)
        };

        const euniceText = await generateEuniceResponse(
            text,
            user.chatMessages.slice(-10),
            userProfile,
            userData
        );

        // Add Nas's response
        user.chatMessages.push({
            text: euniceText,
            sender: 'eunice',
            timestamp: new Date(),
            read: false
        });

        // Get the subdocument
        const euniceMessage = user.chatMessages[user.chatMessages.length - 1];
        await user.save();

        return res.status(200).json({
            success: true,
            message: 'Message sent successfully',
            userMessage: {
                id: userMessage._id.toString(),
                text: userMessage.text,
                sender: userMessage.sender,
                timestamp: userMessage.timestamp,
                replyTo: userMessage.replyTo
            },
            euniceMessage: {
                id: euniceMessage._id.toString(),
                text: euniceMessage.text,
                sender: euniceMessage.sender,
                timestamp: euniceMessage.timestamp
            }
        });
    } catch (error) {
        console.error('Error sending chat message:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to send message',
            error: error.message
        });
    }
};

/**
 * Get chat message history
 */
const getMessages = async (req, res) => {
    try {
        const userId = req.user._id;
        const { limit = 50 } = req.query;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Get recent messages
        const messages = user.chatMessages
            .slice(-parseInt(limit))
            .map(msg => ({
                id: msg._id.toString(),
                text: msg.text,
                sender: msg.sender,
                timestamp: msg.timestamp,
                read: msg.read
            }));

        return res.status(200).json({
            success: true,
            messages
        });
    } catch (error) {
        console.error('Error getting chat messages:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to get messages',
            error: error.message
        });
    }
};

/**
 * Mark messages as read
 */
const markAsRead = async (req, res) => {
    try {
        const userId = req.user._id;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Mark all Nas's messages as read
        user.chatMessages.forEach(msg => {
            if (msg.sender === 'eunice') {
                msg.read = true;
            }
        });

        await user.save();

        return res.status(200).json({
            success: true,
            message: 'Messages marked as read'
        });
    } catch (error) {
        console.error('Error marking messages as read:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to mark messages as read',
            error: error.message
        });
    }
};

/**
 * Delete a chat message
 */
const deleteMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const userId = req.user._id;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Find and remove the message
        const messageIndex = user.chatMessages.findIndex(
            msg => msg._id.toString() === messageId
        );

        if (messageIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Message not found'
            });
        }

        user.chatMessages.splice(messageIndex, 1);
        await user.save();

        return res.status(200).json({
            success: true,
            message: 'Message deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting message:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete message',
            error: error.message
        });
    }
};

/**
 * Edit a user message and regenerate AI response
 */
const editMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const { text } = req.body;
        const userId = req.user._id;

        if (!text || text.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Message text is required'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Find the message
        const messageIndex = user.chatMessages.findIndex(
            msg => msg._id.toString() === messageId
        );

        if (messageIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Message not found'
            });
        }

        const message = user.chatMessages[messageIndex];

        // Only allow editing user messages
        if (message.sender !== 'user') {
            return res.status(400).json({
                success: false,
                message: 'Can only edit user messages'
            });
        }

        // Update the message text
        message.text = text.trim();

        // Remove all messages after this one
        user.chatMessages = user.chatMessages.slice(0, messageIndex + 1);
        await user.save();

        // Generate new AI response
        const userProfile = {
            name: user.name,
            taxType: user.taxType,
            profession: user.profession,
            incomeRange: user.incomeRange
        };

        const taxSummary = user.getTaxSummary();
        const recentReceipts = user.taxRecords.slice(-5).map(receipt => ({
            date: receipt.date,
            description: receipt.description,
            amount: receipt.amount,
            taxAmount: receipt.taxAmount,
            category: receipt.category
        }));

        const userData = {
            taxSummary,
            recentReceipts,
            monthlyPayments: user.monthlyPayments.slice(-3)
        };

        const euniceText = await generateEuniceResponse(
            text.trim(),
            user.chatMessages.slice(-10),
            userProfile,
            userData
        );

        // Add Nas's response
        user.chatMessages.push({
            text: euniceText,
            sender: 'eunice',
            timestamp: new Date(),
            read: false
        });

        const euniceMessage = user.chatMessages[user.chatMessages.length - 1];
        await user.save();

        return res.status(200).json({
            success: true,
            message: 'Message edited successfully',
            updatedMessage: {
                id: message._id.toString(),
                text: message.text,
                sender: message.sender,
                timestamp: message.timestamp
            },
            euniceMessage: {
                id: euniceMessage._id.toString(),
                text: euniceMessage.text,
                sender: euniceMessage.sender,
                timestamp: euniceMessage.timestamp
            }
        });
    } catch (error) {
        console.error('Error editing message:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to edit message',
            error: error.message
        });
    }
};

/**
 * Get P2P chat history with another user
 */
const getP2PHistory = async (req, res) => {
    try {
        const userId = req.user._id;
        const { otherUserId } = req.params;
        const { limit = 50, before } = req.query;

        const P2PMessage = require('../models/P2PMessage');

        const query = {
            $or: [
                { senderId: userId, receiverId: otherUserId },
                { senderId: otherUserId, receiverId: userId }
            ]
        };

        if (before) {
            query.timestamp = { $lt: new Date(before) };
        }

        const messages = await P2PMessage.find(query)
            .sort({ timestamp: -1 })
            .limit(parseInt(limit))
            .lean();

        // Reverse to return in chronological order
        const history = messages.reverse().map(msg => ({
            id: msg._id.toString(),
            text: msg.text,
            senderId: msg.senderId.toString(),
            receiverId: msg.receiverId.toString(),
            timestamp: msg.timestamp,
            delivered: msg.delivered || false,
            read: msg.read,
            type: msg.type || 'text',
            mediaUrl: msg.mediaUrl,
            duration: msg.duration
        }));

        res.json({
            success: true,
            messages: history
        });

    } catch (error) {
        console.error('Get P2P history error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch chat history'
        });
    }
};


module.exports = {
    sendMessage,
    getMessages,
    markAsRead,
    deleteMessage,
    editMessage,
    getP2PHistory
};
