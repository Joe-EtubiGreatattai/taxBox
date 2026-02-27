const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
  registerUser,
  loginUser,
  loginWithGoogle,
  getCurrentUser,
  getUserByPhone,
  getUserReceipts,
  getUserPayments,
  generateUserReport,
  markPaymentAsPaid,
  clearUserReceipts,
  updateUserProfile,
  changePassword,
  deleteReceipt,
  sendReportToWhatsApp,
  uploadProfilePhoto,
  forgotPassword,
  registerPushToken,
  deleteAccount,
  getUserById
} = require('../controllers/userController');

const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { authLimiter, generalLimiter, reportLimiter } = require('../middleware/rateLimit');

// Multer memory storage for profile photo uploads; controller persists to disk
const profilePhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed for profile photos'), false);
    }
  },
});

// Public routes (with rate limiting)
router.post('/register', authLimiter, registerUser);
router.post('/login', authLimiter, loginUser);
router.post('/login/google', authLimiter, loginWithGoogle);
router.post('/forgot-password', authLimiter, forgotPassword);
router.get('/user/:phone', generalLimiter, optionalAuth, getUserByPhone);
router.get('/users/search', generalLimiter, authenticateToken, searchUsers);

// Protected routes (require authentication)
router.get('/profile', generalLimiter, authenticateToken, getCurrentUser);
router.get('/receipts', generalLimiter, authenticateToken, getUserReceipts);
router.get('/report', reportLimiter, authenticateToken, generateUserReport);
router.get('/payments', generalLimiter, authenticateToken, getUserPayments);
router.post('/mark-paid', generalLimiter, authenticateToken, markPaymentAsPaid);
router.post('/report/whatsapp', generalLimiter, authenticateToken, sendReportToWhatsApp);
router.delete('/receipts', generalLimiter, authenticateToken, clearUserReceipts);
router.put('/profile', generalLimiter, authenticateToken, updateUserProfile);
router.put('/change-password', authLimiter, authenticateToken, changePassword);
router.delete('/receipts/:receiptId', generalLimiter, authenticateToken, deleteReceipt);
router.post('/profile/photo', generalLimiter, authenticateToken, profilePhotoUpload.single('photo'), uploadProfilePhoto);
router.post('/push-token', generalLimiter, authenticateToken, registerPushToken);
router.delete('/account', generalLimiter, authenticateToken, deleteAccount);
router.get('/id/:id', generalLimiter, authenticateToken, getUserById);


// Backward compatibility routes (with phone in URL, protected)
router.get('/user/:phone/receipts', generalLimiter, authenticateToken, getUserReceipts);
router.get('/user/:phone/report', reportLimiter, authenticateToken, generateUserReport);
router.get('/user/:phone/payments', generalLimiter, authenticateToken, getUserPayments);
router.post('/user/:phone/mark-paid', generalLimiter, authenticateToken, markPaymentAsPaid);
router.delete('/user/:phone/receipts', generalLimiter, authenticateToken, clearUserReceipts);

module.exports = router;