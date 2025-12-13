require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

// Validate environment variables first
const { validateEnv } = require('./config/env');
validateEnv();

const connectDB = require('./config/database');
const userRoutes = require('./routes/userRoutes');
const receiptRoutes = require('./routes/receiptRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const contactRoutes = require('./routes/contactRoutes');
const waitlistRoutes = require('./routes/waitlistRoutes');
const chatRoutes = require('./routes/chatRoutes');
const { initializeWhatsApp } = require('./services/whatsappService');
const { generalLimiter } = require('./middleware/rateLimit');
const { setSocketServerInstance } = require('./services/socketService');
const notificationService = require('./services/notificationService');
const periodicNotificationService = require('./services/periodicNotificationService');
const { hardDeleteUserById } = require('./services/userCleanupService');
const { sendNotificationToUser } = require('./services/pushService');
const User = require('./models/User');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Connect to database
// Connect to database - (Moved to startServer)
// connectDB();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(cors());
app.use('/uploads', express.static('uploads'));

// Trust the first proxy (e.g., Nginx)
app.set('trust proxy', 1);

// Apply general rate limiting to all routes
app.use(generalLimiter);

// Socket.io setup (after middleware so we can share JWT secret)
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

setSocketServerInstance(io);

// Online users tracking: userId -> { socketId, userInfo }
const onlineUsers = new Map();

io.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id);

  socket.on('authenticate', async (token) => {
    try {
      const payload = jwt.verify(
        token,
        process.env.JWT_SECRET || 'fallback-secret-key',
      );
      const userId = payload.userId;
      if (!userId) {
        socket.emit('authenticated', { success: false, message: 'Invalid token payload' });
        return;
      }

      const room = userId.toString();
      socket.join(room);
      socket.data.userId = room;

      // Fetch user info for the online list
      const User = require('./models/User');
      const user = await User.findById(userId).select('name email tin phone profilePhotoUrl');

      if (user) {
        onlineUsers.set(room, {
          socketId: socket.id,
          userInfo: {
            _id: user._id,
            name: user.name,
            email: user.email,
            photo: user.profilePhotoUrl
          }
        });

        // Broadcast updated online list
        io.emit('online-users-update', Array.from(onlineUsers.values()));
      }

      socket.emit('authenticated', { success: true });
      console.log('✅ Socket authenticated for user', room);
    } catch (err) {
      console.error('Socket auth error:', err?.message || err);
      socket.emit('authenticated', { success: false, message: 'Invalid token' });
    }
  });

  socket.on('get-online-users', () => {
    const list = Array.from(onlineUsers.values());
    socket.emit('online-users-list', list);
  });

  socket.on('request-chat', async ({ targetUserId }) => {
    const senderId = socket.data.userId;
    if (!senderId) return;

    const sender = onlineUsers.get(senderId);
    if (sender) {
      // Emit to specific user room
      io.to(targetUserId).emit('chat-request-received', {
        fromUser: sender.userInfo
      });

      // Send push notification
      await sendNotificationToUser(targetUserId, {
        title: 'New Chat Request 👥',
        message: `${sender.userInfo.name} wants to chat with you`,
        type: 'chat_request',
        url: '/community',
        metadata: { senderId: sender.userInfo._id }
      });
    }
  });

  socket.on('respond-chat', ({ targetUserId, accepted }) => {
    const responderId = socket.data.userId;
    if (!responderId) return;

    const responder = onlineUsers.get(responderId);

    // Notify the requester
    io.to(targetUserId).emit('chat-response-received', {
      fromUser: responder ? responder.userInfo : { _id: responderId },
      accepted
    });
  });

  socket.on('typing', ({ targetUserId }) => {
    const senderId = socket.data.userId;
    if (!senderId) return;
    console.log(`⌨️  Typing: ${senderId} → ${targetUserId}`);
    io.to(targetUserId).emit('typing', { fromUserId: senderId });
  });

  socket.on('stop-typing', ({ targetUserId }) => {
    const senderId = socket.data.userId;
    if (!senderId) return;
    console.log(`⌨️  Stop typing: ${senderId} → ${targetUserId}`);
    io.to(targetUserId).emit('stop-typing', { fromUserId: senderId });
  });

  socket.on('p2p-message', async ({ targetUserId, text, type, mediaUrl, duration }) => {
    const senderId = socket.data.userId;
    if (!senderId) return;

    console.log('📨 Received p2p-message:', {
      senderId,
      targetUserId,
      type,
      hasText: !!text,
      textLength: text?.length,
      hasMediaUrl: !!mediaUrl,
      mediaUrl,
      hasDuration: !!duration,
      duration
    });

    try {
      // Save to database
      const P2PMessage = require('./models/P2PMessage');
      const messageData = {
        senderId,
        receiverId: targetUserId,
        timestamp: new Date(),
        type: type || 'text'
      };

      if (text) messageData.text = text;
      if (mediaUrl) messageData.mediaUrl = mediaUrl;
      if (duration) messageData.duration = duration;

      console.log('💾 Saving message to DB:', messageData);
      const message = await P2PMessage.create(messageData);
      console.log('✅ Message saved with ID:', message._id);

      // Send to target
      io.to(targetUserId).emit('p2p-message-received', {
        id: message._id,
        fromUserId: senderId,
        text: message.text,
        type: message.type,
        mediaUrl: message.mediaUrl,
        duration: message.duration,
        timestamp: message.timestamp
      });

      // If target is online, mark as delivered immediately and send delivery receipt
      const targetSocket = Array.from(io.sockets.sockets.values())
        .find(s => s.data.userId === targetUserId);

      if (targetSocket) {
        // Mark as delivered
        await P2PMessage.findByIdAndUpdate(message._id, { delivered: true });

        // Send delivery receipt back to sender
        io.to(senderId).emit('message-delivered', {
          messageId: message._id.toString(),
          targetUserId
        });
      }

      // Notify target about unread count update
      const unreadCount = await P2PMessage.countDocuments({
        senderId: senderId,
        receiverId: targetUserId,
        read: false
      });

      io.to(targetUserId).emit('unread-count-update', {
        fromUserId: senderId,
        unreadCount: unreadCount
      });

      // Send push notification
      const sender = onlineUsers.get(senderId);
      const senderName = sender ? sender.userInfo.name : 'User';

      let notificationBody = text;
      if (type === 'audio') {
        notificationBody = '🎤 Sent a voice message';
      } else if (type === 'image') {
        notificationBody = '📷 Sent an image';
      } else {
        notificationBody = text.length > 50 ? text.substring(0, 50) + '...' : text;
      }

      await sendNotificationToUser(targetUserId, {
        title: `New message from ${senderName}`,
        message: notificationBody,
        type: 'chat_message',
        url: `/community/chat/${senderId}?name=${encodeURIComponent(senderName)}`,
        metadata: { senderId, messageId: message._id }
      });

      // Acknowledge to sender (optional, but good for UI updates if we want to confirm sent)
      // socket.emit('message-sent', { id: message._id, tempId: ... }) 

    } catch (err) {
      console.error('Error saving P2P message:', err);
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('🔌 Socket disconnected:', socket.id, reason);
    const userId = socket.data.userId;
    if (userId) {
      onlineUsers.delete(userId);
      // Broadcast updated list
      io.emit('online-users-update', Array.from(onlineUsers.values()));
    }
  });
});

// Routes
app.use('/api', userRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api', receiptRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/waitlist', waitlistRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', require('./routes/adminRoutes'));

// Health check with environment info
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'Nigerian Tax Assistant API',
    version: '2.2',
    environment: process.env.NODE_ENV || 'development',
    features: ['JWT Authentication', 'WhatsApp Integration', 'AI Receipt Analysis', 'PDF Reporting']
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Nigerian Tax Assistant API',
    version: '2.2',
    environment: process.env.NODE_ENV || 'development',
    features: [
      'JWT Authentication',
      'WhatsApp Bot Integration',
      'AI-Powered Receipt Analysis',
      'PDF Tax Reports',
      'Monthly Payment Tracking'
    ],
    endpoints: {
      auth: {
        register: 'POST /api/register',
        login: 'POST /api/login'
      },
      user: {
        profile: 'GET /api/profile (Auth Required)',
        receipts: 'GET /api/receipts (Auth Required)',
        report: 'GET /api/report (Auth Required)',
        payments: 'GET /api/payments (Auth Required)',
        updateProfile: 'PUT /api/profile (Auth Required)',
        changePassword: 'PUT /api/change-password (Auth Required)'
      },
      public: {
        getUser: 'GET /api/user/:phone',
        health: 'GET /health'
      }
    },
    authentication: 'Use Bearer token in Authorization header for protected routes'
  });
});

// Create directories
const directories = ['uploads', 'reports'];
directories.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
    console.log(`📁 Created directory: ${dir}`);
  }
});

// Start servers
const startServer = async () => {
  try {
    await connectDB();

    server.listen(PORT, () => {
      console.log(`🚀 Tax Assistant running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔐 JWT Authentication: ${process.env.JWT_SECRET ? 'Enabled ✅' : 'Disabled ❌'}`);
      console.log(`📱 WhatsApp bot initializing...`);
      console.log(`\n📋 API Endpoints:`);
      console.log(`   POST   http://localhost:${PORT}/api/register`);
      console.log(`   POST   http://localhost:${PORT}/api/login`);
      console.log(`   GET    http://localhost:${PORT}/api/profile (Auth)`);
      console.log(`   GET    http://localhost:${PORT}/api/receipts (Auth)`);
      console.log(`   GET    http://localhost:${PORT}/api/report (Auth)`);
      console.log(`   GET    http://localhost:${PORT}/api/payments (Auth)`);
      console.log(`   PUT    http://localhost:${PORT}/api/profile (Auth)`);
      console.log(`\n✅ Health check: http://localhost:${PORT}/health`);

      // Schedule periodic tax news polling via SerpApi (default: every 6 hours)
      const minutes = parseInt(process.env.TAX_NEWS_POLL_INTERVAL_MINUTES || '360', 10);
      const intervalMs = minutes * 60 * 1000;

      console.log(`📰 Tax news polling enabled (every ${minutes} minutes)`);

      setInterval(() => {
        notificationService
          .sendTaxNewsDigestToAllUsers()
          .catch((err) => console.error('❌ Tax news polling error:', err));
      }, intervalMs);

      // Periodically purge users whose accounts have been in the delete phase for
      // at least 10 days. Runs once per day by default.
      const deleteGraceDays = 10;
      const purgeIntervalMs = 24 * 60 * 60 * 1000; // 24 hours

      setInterval(async () => {
        try {
          const cutoff = new Date(Date.now() - deleteGraceDays * 24 * 60 * 60 * 1000);
          const pendingDeletionUsers = await User.find({ deleteRequestedAt: { $lte: cutoff } }).select('_id');

          if (!pendingDeletionUsers.length) return;

          console.log(`🧹 Purging ${pendingDeletionUsers.length} user(s) scheduled for deletion...`);

          for (const u of pendingDeletionUsers) {
            await hardDeleteUserById(u._id, { reason: 'Automatic purge after 10-day delete phase' });
          }
        } catch (err) {
          console.error('❌ Error purging soft-deleted users:', err);
        }
      }, purgeIntervalMs);

      // Start periodic push notifications (every 1 hour)
      console.log('🔔 Starting periodic push notification service...');
      periodicNotificationService.start();

      // Initialize WhatsApp
      initializeWhatsApp();
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n👋 Shutting down gracefully...');

  // Stop periodic notifications
  periodicNotificationService.stop();

  const mongoose = require('mongoose');
  await mongoose.connection.close();
  console.log('✅ Database connection closed');
  process.exit(0);
});

// Export io instance for other modules
module.exports.getIO = () => io;