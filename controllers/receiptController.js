const { analyzeReceiptWithOpenAI, analyzeStatementPdfWithOpenAI } = require('../services/openaiService');
const mongoose = require('mongoose');
const { emitToUser } = require('../services/socketService');
const { calculateFromMonthly } = require('../services/salaryTaxCalculator');
const User = require('../models/User');

// Add new receipt (from scan or manual entry)
const addReceipt = async (req, res) => {
  try {
    const {
      merchantName,
      amount,
      vat,
      date,
      receiptNumber,
      description,
      category,
      taxDeductible,
      imageUri,
      userContext,
      type
    } = req.body;

    const user = req.user;

    if (!merchantName || !amount || !date) {
      return res.status(400).json({
        success: false,
        message: 'Merchant name, amount, and date are required'
      });
    }

    // Calculate tax if not provided
    // If user is PAYE, we don't calculate VAT on expenses for now.
    // If it's an INCOME, we don't calculate VAT on it (unless specified, but for now assume no VAT on income for freelancers).
    let calculatedVat = 0;
    if (user.taxType !== 'PAYE' && type !== 'income') {
      calculatedVat = vat || (amount * 0.075); // Default 7.5% VAT only if NOT PAYE and NOT Income
    } else if (vat) {
      calculatedVat = vat; // If explicitly provided, keep it
    }

    const receiptCategory = category || 'other';
    const transactionType = type || 'expense';

    // Create receipt record
    const receipt = {
      date: new Date(date),
      description: description || `Purchase from ${merchantName}`,
      amount: parseFloat(amount),
      currency: 'NGN',
      category: receiptCategory,
      type: transactionType,
      merchant: merchantName,
      merchant: merchantName,
      taxDeductible: taxDeductible || false,
      taxRate: 0.075,
      taxAmount: calculatedVat,
      receiptNumber: receiptNumber || `RCP${Date.now()}`,
      userContext: userContext || '',
      imagePath: imageUri || null,
      createdAt: new Date()
    };

    // Add to user's tax records
    user.taxRecords.push(receipt);
    await user.save();

    emitToUser(user._id, 'receipts:changed', {});
    emitToUser(user._id, 'dashboard:changed', {});

    // Get the newly created receipt with its ID
    const newReceipt = user.taxRecords[user.taxRecords.length - 1];
    const receiptId = newReceipt._id ? newReceipt._id.toString() : `receipt_${Date.now()}`;

    console.log('✅ Receipt added with ID:', receiptId);

    // Update monthly payment record
    const receiptDate = new Date(date);
    await updateMonthlyPayment(user, receiptDate.getMonth(), receiptDate.getFullYear());

    res.status(201).json({
      success: true,
      message: 'Receipt added successfully',
      receipt: {
        id: receiptId,
        date: newReceipt.date,
        description: newReceipt.description,
        amount: newReceipt.amount,
        currency: newReceipt.currency,
        category: newReceipt.category,
        merchant: newReceipt.merchant,
        taxDeductible: newReceipt.taxDeductible,
        taxRate: newReceipt.taxRate,
        taxAmount: newReceipt.taxAmount,
        receiptNumber: newReceipt.receiptNumber,
        userContext: newReceipt.userContext,
        imagePath: newReceipt.imagePath
      }
    });

  } catch (error) {
    console.error('Add receipt error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while adding receipt'
    });
  }
};

// Process receipt image with AI
const processReceiptImage = async (req, res) => {
  console.log('\n🎯 processReceiptImage called');
  console.log('⏰ Timestamp:', new Date().toISOString());

  try {
    console.log('📥 Request details:', {
      hasFile: !!req.file,
      fileSize: req.file?.size,
      fileType: req.file?.mimetype,
      hasBody: !!req.body,
      hasUser: !!req.user
    });

    if (!req.file) {
      console.log('❌ No file provided in request');
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    console.log('📄 File details:', {
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      bufferLength: req.file.buffer?.length
    });

    const { userContext } = req.body;
    console.log('💬 User context:', userContext);

    const user = req.user;
    console.log('👤 User info:', {
      id: user?.id,
      name: user?.name,
      email: user?.email
    });

    console.log('🖼️ Processing receipt image...');

    // Analyze image with Gemini AI
    console.log('🔄 Calling analyzeReceiptWithOpenAI...');
    console.log('📊 Function parameters:', {
      bufferLength: req.file.buffer.length,
      userContext: userContext || 'none',
      userName: user.name,
      userMessage: userContext || 'none'
    });

    const analysisResult = await analyzeReceiptWithOpenAI(
      req.file.buffer,
      userContext || '',
      user.name,
      userContext || ''
    );

    console.log('✅ Analysis result received:', {
      amount: analysisResult.amount,
      merchant: analysisResult.merchant,
      category: analysisResult.category,
      taxDeductible: analysisResult.taxDeductible,
      descriptionLength: analysisResult.description?.length
    });
    console.log('📋 Full analysis result:', JSON.stringify(analysisResult, null, 2));

    // If it's a conversational response (no amount), return as message
    if (analysisResult.amount === 0 && analysisResult.description) {
      console.log('💬 Returning conversational response (no amount)');
      console.log('📝 Message:', analysisResult.description);

      return res.json({
        success: true,
        type: 'message',
        message: analysisResult.description,
        data: null
      });
    }

    console.log('🧾 Preparing receipt response...');

    const receiptData = {
      merchantName: analysisResult.merchant,
      amount: analysisResult.amount.toString(),
      vat: analysisResult.taxAmount.toString(),
      date: analysisResult.date,
      receiptNumber: `RCP${Date.now()}`,
      description: analysisResult.description,
      category: analysisResult.category,
      taxDeductible: analysisResult.taxDeductible
    };

    console.log('📦 Receipt data prepared:', receiptData);

    // Return extracted receipt data
    console.log('✨ Sending success response');
    res.json({
      success: true,
      type: 'receipt',
      message: 'Receipt processed successfully',
      data: receiptData
    });

    console.log('✅ Response sent successfully');

  } catch (error) {
    console.error('❌ Process receipt image error:', error.message);
    console.error('📋 Error stack:', error.stack);
    console.error('🔍 Error details:', {
      name: error.name,
      code: error.code,
      message: error.message
    });

    if (error.response) {
      console.error('🌐 Error response:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    }

    console.error('📸 Request state at error:', {
      hasFile: !!req.file,
      hasUser: !!req.user,
      hasBody: !!req.body
    });

    res.status(500).json({
      success: false,
      message: 'Error processing receipt image'
    });

    console.log('⚠️ Error response sent to client');
  }
};

// Helper to process bulk PDF in background for a specific user
async function processBulkTransactionsPdfForUser(userId, fileBuffer, originalName) {
  console.log('\n📄 [BG] processBulkTransactionsPdfForUser called');
  console.log('⏰ Timestamp:', new Date().toISOString());

  try {
    const user = await User.findById(userId);
    if (!user) {
      console.warn('❌ [BG] User not found for bulk PDF processing:', userId);
      return;
    }

    console.log('📎 [BG] PDF file details:', {
      originalName,
      size: fileBuffer.length,
    });

    console.log('👤 [BG] User info for bulk PDF:', {
      id: user?._id,
      name: user?.name,
      email: user?.email,
    });

    const analysis = await analyzeStatementPdfWithOpenAI(fileBuffer, user.name);

    if (!analysis || !Array.isArray(analysis.transactions) || analysis.transactions.length === 0) {
      console.log('⚠️ [BG] No transactions extracted from statement');
      return;
    }

    console.log('✅ [BG] Transactions extracted:', analysis.transactions.length);

    let createdCount = 0;
    let totalAmount = 0;
    let totalTax = 0;
    const touchedMonths = new Set();

    analysis.transactions.forEach((tx, index) => {
      const amount = Number(tx.amount) || 0;
      const dateString = tx.date || new Date().toISOString().split('T')[0];
      const date = new Date(dateString);
      const safeDate = isNaN(date.getTime()) ? new Date() : date;

      const receipt = user.addReceipt({
        date: safeDate,
        description: tx.description || 'Transaction from statement',
        amount,
        currency: tx.currency || 'NGN',
        category: tx.category || 'other',
        merchant: tx.merchant || 'Statement transaction',
        taxDeductible: tx.taxDeductible,
        taxRate: tx.taxRate,
        taxAmount: tx.taxAmount,
        receiptNumber: tx.reference || `STMT${Date.now()}_${index + 1}`,
        userContext: 'Bulk PDF statement upload',
        imagePath: null,
        type: tx.type || 'expense' // Save extracted type
      });

      createdCount += 1;
      totalAmount += receipt.amount || 0;
      totalTax += receipt.taxAmount || 0;

      const monthKey = `${safeDate.getFullYear()}-${safeDate.getMonth()}`;
      touchedMonths.add(monthKey);
    });

    touchedMonths.forEach((key) => {
      const [yearStr, monthStr] = key.split('-');
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      if (!isNaN(year) && !isNaN(month)) {
        // Calculate new tax liability for this month based on updated income
        updateMonthlyPaymentAndTax(user, month, year);
      }
    });

    await user.save();

    emitToUser(user._id, 'receipts:changed', {});
    emitToUser(user._id, 'dashboard:changed', {});
    emitToUser(user._id, 'bulk-import:completed', {
      createdReceipts: createdCount,
      totalAmount: analysis.totalAmount || totalAmount,
      totalTax: analysis.totalTax || totalTax,
      message: `Imported ${createdCount} transactions from statement.`,
    });

    console.log('✅ [BG] Bulk PDF processing complete:', {
      createdCount,
      totalAmount,
      totalTax,
    });

  } catch (error) {
    console.error('❌ [BG] Bulk PDF processing error:', error.message);
    console.error('📋 [BG] Error stack:', error.stack);
  }
}

// Process bulk transactions from PDF statement with AI (non-blocking)
const processBulkTransactionsPdf = async (req, res) => {
  console.log('\n📄 processBulkTransactionsPdf called');
  console.log('⏰ Timestamp:', new Date().toISOString());

  try {
    if (!req.file) {
      console.log('❌ No PDF file provided');
      return res.status(400).json({
        success: false,
        message: 'No PDF file provided',
      });
    }

    const user = req.user;
    const userId = user?._id;

    console.log('📎 Scheduling background PDF processing:', {
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      userId,
    });

    // Copy buffer so it is safe to use asynchronously
    const bufferCopy = Buffer.from(req.file.buffer);
    const originalName = req.file.originalname;

    // Run heavy work in the background, outside the request lifecycle
    setImmediate(() => {
      processBulkTransactionsPdfForUser(userId, bufferCopy, originalName).catch((err) => {
        console.error('❌ [BG] Unhandled error in bulk PDF processing task:', err);
      });
    });

    // Respond immediately so the user can continue using the app
    return res.json({
      success: true,
      message:
        'Your statement is being processed in the background. You will see new receipts appear when it is complete.',
    });
  } catch (error) {
    console.error('❌ Bulk PDF scheduling error:', error.message);
    console.error('📋 Error stack:', error.stack);

    return res.status(500).json({
      success: false,
      message: 'Error starting account statement processing. Please try again.',
    });
  }
};

// Get all receipts for authenticated user
const getUserReceipts = async (req, res) => {
  try {
    const user = req.user;

    console.log('📋 Fetching receipts for user:', user.phone);

    // Use toObject() with transform to get proper receipt data with IDs
    const userObject = user.toObject();

    const receipts = userObject.taxRecords.map((record, index) => {
      // Generate a stable ID - try multiple sources
      let receiptId;

      if (record._id) {
        receiptId = record._id.toString();
      } else if (record.id) {
        receiptId = record.id.toString();
      } else {
        // Fallback: create a stable ID based on content
        const stableId = `${user._id}_${record.date}_${record.merchant}_${record.amount}_${index}`;
        receiptId = Buffer.from(stableId).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 24);
      }

      return {
        id: receiptId,
        date: record.date,
        description: record.description,
        amount: record.amount,
        currency: record.currency,
        category: record.category,
        merchant: record.merchant,
        taxDeductible: record.taxDeductible,
        taxRate: record.taxRate,
        taxAmount: record.taxAmount,
        receiptNumber: record.receiptNumber,
        userContext: record.userContext,
        imagePath: record.imagePath
      };
    });

    console.log(`✅ Found ${receipts.length} receipts for user ${user.phone}`);
    console.log('📋 Receipt IDs:', receipts.map(r => ({ id: r.id, merchant: r.merchant })));

    res.json({
      success: true,
      receipts: receipts
    });

  } catch (error) {
    console.error('Get receipts error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching receipts'
    });
  }
};

// Update receipt
const updateReceipt = async (req, res) => {
  try {
    const { receiptId } = req.params;
    const updates = req.body;
    const user = req.user;

    console.log('🔄 Updating receipt:', receiptId);
    console.log('📝 Update data:', updates);

    if (!receiptId) {
      return res.status(400).json({
        success: false,
        message: 'Receipt ID is required'
      });
    }

    let receipt;
    let receiptIndex = -1;

    // Try multiple approaches to find the receipt
    if (mongoose.Types.ObjectId.isValid(receiptId)) {
      // Try to find by Mongoose ObjectId
      receipt = user.taxRecords.id(receiptId);
    }

    // If not found by ObjectId, try to find by string ID
    if (!receipt) {
      receiptIndex = user.taxRecords.findIndex(record => {
        const recordId = record._id ? record._id.toString() :
          record.id ? record.id.toString() :
            `receipt_${record.date}_${record.merchant}_${record.amount}`;
        return recordId === receiptId;
      });

      if (receiptIndex !== -1) {
        receipt = user.taxRecords[receiptIndex];
      }
    }

    if (!receipt) {
      console.log('❌ Receipt not found with ID:', receiptId);
      console.log('📋 Available receipt IDs:', user.taxRecords.map((r, i) => {
        const id = r._id ? r._id.toString() :
          r.id ? r.id.toString() :
            `receipt_${r.date}_${r.merchant}_${r.amount}`;
        return { index: i, merchant: r.merchant, id: id };
      }));
      return res.status(404).json({
        success: false,
        message: 'Receipt not found'
      });
    }

    // Update receipt fields
    if (updates.merchantName !== undefined) receipt.merchant = updates.merchantName;
    if (updates.amount !== undefined) {
      receipt.amount = parseFloat(updates.amount);
      // Recalculate VAT if amount changed and VAT not explicitly provided
      if (updates.vat === undefined) {
        receipt.taxAmount = receipt.amount * receipt.taxRate;
      }
    }
    if (updates.vat !== undefined) receipt.taxAmount = parseFloat(updates.vat);
    if (updates.date !== undefined) receipt.date = new Date(updates.date);
    if (updates.description !== undefined) receipt.description = updates.description;
    if (updates.category !== undefined) receipt.category = updates.category;
    if (updates.taxDeductible !== undefined) receipt.taxDeductible = updates.taxDeductible;
    if (updates.receiptNumber !== undefined) receipt.receiptNumber = updates.receiptNumber;
    if (updates.userContext !== undefined) receipt.userContext = updates.userContext;

    // Save user
    await user.save();

    emitToUser(user._id, 'receipts:changed', {});
    emitToUser(user._id, 'dashboard:changed', {});

    // Update monthly payment record if date changed
    if (updates.date) {
      const receiptDate = new Date(updates.date);
      await updateMonthlyPayment(user, receiptDate.getMonth(), receiptDate.getFullYear());
    }

    console.log('✅ Receipt updated successfully');

    // Get the updated receipt ID
    const updatedReceiptId = receipt._id ? receipt._id.toString() :
      receipt.id ? receipt.id.toString() :
        `receipt_${receipt.date}_${receipt.merchant}_${receipt.amount}`;

    res.json({
      success: true,
      message: 'Receipt updated successfully',
      receipt: {
        id: updatedReceiptId,
        date: receipt.date,
        description: receipt.description,
        amount: receipt.amount,
        currency: receipt.currency,
        category: receipt.category,
        merchant: receipt.merchant,
        taxDeductible: receipt.taxDeductible,
        taxRate: receipt.taxRate,
        taxAmount: receipt.taxAmount,
        receiptNumber: receipt.receiptNumber,
        userContext: receipt.userContext,
        imagePath: receipt.imagePath
      }
    });

  } catch (error) {
    console.error('Update receipt error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating receipt'
    });
  }
};

// Delete receipt
const deleteReceipt = async (req, res) => {
  try {
    const { receiptId } = req.params;
    const user = req.user;

    console.log('🗑️ Deleting receipt:', receiptId);

    if (!receiptId) {
      return res.status(400).json({
        success: false,
        message: 'Receipt ID is required'
      });
    }

    let receiptFound = false;
    let receiptDate;

    // Try multiple approaches to find and delete the receipt
    if (mongoose.Types.ObjectId.isValid(receiptId)) {
      // Try to delete by Mongoose ObjectId
      const receipt = user.taxRecords.id(receiptId);
      if (receipt) {
        receiptDate = new Date(receipt.date);
        user.taxRecords.pull({ _id: receiptId });
        receiptFound = true;
        console.log('✅ Found and deleted receipt by ObjectId');
      }
    }

    // If not found by ObjectId, try to find by string ID and remove by index
    if (!receiptFound) {
      const receiptIndex = user.taxRecords.findIndex(record => {
        const recordId = record._id ? record._id.toString() :
          record.id ? record.id.toString() :
            `receipt_${record.date}_${record.merchant}_${record.amount}`;
        return recordId === receiptId;
      });

      if (receiptIndex !== -1) {
        const receipt = user.taxRecords[receiptIndex];
        receiptDate = new Date(receipt.date);
        user.taxRecords.splice(receiptIndex, 1);
        receiptFound = true;
        console.log('✅ Found and deleted receipt by string ID');
      }
    }

    if (!receiptFound) {
      console.log('❌ Receipt not found with ID:', receiptId);
      console.log('📋 Available receipt IDs:', user.taxRecords.map((r, i) => {
        const id = r._id ? r._id.toString() :
          r.id ? r.id.toString() :
            `receipt_${r.date}_${r.merchant}_${r.amount}`;
        return { index: i, merchant: r.merchant, id: id };
      }));
      return res.status(404).json({
        success: false,
        message: 'Receipt not found'
      });
    }

    // Save user
    await user.save();

    // Update monthly payment record
    if (receiptDate) {
      await updateMonthlyPayment(user, receiptDate.getMonth(), receiptDate.getFullYear());
    }

    emitToUser(user._id, 'receipts:changed', {});
    emitToUser(user._id, 'dashboard:changed', {});

    console.log('✅ Receipt deleted successfully');

    res.json({
      success: true,
      message: 'Receipt deleted successfully'
    });

  } catch (error) {
    console.error('Delete receipt error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting receipt'
    });
  }
};

// Helper function to update monthly payment records
async function updateMonthlyPayment(user, month, year) {
  try {
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

    if (!user.monthlyPayments) {
      user.monthlyPayments = [];
    }

    // Get records for this month
    const monthRecords = user.taxRecords.filter(record => {
      const recordDate = new Date(record.date);
      return recordDate.getMonth() === month && recordDate.getFullYear() === year;
    });

    const totalTax = monthRecords.reduce((sum, r) => sum + r.taxAmount, 0);
    const totalSpent = monthRecords.reduce((sum, r) => sum + r.amount, 0);

    // Find or create payment record
    let payment = user.monthlyPayments.find(p => p.month === monthKey);

    if (payment) {
      payment.totalTax = totalTax;
      payment.totalSpent = totalSpent;
      payment.receiptsCount = monthRecords.length;
    } else if (monthRecords.length > 0) {
      payment = {
        month: monthKey,
        year: year,
        totalTax: totalTax,
        paidAmount: 0,
        currency: 'NGN',
        isPaid: false,
        receiptsCount: monthRecords.length,
        totalSpent: totalSpent
      };
      user.monthlyPayments.push(payment);
    }

    // Remove payment record if no receipts
    if (monthRecords.length === 0) {
      user.monthlyPayments = user.monthlyPayments.filter(p => p.month !== monthKey);
    }

  } catch (error) {
    console.error('Update monthly payment error:', error);
  }
}

// Enhanced helper to update monthly payment and CALCULATE INCOME TAX
function updateMonthlyPaymentAndTax(user, month, year) {
  try {
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

    if (!user.monthlyPayments) {
      user.monthlyPayments = [];
    }

    // Get records for this month
    const monthRecords = user.taxRecords.filter(record => {
      const recordDate = new Date(record.date);
      return recordDate.getMonth() === month && recordDate.getFullYear() === year;
    });

    // 1. Calculate Aggregates
    const expenses = monthRecords.filter(r => r.type !== 'income');
    const income = monthRecords.filter(r => r.type === 'income');

    const totalSpent = expenses.reduce((sum, r) => sum + r.amount, 0);
    const totalIncome = income.reduce((sum, r) => sum + r.amount, 0);

    // 2. Calculate Tax Liability (PIT) if there is income
    // Otherwise fallback to sum of VAT expenses if zero income (legacy behavior) 
    // OR just keep it 0 if strictly PIT. 
    // For now: IF totalIncome > 0, use Tax Calc. ELSE use existing expense tax logic.
    let totalTax = 0;

    if (totalIncome > 0) {
      // Calculate PIT based on Monthly Income x 12
      const taxResult = calculateFromMonthly({ monthlyGross: totalIncome });
      totalTax = taxResult.monthlyTax; // Use the monthly portion of the annual tax
    } else {
      // Fallback: Sum of expense VAT (legacy/expense tracking only mode)
      totalTax = expenses.reduce((sum, r) => sum + (r.taxAmount || 0), 0);
    }

    // Find or create payment record
    let payment = user.monthlyPayments.find(p => p.month === monthKey);

    if (payment) {
      payment.totalTax = totalTax;
      payment.totalSpent = totalSpent;
      payment.receiptsCount = monthRecords.length;
    } else if (monthRecords.length > 0) {
      payment = {
        month: monthKey,
        year: year,
        totalTax: totalTax, // Now storing PIT if income exists
        paidAmount: 0,
        currency: 'NGN',
        isPaid: false,
        receiptsCount: monthRecords.length,
        totalSpent: totalSpent
      };
      user.monthlyPayments.push(payment);
    }

    // Remove payment record if no receipts
    if (monthRecords.length === 0) {
      user.monthlyPayments = user.monthlyPayments.filter(p => p.month !== monthKey);
    }

  } catch (error) {
    console.error('Update monthly payment error:', error);
  }
}

module.exports = {
  addReceipt,
  processReceiptImage,
  processBulkTransactionsPdf,
  getUserReceipts,
  updateReceipt,
  deleteReceipt
};
