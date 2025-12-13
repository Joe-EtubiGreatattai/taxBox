const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const receiptSchema = require('./Receipt');

const monthlyPaymentSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
  month: { type: String, required: true }, // "YYYY-MM"
  year: { type: Number, required: true },
  totalTax: { type: Number, default: 0 },
  paidAmount: { type: Number, default: 0 },
  currency: { type: String, default: 'NGN' },
  isPaid: { type: Boolean, default: false },
  paidDate: { type: Date },
  paymentProof: { type: String },
  receiptsCount: { type: Number, default: 0 },
  totalSpent: { type: Number, default: 0 }
}, { _id: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

const userSchema = new mongoose.Schema({
  // For Google-created users we initially allow phone and tin to be empty,
  // and ask the user to complete them later from the profile screen.
  phone: { type: String, unique: true, trim: true },
  tin: { type: String, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  // Clerk Authentication ID
  clerkId: { type: String, unique: true, sparse: true },
  // Optional profile photo URL served from /uploads or external storage
  profilePhotoUrl: { type: String, default: null },
  // Expo push token for mobile push notifications
  expoPushToken: { type: String, default: null },
  // Password is required for email+password sign-in, but optional for Google accounts.
  password: { type: String, minlength: 6 },
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date },
  lastMonthlyReport: { type: Date, default: null },
  lastEngagementNotification: { type: Date, default: null },
  hasCompletedOnboarding: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  // Account moderation & lifecycle
  isSuspended: { type: Boolean, default: false },
  suspendedAt: { type: Date, default: null },
  suspendedReason: { type: String, default: null },
  deleteRequestedAt: { type: Date, default: null },
  deleteRequestedReason: { type: String, default: null },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  profession: { type: String, default: null },
  taxType: { type: String, enum: ['PAYE', 'VAT', 'CIT'], default: 'PAYE' },
  incomeRange: { type: String, default: null },
  taxRecords: [receiptSchema],
  monthlyPayments: [monthlyPaymentSchema],
  chatMessages: [require('./ChatMessage')]
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: function (doc, ret) {
      if (ret.taxRecords) {
        ret.taxRecords = ret.taxRecords.map(record => ({
          ...record,
          id: record.id || (record._id ? record._id.toString() : null),
        }));
      }
      delete ret.password;
      return ret;
    }
  },
  toObject: {
    virtuals: true,
    transform: function (doc, ret) {
      if (ret.taxRecords) {
        ret.taxRecords = ret.taxRecords.map(record => ({
          ...record,
          id: record.id || (record._id ? record._id.toString() : null),
        }));
      }
      delete ret.password;
      return ret;
    }
  }
});

// Indexes
userSchema.index({ phone: 1 });
userSchema.index({ tin: 1 });
userSchema.index({ email: 1 });
userSchema.index({ clerkId: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ 'taxRecords.date': -1 });
userSchema.index({ 'monthlyPayments.month': -1 });
userSchema.index({ deleteRequestedAt: 1 });
userSchema.index({ isSuspended: 1 });

// Password hashing
userSchema.pre('save', async function (next) {
  // If password is not set (e.g. Google-created account), skip hashing.
  if (!this.isModified('password') || !this.password) return next();
  try {
    const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_ROUNDS) || 12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance methods
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!candidatePassword) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.generateAuthToken = function () {
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    { userId: this._id, phone: this.phone, tin: this.tin, role: this.role },
    process.env.JWT_SECRET || 'fallback-secret-key',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

userSchema.methods.addReceipt = function (receiptData) {
  const receipt = {
    date: receiptData.date || new Date(),
    description: receiptData.description,
    amount: receiptData.amount,
    currency: receiptData.currency || 'NGN',
    category: receiptData.category || 'other',
    merchant: receiptData.merchant,
    taxDeductible: receiptData.taxDeductible || false,
    taxRate: receiptData.taxRate || 0.075,
    taxAmount: receiptData.taxAmount || (receiptData.amount * (receiptData.taxRate || 0.075)),
    receiptNumber: receiptData.receiptNumber || `RCP${Date.now()}`,
    userContext: receiptData.userContext || '',
    imagePath: receiptData.imagePath || null,
    createdAt: new Date()
  };
  this.taxRecords.push(receipt);
  return receipt;
};

userSchema.methods.updateMonthlyPayment = function (month, year) {
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  if (!this.monthlyPayments) this.monthlyPayments = [];
  const monthRecords = this.taxRecords.filter(record => {
    const recordDate = new Date(record.date);
    return recordDate.getMonth() === month && recordDate.getFullYear() === year;
  });
  const totalTax = monthRecords.reduce((sum, r) => sum + (r.taxAmount || 0), 0);
  const totalSpent = monthRecords.reduce((sum, r) => sum + (r.amount || 0), 0);
  let payment = this.monthlyPayments.find(p => p.month === monthKey);
  if (payment) {
    payment.totalTax = totalTax;
    payment.totalSpent = totalSpent;
    payment.receiptsCount = monthRecords.length;
  } else if (monthRecords.length > 0) {
    payment = { month: monthKey, year, totalTax, paidAmount: 0, currency: 'NGN', isPaid: false, receiptsCount: monthRecords.length, totalSpent };
    this.monthlyPayments.push(payment);
  }
  if (monthRecords.length === 0) {
    this.monthlyPayments = this.monthlyPayments.filter(p => p.month !== monthKey);
  }
  return payment;
};

userSchema.methods.findReceiptById = function (receiptId) {
  return this.taxRecords.id(receiptId);
};

userSchema.methods.updateReceipt = function (receiptId, updates) {
  const receipt = this.taxRecords.id(receiptId);
  if (!receipt) return null;
  Object.keys(updates).forEach(key => {
    if (updates[key] !== undefined) receipt[key] = updates[key];
  });
  return receipt;
};

userSchema.methods.deleteReceipt = function (receiptId) {
  const receipt = this.taxRecords.id(receiptId);
  if (!receipt) return null;
  this.taxRecords.pull({ _id: receiptId });
  return receipt;
};

userSchema.methods.getReceiptsByDateRange = function (startDate, endDate) {
  return this.taxRecords.filter(record => {
    const recordDate = new Date(record.date);
    return recordDate >= new Date(startDate) && recordDate <= new Date(endDate);
  });
};

userSchema.methods.getReceiptsByCategory = function (category) {
  return this.taxRecords.filter(record => record.category === category);
};

userSchema.methods.getMonthlyTax = function (month, year) {
  const monthRecords = this.taxRecords.filter(record => {
    const recordDate = new Date(record.date);
    return recordDate.getMonth() === month && recordDate.getFullYear() === year;
  });
  return monthRecords.reduce((sum, r) => sum + (r.taxAmount || 0), 0);
};

userSchema.methods.getTaxSummary = function () {
  const totalReceipts = this.taxRecords.length;
  const totalSpent = this.taxRecords.reduce((sum, r) => sum + (r.amount || 0), 0);
  const totalTax = this.taxRecords.reduce((sum, r) => sum + (r.taxAmount || 0), 0);
  const deductibleAmount = this.taxRecords
    .filter(r => r.taxDeductible)
    .reduce((sum, r) => sum + (r.amount || 0), 0);
  return { totalReceipts, totalSpent, totalTax, deductibleAmount };
};

// Statics
userSchema.statics.findByPhone = function (phone) {
  return this.findOne({ phone });
};
userSchema.statics.findByTIN = function (tin) {
  return this.findOne({ tin });
};
userSchema.statics.findByEmail = function (email) {
  return this.findOne({ email });
};

// Clean JSON
userSchema.methods.toJSON = function () {
  const userObject = this.toObject();
  delete userObject.password;
  return userObject;
};

module.exports = mongoose.model('User', userSchema);