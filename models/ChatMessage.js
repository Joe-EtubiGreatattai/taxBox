const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
    _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
    text: { type: String, required: true },
    sender: { type: String, enum: ['user', 'eunice'], required: true },
    timestamp: { type: Date, default: Date.now },
    read: { type: Boolean, default: false },
    replyTo: {
        messageId: { type: mongoose.Schema.Types.ObjectId },
        text: { type: String },
        sender: { type: String }
    }
}, { _id: true });

module.exports = chatMessageSchema;
