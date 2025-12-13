const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
  addReceipt,
  processReceiptImage,
  processBulkTransactionsPdf,
  getUserReceipts,
  updateReceipt,
  deleteReceipt
} = require('../controllers/receiptController');

const { authenticateToken } = require('../middleware/auth');
const { generalLimiter } = require('../middleware/rateLimit');

// Configure multer for image upload
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Separate multer instance for PDF account statements
const pdfUpload = multer({
  storage: storage,
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB limit for statements
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed for account statements'), false);
    }
  }
});

// Apply rate limiting to all routes
router.use(generalLimiter);

// Receipt routes
router.post('/receipts', authenticateToken, addReceipt);
router.get('/receipts', authenticateToken, getUserReceipts);
router.put('/receipts/:receiptId', authenticateToken, updateReceipt);
router.delete('/receipts/:receiptId', authenticateToken, deleteReceipt);

// Image processing route
router.post('/process-receipt-image', authenticateToken, upload.single('image'), processReceiptImage);

// Bulk PDF account statement processing route
router.post('/bulk-transactions-pdf', authenticateToken, pdfUpload.single('file'), processBulkTransactionsPdf);

module.exports = router;
