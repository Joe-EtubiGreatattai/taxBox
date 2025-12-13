const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  type: { 
    type: String, 
    required: true,
    enum: ['payment', 'receipt', 'reminder', 'system', 'tax', 'warning']
  },
  title: { 
    type: String, 
    required: true 
  },
  message: { 
    type: String, 
    required: true 
  },
  read: { 
    type: Boolean, 
    default: false 
  },
  actionable: { 
    type: Boolean, 
    default: false 
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  expiresAt: {
    type: Date,
    default: function() {
      // Notifications expire after 30 days by default
      const date = new Date();
      date.setDate(date.getDate() + 30);
      return date;
    }
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      ret.id = ret._id.toString();
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes for better performance
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, read: 1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Static methods
notificationSchema.statics.findByUser = function(userId, options = {}) {
  const { limit = 50, skip = 0, unreadOnly = false } = options;
  
  let query = { user: userId };
  if (unreadOnly) {
    query.read = false;
  }
  
  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);
};

notificationSchema.statics.markAllAsRead = function(userId) {
  return this.updateMany(
    { user: userId, read: false },
    { $set: { read: true } }
  );
};

notificationSchema.statics.getUnreadCount = function(userId) {
  return this.countDocuments({ user: userId, read: false });
};

notificationSchema.statics.createNotification = function(notificationData) {
  return this.create(notificationData);
};

// Instance methods
notificationSchema.methods.markAsRead = function() {
  this.read = true;
  return this.save();
};

module.exports = mongoose.model('Notification', notificationSchema);