const User = require('../models/User');
const { getUserTaxStatus } = require('../services/userService');
const { generateTaxReport } = require('../services/pdfService');
const notificationService = require('../services/notificationService');
const { initializeWhatsApp, client } = require('../services/whatsappService');
const fs = require('fs');
const path = require('path');
const { emitToUser } = require('../services/socketService');
const { admin } = require('../config/firebase');

// Register new user
const registerUser = async (req, res) => {
  try {
    const { phone, tin, name, email, password, profession, taxType, incomeRange } = req.body;

    if (!phone || !tin || !name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'All fields required: phone, tin, name, email, password'
      });
    }

    // Validate password strength
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // Validate Nigerian phone number format
    const phoneRegex = /^(?:234|0)[789][01]\d{8}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid Nigerian phone number'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    const existingUser = await User.findOne({
      $or: [{ phone }, { tin }, { email }]
    });

    if (existingUser) {
      let field = '';
      if (existingUser.phone === phone) field = 'phone number';
      else if (existingUser.tin === tin) field = 'TIN';
      else if (existingUser.email === email) field = 'email';

      return res.status(400).json({
        success: false,
        message: `User with this ${field} already exists`
      });
    }

    const user = new User({
      phone,
      tin,
      name,
      email,
      password,
      profession,
      taxType: taxType || 'PAYE',
      incomeRange
    });

    await user.save();

    // Generate JWT token
    const token = user.generateAuthToken();

    // Send welcome message via WhatsApp
    try {
      const chatId = `${phone}@c.us`;
      const firstName = name.split(' ')[0];
      await client.sendMessage(chatId, `Hey ${firstName}! 👋 Welcome to Tax Assistant!\n\nI'm Eunice, and I'm here to help you track your receipts and taxes easily.\n\nJust send me your receipt photos (you can add context by typing with the image), or type amounts like "5000 lunch at restaurant".\n\nType "help" anytime if you need me! 😊`);
    } catch (whatsappError) {
      console.error('WhatsApp welcome message error:', whatsappError);
    }

    res.status(201).json({
      success: true,
      message: 'Registration successful! Check WhatsApp for a welcome message.',
      token,
      user: {
        id: user._id,
        phone: user.phone,
        tin: user.tin,
        name: user.name,
        email: user.email,
        profilePhotoUrl: user.profilePhotoUrl,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration'
    });
  }
};

// Login user with phone + password
const loginUser = async (req, res) => {
  try {
    const { phone, password } = req.body;

    console.log('Login attempt received:', {
      phone,
      timestamp: new Date().toISOString(),
    });

    if (!phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Phone and password are required'
      });
    }

    // Find user by phone
    const user = await User.findOne({ phone });
    if (!user) {
      console.warn('Login failed: user not found for phone', { phone });
      return res.status(401).json({
        success: false,
        message: 'Invalid phone number or password'
      });
    }

    // Check if account is active / not suspended / not pending deletion
    if (user.deleteRequestedAt) {
      console.warn('Login failed: account pending deletion', { userId: user._id.toString() });
      return res.status(401).json({
        success: false,
        message: 'Your account is scheduled for deletion. Please contact support if this is unexpected.'
      });
    }

    if (user.isSuspended) {
      console.warn('Login failed: suspended account', { userId: user._id.toString() });
      return res.status(401).json({
        success: false,
        message: user.suspendedReason
          ? `Your account has been suspended: ${user.suspendedReason}`
          : 'Your account has been suspended. Please contact support.'
      });
    }

    if (!user.isActive) {
      console.warn('Login failed: inactive account', { userId: user._id.toString() });
      return res.status(401).json({
        success: false,
        message: 'Your account is currently deactivated. Please contact support.'
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      console.warn('Login failed: invalid password', { userId: user._id.toString() });
      return res.status(401).json({
        success: false,
        message: 'Invalid phone number or password'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT token
    const token = user.generateAuthToken();

    // Send login success push notification
    try {
      const firstName = user.name ? user.name.split(' ')[0] : 'there';
      await notificationService.createNotification({
        user: user._id,
        type: 'system',
        title: 'Welcome back! 👋',
        message: `Hi ${firstName}! You've successfully logged in to Tax-e.`,
        actionable: false,
        metadata: {
          loginTime: new Date().toISOString(),
        }
      });
    } catch (notifError) {
      console.error('Error sending login notification:', notifError);
      // Don't fail the login if notification fails
    }

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        phone: user.phone,
        tin: user.tin,
        name: user.name,
        email: user.email,
        profilePhotoUrl: user.profilePhotoUrl,
        lastLogin: user.lastLogin,
        hasCompletedOnboarding: user.hasCompletedOnboarding
      }
    });

  } catch (error) {
    console.error('Login error:', {
      message: error.message,
    });
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
};

// Login with Google using Firebase ID token
const loginWithGoogle = async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Google login request.'
      });
    }

    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (err) {
      console.error('Firebase ID token verification failed:', {
        code: err.code,
        message: err.message,
      });
      return res.status(401).json({
        success: false,
        message: 'Unable to verify your Google account. Please try again.'
      });
    }

    const email = decodedToken.email;
    const emailVerified = decodedToken.email_verified;
    const displayName = decodedToken.name || decodedToken.displayName;

    if (!email || !emailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Your Google account must have a verified email to sign in.'
      });
    }

    const normalizedEmail = email.toLowerCase();

    // Try to find an existing Tax-E user by email
    let user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      // Auto-create a minimal Tax-E account for this Google user.
      const derivedName = displayName || normalizedEmail.split('@')[0];

      user = new User({
        email: normalizedEmail,
        name: derivedName,
        // phone and tin will be completed later from the profile screen
        phone: undefined,
        tin: undefined,
        isActive: true,
      });

      try {
        await user.save();
        console.log('✅ Auto-created user from Google login:', {
          userId: user._id.toString(),
          email: user.email,
        });
      } catch (createErr) {
        console.error('Error auto-creating user from Google login:', {
          message: createErr.message,
        });
        return res.status(500).json({
          success: false,
          message: 'Could not create your account from Google login. Please try again.'
        });
      }
    }

    // Check if account is active / not suspended / not pending deletion
    if (user.deleteRequestedAt) {
      return res.status(401).json({
        success: false,
        message: 'Your account is scheduled for deletion. Please contact support if this is unexpected.'
      });
    }

    if (user.isSuspended) {
      return res.status(401).json({
        success: false,
        message: user.suspendedReason
          ? `Your account has been suspended: ${user.suspendedReason}`
          : 'Your account has been suspended. Please contact support.'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Your account is currently deactivated. Please contact support.'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT token (same as normal login)
    const token = user.generateAuthToken();

    // Send login success push notification
    try {
      const firstName = user.name ? user.name.split(' ')[0] : 'there';
      const isNewUser = !user.phone || !user.tin;
      await notificationService.createNotification({
        user: user._id,
        type: 'system',
        title: isNewUser ? 'Welcome to Tax-e! 🎉' : 'Welcome back! 👋',
        message: isNewUser
          ? `Hi ${firstName}! Your account was created successfully. Please complete your profile to get started.`
          : `Hi ${firstName}! You've successfully logged in with Google.`,
        actionable: isNewUser,
        metadata: {
          loginTime: new Date().toISOString(),
          loginMethod: 'google',
          isNewUser: isNewUser,
          action: isNewUser ? 'complete_profile' : undefined
        }
      });
    } catch (notifError) {
      console.error('Error sending Google login notification:', notifError);
      // Don't fail the login if notification fails
    }

    return res.json({
      success: true,
      message: user.phone && user.tin
        ? 'Login with Google successful.'
        : 'Welcome! Your account was created from Google. Please complete your profile.',
      token,
      user: {
        id: user._id,
        phone: user.phone,
        tin: user.tin,
        name: user.name,
        email: user.email,
        profilePhotoUrl: user.profilePhotoUrl,
        lastLogin: user.lastLogin,
        hasCompletedOnboarding: user.hasCompletedOnboarding
      },
    });
  } catch (error) {
    console.error('Google login error:', {
      message: error.message,
    });
    return res.status(500).json({
      success: false,
      message: 'Something went wrong during Google login. Please try again.'
    });
  }
};

// Get current user profile (requires authentication)
const getCurrentUser = async (req, res) => {
  try {
    const taxStatus = await getUserTaxStatus(req.user);

    // Generate notifications for the user
    await notificationService.generateUserNotifications(req.user._id);

    res.json({
      success: true,
      user: {
        id: req.user._id,
        phone: req.user.phone,
        tin: req.user.tin,
        name: req.user.name,
        email: req.user.email,
        profilePhotoUrl: req.user.profilePhotoUrl,
        createdAt: req.user.createdAt,
        lastLogin: req.user.lastLogin,
        ...taxStatus
      }
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Get user by phone (admin/public access)
const getUserByPhone = async (req, res) => {
  try {
    const user = await User.findOne({ phone: req.params.phone }).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const taxStatus = await getUserTaxStatus(user);

    res.json({
      success: true,
      user: {
        id: user._id,
        phone: user.phone,
        tin: user.tin,
        name: user.name,
        email: user.email,
        profilePhotoUrl: user.profilePhotoUrl,
        ...taxStatus
      }
    });

  } catch (error) {
    console.error('User fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Get user receipts (authenticated - own data)
const getUserReceipts = async (req, res) => {
  try {
    const user = req.user;

    res.json({
      success: true,
      receipts: user.taxRecords.map(record => ({
        id: record._id ? record._id.toString() : record.id,
        date: record.date,
        description: record.description,
        amount: record.amount,
        currency: record.currency,
        category: record.category,
        merchant: record.merchant,
        taxDeductible: record.taxDeductible,
        taxRate: record.taxRate,
        taxAmount: record.taxAmount,
        userContext: record.userContext,
        receiptImage: record.receiptImage, // Also adding this since it's in your profile response
        receiptNumber: record.receiptNumber, // Adding this as well
        createdAt: record.createdAt // And this for completeness
      }))
    });

  } catch (error) {
    console.error('Receipts fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Generate tax report (authenticated)
const generateUserReport = async (req, res) => {
  try {
    const user = req.user;

    if (user.taxRecords.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No tax records found'
      });
    }

    const pdfPath = await generateTaxReport(user, user.taxRecords);

    res.download(pdfPath, `tax-report-${user.tin}.pdf`, (err) => {
      if (err) {
        console.error('Download error:', err);
      }
      setTimeout(() => {
        if (fs.existsSync(pdfPath)) {
          fs.unlinkSync(pdfPath);
        }
      }, 5000);
    });

  } catch (error) {
    console.error('Report generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating report'
    });
  }
};

// Get user payments (authenticated)
const getUserPayments = async (req, res) => {
  try {
    const user = req.user;

    res.json({
      success: true,
      payments: user.monthlyPayments?.map(payment => ({
        month: payment.month,
        year: payment.year,
        totalTax: payment.totalTax,
        paidAmount: payment.paidAmount,
        currency: payment.currency,
        isPaid: payment.isPaid,
        paidDate: payment.paidDate,
        receiptsCount: payment.receiptsCount,
        totalSpent: payment.totalSpent
      })) || []
    });

  } catch (error) {
    console.error('Payments fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Mark payment as paid (authenticated)
const markPaymentAsPaid = async (req, res) => {
  try {
    const { month, year, amount } = req.body;
    const user = req.user;

    console.log('📥 Mark Payment As Paid - Request:', {
      month, year, amount, user: user._id
    });

    // Create month key in "YYYY-MM" format
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;

    console.log('🔍 Looking for payment with monthKey:', monthKey);
    console.log('📊 Available payments:', user.monthlyPayments?.map(p => ({
      month: p.month,
      type: typeof p.month,
      isPaid: p.isPaid,
      totalTax: p.totalTax
    })));

    // Debug: Check each payment's month value
    user.monthlyPayments?.forEach((payment, index) => {
      console.log(`Payment ${index}:`, {
        storedMonth: payment.month,
        type: typeof payment.month,
        lookingFor: monthKey,
        match: payment.month === monthKey
      });
    });

    // Use find instead of findIndex for better debugging
    const payment = user.monthlyPayments?.find(p => {
      const match = p.month === monthKey;
      console.log(`Comparing: "${p.month}" === "${monthKey}" -> ${match}`);
      return match;
    });

    if (!payment) {
      console.log('❌ Payment record not found for monthKey:', monthKey);

      // Try to create the payment record if it doesn't exist
      const monthRecords = user.taxRecords.filter(record => {
        const recordDate = new Date(record.date);
        const recordMonth = recordDate.getMonth() + 1; // JavaScript months are 0-indexed
        const recordYear = recordDate.getFullYear();
        return recordMonth === month && recordYear === year;
      });

      if (monthRecords.length === 0) {
        return res.status(404).json({
          success: false,
          message: `No receipts found for ${month}/${year}. Please add receipts first.`
        });
      }

      // Create new payment record
      const totalTax = monthRecords.reduce((sum, r) => sum + (r.taxAmount || 0), 0);
      const totalSpent = monthRecords.reduce((sum, r) => sum + (r.amount || 0), 0);

      const newPayment = {
        month: monthKey,
        year: year,
        totalTax: totalTax,
        paidAmount: amount || totalTax,
        currency: 'NGN',
        isPaid: true,
        paidDate: new Date(),
        receiptsCount: monthRecords.length,
        totalSpent: totalSpent
      };

      if (!user.monthlyPayments) {
        user.monthlyPayments = [];
      }

      user.monthlyPayments.push(newPayment);
      await user.save();

      console.log('✅ Created and marked payment as paid:', newPayment);

      return res.json({
        success: true,
        message: 'Payment created and marked as paid successfully',
        payment: newPayment
      });
    }

    // Update existing payment status
    payment.isPaid = true;
    payment.paidDate = new Date();
    payment.paidAmount = amount || payment.totalTax;

    await user.save();

    // Notify user that payments/dashboard data changed
    emitToUser(user._id, 'payments:changed', {});
    emitToUser(user._id, 'dashboard:changed', {});

    console.log('✅ Payment marked as paid successfully:', {
      monthKey: payment.month,
      paidAmount: payment.paidAmount,
      paidDate: payment.paidDate
    });

    res.json({
      success: true,
      message: 'Payment marked as paid successfully',
      payment: payment
    });

  } catch (error) {
    console.error('❌ Mark paid error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while marking payment as paid'
    });
  }
};

// Send tax report summary to user's WhatsApp
const sendReportToWhatsApp = async (req, res) => {
  console.log('📱 WhatsApp Report Request Received:', {
    timestamp: new Date().toISOString(),
    userId: req.user?._id,
    userPhone: req.user?.phone
  });

  let pdfPath; // Declare pdfPath at function scope for cleanup

  try {
    const user = req.user;

    if (!user) {
      console.log('❌ WhatsApp Report - User not authenticated');
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    console.log('👤 WhatsApp Report - User found:', {
      userId: user._id,
      phone: user.phone,
      name: user.name,
      taxRecordsCount: user.taxRecords?.length || 0
    });

    if (!client) {
      console.log('❌ WhatsApp Report - WhatsApp client not initialized');
      return res.status(500).json({
        success: false,
        message: 'WhatsApp client not initialized'
      });
    }

    console.log('✅ WhatsApp Report - WhatsApp client is available');

    if (!user.taxRecords || user.taxRecords.length === 0) {
      console.log('❌ WhatsApp Report - No tax records found for user:', {
        userId: user._id,
        taxRecordsCount: 0
      });
      return res.status(400).json({
        success: false,
        message: 'No tax records found'
      });
    }

    console.log('📊 WhatsApp Report - Processing tax records:', {
      totalRecords: user.taxRecords.length
    });

    // Generate PDF report
    console.log('📄 WhatsApp Report - Generating PDF report...');
    pdfPath = await generateTaxReport(user, user.taxRecords);

    console.log('✅ WhatsApp Report - PDF generated:', {
      pdfPath: pdfPath,
      fileExists: fs.existsSync(pdfPath)
    });

    const chatId = `${user.phone}@c.us`;
    const firstName = user.name ? user.name.split(' ')[0] : 'there';

    console.log('💬 WhatsApp Report - Preparing to send PDF to:', chatId);

    // Send PDF document only
    console.log('📎 WhatsApp Report - Sending PDF document...');

    // Read the PDF file
    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfBase64 = pdfBuffer.toString('base64');

    // Get filename with user info
    const filename = `tax-report-${user.tin}-${new Date().toISOString().split('T')[0]}.pdf`;

    console.log('📁 WhatsApp Report - PDF file details:', {
      filename: filename,
      fileSize: pdfBuffer.length,
      base64Length: pdfBase64.length
    });

    // Import MessageMedia here to avoid scope issues
    const { MessageMedia } = require('whatsapp-web.js');

    // Send as document
    const media = new MessageMedia(
      'application/pdf',
      pdfBase64,
      filename
    );

    // Send simple message with PDF
    await client.sendMessage(chatId, media, {
      caption: `Here is your tax report ${firstName}! 📊`
    });

    console.log('✅ WhatsApp Report - PDF document sent successfully');

    // Clean up the temporary PDF file
    try {
      if (fs.existsSync(pdfPath)) {
        fs.unlinkSync(pdfPath);
        console.log('🧹 WhatsApp Report - Temporary PDF file cleaned up');
      }
    } catch (cleanupError) {
      console.warn('⚠️ WhatsApp Report - Could not clean up temporary file:', cleanupError.message);
    }

    console.log('🎉 WhatsApp Report - Complete success:', {
      chatId: chatId,
      timestamp: new Date().toISOString()
    });

    // FIX: Return proper response
    return res.json({
      success: true,
      message: 'Tax report PDF sent to WhatsApp successfully'
    });

  } catch (error) {
    console.error('❌ WhatsApp Report - Error sending report:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?._id,
      timestamp: new Date().toISOString()
    });

    // Clean up PDF file in case of error
    try {
      if (pdfPath && fs.existsSync(pdfPath)) {
        fs.unlinkSync(pdfPath);
        console.log('🧹 WhatsApp Report - Cleaned up temporary PDF after error');
      }
    } catch (cleanupError) {
      console.warn('⚠️ WhatsApp Report - Could not clean up temporary file after error:', cleanupError.message);
    }

    // FIX: Return proper error response
    return res.status(500).json({
      success: false,
      message: 'Failed to send report to WhatsApp: ' + error.message
    });
  }
};
// Clear user receipts (authenticated)
const clearUserReceipts = async (req, res) => {
  try {
    const user = req.user;

    user.taxRecords = [];
    await user.save();

    emitToUser(user._id, 'receipts:changed', {});
    emitToUser(user._id, 'dashboard:changed', {});

    res.json({
      success: true,
      message: 'All receipts cleared successfully'
    });

  } catch (error) {
    console.error('Clear receipts error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Delete a specific receipt (authenticated)
const deleteReceipt = async (req, res) => {
  try {
    const { receiptId } = req.params;
    const user = req.user;

    if (!receiptId) {
      return res.status(400).json({
        success: false,
        message: 'Receipt ID is required'
      });
    }

    // Find and delete the receipt
    const deletedReceipt = user.deleteReceipt(receiptId);

    if (!deletedReceipt) {
      return res.status(404).json({
        success: false,
        message: 'Receipt not found'
      });
    }

    // Update monthly payments after deletion
    const receiptDate = new Date(deletedReceipt.date);
    user.updateMonthlyPayment(receiptDate.getMonth(), receiptDate.getFullYear());

    await user.save();

    res.json({
      success: true,
      message: 'Receipt deleted successfully',
      deletedReceipt: {
        id: deletedReceipt._id ? deletedReceipt._id.toString() : deletedReceipt.id,
        description: deletedReceipt.description,
        amount: deletedReceipt.amount,
        date: deletedReceipt.date
      }
    });

  } catch (error) {
    console.error('Delete receipt error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during receipt deletion'
    });
  }
};

// Update user profile (authenticated)
const updateUserProfile = async (req, res) => {
  try {
    const { name, email, phone, tin } = req.body;
    const user = req.user;

    const updates = {};
    if (name) updates.name = name;
    if (email) {
      const normalizedEmail = email.toLowerCase();
      // Check if email is already taken by another user
      const existingUser = await User.findOne({ email: normalizedEmail, _id: { $ne: user._id } });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email already taken by another user.'
        });
      }
      updates.email = normalizedEmail;
    }

    // Allow users (especially Google-created) to fill in or update phone + TIN.
    if (phone) {
      const phoneRegex = /^(?:234|0)[789][01]\d{8}$/;
      if (!phoneRegex.test(phone)) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid Nigerian phone number.'
        });
      }

      const existingPhoneUser = await User.findOne({ phone, _id: { $ne: user._id } });
      if (existingPhoneUser) {
        return res.status(400).json({
          success: false,
          message: 'Phone number is already linked to another account.'
        });
      }

      updates.phone = phone;
    }

    if (tin) {
      const normalizedTin = tin.trim();
      const existingTinUser = await User.findOne({ tin: normalizedTin, _id: { $ne: user._id } });
      if (existingTinUser) {
        return res.status(400).json({
          success: false,
          message: 'TIN is already linked to another account.'
        });
      }
      updates.tin = normalizedTin;
    }

    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      updates,
      { new: true, runValidators: true }
    ).select('-password');

    // Notify this user on all connected clients
    emitToUser(user._id, 'user:updated', { user: updatedUser });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser
    });

  } catch (error) {
    console.error('Update profile error:', {
      message: error.message,
    });
    res.status(500).json({
      success: false,
      message: 'Server error during profile update'
    });
  }
};

// Upload or update profile photo (authenticated)
const uploadProfilePhoto = async (req, res) => {
  try {
    const user = req.user;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No photo file provided',
      });
    }

    // Ensure uploads/profile-photos directory exists
    const uploadsRoot = path.join(__dirname, '..', 'uploads');
    const photosDir = path.join(uploadsRoot, 'profile-photos');
    if (!fs.existsSync(photosDir)) {
      fs.mkdirSync(photosDir, { recursive: true });
    }

    const ext = path.extname(req.file.originalname) || '.jpg';
    const fileName = `user-${user._id}-${Date.now()}${ext}`;
    const filePath = path.join(photosDir, fileName);

    // Write the buffer from multer memory storage to disk
    fs.writeFileSync(filePath, req.file.buffer);

    // Build relative URL used by frontend (served from /uploads)
    const relativeUrl = `/uploads/profile-photos/${fileName}`;

    // Delete previous profile photo if present and stored under /uploads
    if (user.profilePhotoUrl && user.profilePhotoUrl.startsWith('/uploads/')) {
      try {
        const oldPath = path.join(__dirname, '..', user.profilePhotoUrl.replace('/uploads', 'uploads'));
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      } catch (cleanupError) {
        console.warn('Could not delete old profile photo:', cleanupError.message);
      }
    }

    user.profilePhotoUrl = relativeUrl;
    await user.save();

    const safeUser = await User.findById(user._id).select('-password');

    // Notify all of this user's active sessions so avatars/dashboard update
    emitToUser(user._id, 'user:updated', { user: safeUser });
    emitToUser(user._id, 'dashboard:changed', {});

    return res.json({
      success: true,
      message: 'Profile photo updated successfully',
      user: safeUser,
    });
  } catch (error) {
    console.error('Upload profile photo error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while uploading profile photo',
    });
  }
};

// Change password (authenticated)
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = req.user;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long'
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password updated successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during password change'
    });
  }
};

// Forgot password using email + TIN (public, rate-limited)
const forgotPassword = async (req, res) => {
  try {
    const { email, tin, newPassword } = req.body;

    if (!email || !tin || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Email, TIN and new password are required'
      });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long'
      });
    }

    const normalizedEmail = email.toLowerCase();
    const normalizedTin = tin.trim();

    const user = await User.findOne({ email: normalizedEmail, tin: normalizedTin });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No account found for the provided email and TIN'
      });
    }

    user.password = newPassword;
    await user.save();

    return res.json({
      success: true,
      message: 'Password reset successfully. You can now log in with your new password.'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during password reset'
    });
  }
};

// Register / update Expo push token (authenticated)
const registerPushToken = async (req, res) => {
  try {
    const { expoPushToken } = req.body;

    if (!expoPushToken) {
      return res.status(400).json({
        success: false,
        message: 'expoPushToken is required',
      });
    }

    req.user.expoPushToken = expoPushToken;
    await req.user.save();

    return res.json({
      success: true,
      message: 'Push token registered successfully',
    });
  } catch (error) {
    console.error('Register push token error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while registering push token',
    });
  }
};

// Delete account (authenticated)
// Instead of immediate hard-delete, mark the account for deletion and
// let a background job/admin flow remove it after a 10-day grace period.
const deleteAccount = async (req, res) => {
  try {
    const user = req.user;

    if (user.deleteRequestedAt) {
      return res.json({
        success: true,
        message: 'Your account is already scheduled for deletion.',
      });
    }

    user.isActive = false;
    user.deleteRequestedAt = new Date();
    // User-initiated delete reason is optional and not required from the client
    user.deleteRequestedReason = req.body?.reason || user.deleteRequestedReason || null;

    await user.save();

    emitToUser(user._id, 'account:deleted', { scheduled: true });

    return res.json({
      success: true,
      message: 'Your account has been scheduled for deletion in 10 days.',
    });
  } catch (error) {
    console.error('Delete account error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while scheduling account deletion',
    });
  }
};

// Get user by card ID (requires authentication)
const getUserById = async (req, res) => {
  try {
    console.log('👤 getUserById called with ID:', req.params.id);
    console.log('👤 Authenticated user:', req.user?._id);

    const user = await User.findById(req.params.id).select('name email phone profession profilePhotoUrl tin createdAt');

    if (!user) {
      console.log('❌ User not found for ID:', req.params.id);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log('✅ User found:', user.name);
    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone, // Maybe hide part of it?
        profession: user.profession,
        photo: user.profilePhotoUrl,
        joinedAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('❌ Get user by ID error:', error);
    console.error('❌ Stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user profile'
    });
  }
};

module.exports = {
  registerUser,
  loginUser,
  loginWithGoogle,
  getCurrentUser,
  getUserByPhone,
  getUserById,
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
};
