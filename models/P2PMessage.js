const mongoose = require('mongoose');

const p2pMessageSchema = new mongoose.Schema({
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: false }, // Text is optional if it's an audio message
    timestamp: { type: Date, default: Date.now },
    delivered: { type: Boolean, default: false }, // Message delivered to recipient
    read: { type: Boolean, default: false }, // Message read by recipient
    type: { type: String, enum: ['text', 'audio', 'image'], default: 'text' },
    mediaUrl: { type: String },
    duration: { type: Number } // For audio messages (in milliseconds)
}, { timestamps: true });

// Index for efficient querying of conversation history
p2pMessageSchema.index({ senderId: 1, receiverId: 1, timestamp: -1 });
p2pMessageSchema.index({ receiverId: 1, senderId: 1, timestamp: -1 });

module.exports = mongoose.model('P2PMessage', p2pMessageSchema);
