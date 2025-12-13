const mongoose = require('mongoose');

const receiptSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
  date: { type: Date, required: true, default: Date.now },
  description: { type: String, required: true },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'NGN' },
  category: {
    type: String,
    enum: ['business', 'goods', 'services', 'medical', 'education', 'food', 'transport', 'entertainment', 'other'],
    default: 'other'
  },
  type: { type: String, enum: ['income', 'expense'], default: 'expense' },
  merchant: { type: String, required: true },
  taxDeductible: { type: Boolean, default: false },
  taxRate: { type: Number, default: 0.075 },
  taxAmount: { type: Number, required: true, min: 0 },
  receiptNumber: { type: String },
  userContext: { type: String },
  imagePath: { type: String },
  createdAt: { type: Date, default: Date.now }
}, {
  _id: true,
  id: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

module.exports = receiptSchema;