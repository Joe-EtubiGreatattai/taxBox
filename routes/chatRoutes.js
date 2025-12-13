const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { sendMessage, getMessages, markAsRead, deleteMessage, editMessage } = require('../controllers/chatController');
const { authenticateToken } = require('../middleware/auth');

// All chat routes require authentication
router.post('/send', authenticateToken, sendMessage);
router.get('/messages', authenticateToken, getMessages);
router.put('/mark-read', authenticateToken, markAsRead);
router.delete('/messages/:messageId', authenticateToken, deleteMessage);
router.put('/messages/:messageId', authenticateToken, editMessage);
router.get('/p2p/history/:otherUserId', authenticateToken, require('../controllers/chatController').getP2PHistory);

const multer = require('multer');
const path = require('path');

// Configure multer for audio upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, 'audio-' + Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Upload audio route
router.post('/upload-audio', authenticateToken, upload.single('audio'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No audio file uploaded' });
    }

    // Return the file path (relative to server root, accessible via static middleware)
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ success: true, url: fileUrl });
});

// Get conversations (last message per user)
router.get('/conversations', authenticateToken, async (req, res) => {
    try {
        const P2PMessage = require('../models/P2PMessage');
        const User = require('../models/User');

        // FIXED: The middleware stores the full user object in req.user, not just userId
        const userId = req.user._id.toString();

        console.log('📞 [Conversations] =======  DEBUG START =======');
        console.log('📞 [Conversations] Request from userId:', userId);
        console.log('📞 [Conversations] userId type:', typeof userId);
        console.log('📞 [Conversations] Collection name:', P2PMessage.collection.name);

        // First, check if there are ANY messages in the database
        const totalMessages = await P2PMessage.countDocuments();
        console.log('📞 [Conversations] Total P2P messages in DB:', totalMessages);

        // Get a sample message to see the structure
        const sampleMessage = await P2PMessage.findOne().lean();
        if (sampleMessage) {
            console.log('📞 [Conversations] Sample message:', {
                _id: sampleMessage._id,
                senderId: sampleMessage.senderId,
                senderIdType: typeof sampleMessage.senderId,
                receiverId: sampleMessage.receiverId,
                receiverIdType: typeof sampleMessage.receiverId,
                text: sampleMessage.text?.substring(0, 20),
                timestamp: sampleMessage.timestamp
            });
        }

        // Check messages for this user (without ObjectId conversion first)
        const userMessageCount = await P2PMessage.countDocuments({
            $or: [
                { senderId: userId },
                { receiverId: userId }
            ]
        });
        console.log('📞 [Conversations] Messages involving this user (string match):', userMessageCount);

        // Check with ObjectId conversion
        const userMessageCountObj = await P2PMessage.countDocuments({
            $or: [
                { senderId: new mongoose.Types.ObjectId(userId) },
                { receiverId: new mongoose.Types.ObjectId(userId) }
            ]
        });
        console.log('📞 [Conversations] Messages involving this user (ObjectId match):', userMessageCountObj);

        // Aggregate to find last message for each conversation
        const conversations = await P2PMessage.aggregate([
            {
                $match: {
                    $or: [
                        { senderId: new mongoose.Types.ObjectId(userId) },
                        { receiverId: new mongoose.Types.ObjectId(userId) }
                    ]
                }
            },
            {
                $sort: { timestamp: -1 }
            },
            {
                $group: {
                    _id: {
                        $cond: [
                            { $eq: ["$senderId", new mongoose.Types.ObjectId(userId)] },
                            "$receiverId",
                            "$senderId"
                        ]
                    },
                    lastMessage: { $first: "$$ROOT" }
                }
            },
            {
                $sort: { "lastMessage.timestamp": -1 }
            }
        ]);

        console.log('📞 [Conversations] Aggregation result count:', conversations.length);
        if (conversations.length > 0) {
            console.log('📞 [Conversations] First conversation:', JSON.stringify(conversations[0], null, 2));
        }

        // Populate user details manually since we used aggregate
        const results = await Promise.all(conversations.map(async (conv) => {
            const otherUserId = conv._id;
            const user = await User.findById(otherUserId).select('name email profilePhotoUrl');

            if (!user) {
                console.log('📞 [Conversations] User not found for ID:', otherUserId);
                return null;
            }

            console.log('📞 [Conversations] User photo URL:', {
                userId: user._id,
                name: user.name,
                profilePhotoUrl: user.profilePhotoUrl
            });

            // Count unread messages from this user
            const unreadCount = await P2PMessage.countDocuments({
                senderId: otherUserId,
                receiverId: new mongoose.Types.ObjectId(userId),
                read: false
            });

            return {
                otherUser: {
                    _id: user._id.toString(), // Explicitly convert to string
                    name: user.name,
                    email: user.email,
                    photo: user.profilePhotoUrl
                },
                lastMessage: {
                    text: conv.lastMessage.text,
                    type: conv.lastMessage.type,
                    timestamp: conv.lastMessage.timestamp,
                    isMe: conv.lastMessage.senderId.toString() === userId,
                    delivered: conv.lastMessage.delivered || false,
                    read: conv.lastMessage.read || false
                },
                unreadCount: unreadCount
            };
        }));

        // Filter out if user not found (deleted users)
        const validResults = results.filter(r => r);

        console.log('📞 [Conversations] Sending', validResults.length, 'conversations to client');
        console.log('📞 [Conversations] ======= DEBUG END =======');
        res.json({ success: true, conversations: validResults });
    } catch (error) {
        console.error('❌ [Conversations] Error fetching conversations:', error);
        console.error('❌ [Conversations] Error stack:', error.stack);
        res.status(500).json({ success: false, message: 'Failed to fetch conversations' });
    }
});

// Mark messages as read from a specific user
router.put('/mark-p2p-read/:otherUserId', authenticateToken, async (req, res) => {
    try {
        const P2PMessage = require('../models/P2PMessage');
        const userId = req.user._id.toString();
        const { otherUserId } = req.params;

        // Mark all messages from otherUserId to currentUser as read and delivered
        const result = await P2PMessage.updateMany(
            {
                senderId: new mongoose.Types.ObjectId(otherUserId),
                receiverId: new mongoose.Types.ObjectId(userId),
                read: false
            },
            {
                $set: { read: true, delivered: true }
            }
        );

        console.log(`✅ Marked ${result.modifiedCount} messages as read from ${otherUserId} to ${userId}`);

        // Emit read receipt via Socket.IO
        if (result.modifiedCount > 0) {
            const { getIO } = require('../index');
            const io = getIO();
            io.to(otherUserId).emit('messages-read', {
                fromUserId: userId,
                count: result.modifiedCount
            });
        }

        res.json({
            success: true,
            message: 'Messages marked as read',
            count: result.modifiedCount
        });
    } catch (error) {
        console.error('❌ Error marking messages as read:', error);
        res.status(500).json({ success: false, message: 'Failed to mark messages as read' });
    }
});

module.exports = router;
