const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const QRCode = require('qrcode-terminal');
const User = require('../models/User');
const { analyzeReceiptWithOpenAI } = require('./openaiService');
const { parseManualReceipt } = require('./taxCalculator');
const {
  getUserTaxStatus,
  generateTaxSummaryMessage,
  generateDetailedTaxMessage,
  getMonthlyPayment
} = require('./userService');
const { generateTaxReport } = require('./pdfService');
const { calculateTotalTax, calculateCurrentMonthTax, calculateTaxByCategory } = require('./taxCalculator');
const path = require('path');
const fs = require('fs');

// WhatsApp Client
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

client.on('qr', (qr) => {
  console.log('QR RECEIVED', qr);
  QRCode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('WhatsApp Client is ready!');
  startPeriodicTaxReminders();
  startMonthlyReportSystem();
});

client.on('authenticated', () => {
  console.log('WhatsApp Client authenticated!');
});

// Periodic tax reminder system
async function startPeriodicTaxReminders() {
  setInterval(async () => {
    try {
      const users = await User.find({});
      const now = new Date();

      for (const user of users) {
        // Skip if reminded in last 7 days
        if (user.lastTaxReminder && (now - user.lastTaxReminder) < 7 * 24 * 60 * 60 * 1000) {
          continue;
        }

        const totalTax = calculateTotalTax(user.taxRecords);
        const totalAmount = user.taxRecords.reduce((sum, r) => sum + r.amount, 0);

        // Send reminder if tax is significant (over ₦10,000)
        if (totalTax > 10000) {
          const firstName = user.name.split(' ')[0];
          const chatId = `${user.phone}@c.us`;

          const messages = [
            `Hey ${firstName}! 👋 Just checking in - your tax is at ₦${totalTax.toLocaleString('en-NG', { maximumFractionDigits: 2 })} now. Want me to generate a report?`,
            `Hi ${firstName}! Your receipts are adding up nicely. You've got ₦${totalTax.toLocaleString('en-NG', { maximumFractionDigits: 2 })} in VAT so far. Type "report" anytime to see the full breakdown!`,
            `${firstName}, heads up! Your tax total is ₦${totalTax.toLocaleString('en-NG', { maximumFractionDigits: 2 })}. It's a good time to review your receipts. Type "report" when you're ready!`
          ];

          const randomMessage = messages[Math.floor(Math.random() * messages.length)];

          await client.sendMessage(chatId, randomMessage);

          user.lastTaxReminder = now;
          await user.save();
        }
      }
    } catch (error) {
      console.error('Reminder error:', error);
    }
  }, 6 * 60 * 60 * 1000); // Every 6 hours
}

// Monthly report and payment reminder system
async function startMonthlyReportSystem() {
  // Check every day at 9 AM
  setInterval(async () => {
    try {
      const now = new Date();
      const isEndOfMonth = now.getDate() >= 28; // Start reminding from 28th
      const hour = now.getHours();

      // Only run at 9 AM
      if (hour !== 9) return;

      if (isEndOfMonth) {
        const users = await User.find({});

        for (const user of users) {
          // Skip if already sent report this month
          if (user.lastMonthlyReport) {
            const lastReport = new Date(user.lastMonthlyReport);
            if (lastReport.getMonth() === now.getMonth() && lastReport.getFullYear() === now.getFullYear()) {
              continue;
            }
          }

          const currentMonth = calculateCurrentMonthTax(user.taxRecords);

          if (currentMonth.totalTax > 0) {
            const firstName = user.name.split(' ')[0];
            const chatId = `${user.phone}@c.us`;
            const monthName = now.toLocaleString('en-NG', { month: 'long', year: 'numeric' });

            // Create/update monthly payment record
            await getMonthlyPayment(user, now.getMonth(), now.getFullYear());

            let message = `Hey ${firstName}! 📅 Month-end check-in for ${monthName}\n\n`;
            message += `📊 Your Summary:\n`;
            message += `• Receipts: ${currentMonth.receiptsCount}\n`;
            message += `• Total Spent: ₦${currentMonth.totalSpent.toLocaleString('en-NG', { maximumFractionDigits: 2 })}\n`;
            message += `• VAT Owed: ₦${currentMonth.totalTax.toLocaleString('en-NG', { maximumFractionDigits: 2 })}\n\n`;
            message += `Ready to pay? Once you pay, send me the payment receipt with "paid" to mark it! 💳\n\n`;
            message += `Type "report" for your full breakdown.`;

            await client.sendMessage(chatId, message);

            user.lastMonthlyReport = now;
            await user.save();
          }
        }
      }
    } catch (error) {
      console.error('Monthly report error:', error);
    }
  }, 60 * 60 * 1000); // Check every hour
}

// WhatsApp Message Handler
client.on('message', async (message) => {
  console.log('Received message:', message.body);
  console.log('From:', message.from);
  try {
    const userPhone = message.from.replace('@c.us', '');
    const user = await User.findOne({ phone: userPhone });

    if (!user) {
      message.reply(`Hey! I'm Eunice, your friendly tax assistant 😊

To start tracking your receipts, you need to register first. Visit our API to register with your phone, TIN, name, and email.

Once you're set up, just send me your receipts and I'll handle the rest!`);
      return;
    }

    const firstName = user.name.split(' ')[0];
    const userMessage = message.body.trim();
    const lowerMessage = userMessage.toLowerCase();

    // Handle payment proof uploads
    if (message.hasMedia && (lowerMessage.includes('paid') || lowerMessage.includes('payment'))) {
      const media = await message.downloadMedia();

      if (media.mimetype.startsWith('image/')) {
        message.reply(`Checking your payment proof ${firstName}... 🔍`);

        try {
          const imageBuffer = Buffer.from(media.data, 'base64');
          const proofFilename = `payment-proof-${Date.now()}.jpg`;
          const proofPath = path.join(__dirname, '../uploads', proofFilename);
          fs.writeFileSync(proofPath, imageBuffer);

          // Determine which month they're paying for
          const now = new Date();
          let targetMonth = now.getMonth();
          let targetYear = now.getFullYear();

          // Check if they specified a month in their message
          const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
          for (let i = 0; i < monthNames.length; i++) {
            if (lowerMessage.includes(monthNames[i])) {
              targetMonth = i;
              break;
            }
          }

          // Get or create the monthly payment record
          let payment = await getMonthlyPayment(user, targetMonth, targetYear);

          // Update payment record
          const paymentIndex = user.monthlyPayments.findIndex(p => p.month === payment.month);
          if (paymentIndex !== -1) {
            user.monthlyPayments[paymentIndex].isPaid = true;
            user.monthlyPayments[paymentIndex].paidDate = now;
            user.monthlyPayments[paymentIndex].paymentProof = proofFilename;
            user.monthlyPayments[paymentIndex].paidAmount = user.monthlyPayments[paymentIndex].totalTax;
            await user.save();

            const monthName = new Date(targetYear, targetMonth).toLocaleString('en-NG', { month: 'long', year: 'numeric' });

            message.reply(`Perfect ${firstName}! ✅ Payment recorded for ${monthName}.\n\nAmount: ₦${payment.totalTax.toLocaleString('en-NG', { maximumFractionDigits: 2 })}\n\nAll set! Keep those receipts coming! 😊`);
          }
        } catch (error) {
          console.error('Payment proof error:', error);
          message.reply(`Had trouble saving that ${firstName}. Try again? 😅`);
        }
        return;
      }
    }

    // Handle image messages (receipts)
    if (message.hasMedia) {
      const media = await message.downloadMedia();

      if (media.mimetype.startsWith('image/')) {
        message.reply(`On it ${firstName}! Give me a sec to check that receipt... 🔍`);

        try {
          const imageBuffer = Buffer.from(media.data, 'base64');

          // Get the caption/text that came with the image
          const imageCaption = message.body || '';

          const analysis = await analyzeReceiptWithOpenAI(imageBuffer, imageCaption, user.name, imageCaption);

          const taxRecord = {
            description: analysis.description,
            amount: analysis.amount,
            currency: analysis.currency,
            category: analysis.category,
            merchant: analysis.merchant,
            taxDeductible: analysis.taxDeductible,
            taxRate: analysis.taxRate,
            taxAmount: analysis.taxAmount,
            receiptImage: `receipt-${Date.now()}.jpg`,
            userContext: analysis.userContext
          };

          user.taxRecords.push(taxRecord);
          await user.save();

          const symbol = analysis.currency === 'NGN' ? '₦' : analysis.currency === 'USD' ? '$' : analysis.currency;
          const totalTax = calculateTotalTax(user.taxRecords);

          let response = `Got it ${firstName}! ✅\n\n`;
          response += `${taxRecord.merchant}\n`;
          response += `${symbol}${taxRecord.amount.toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;

          if (taxRecord.taxAmount > 0) {
            response += ` (VAT: ${symbol}${taxRecord.taxAmount.toLocaleString('en-NG', { maximumFractionDigits: 2 })})`;
          }

          response += `\nCategory: ${taxRecord.category}`;

          if (taxRecord.taxDeductible) {
            response += ` - Tax deductible ✨`;
          }

          response += `\n\nYour total tax so far: ${symbol}${totalTax.toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;

          // Friendly nudge if tax is getting high
          if (totalTax > 50000) {
            response += `\n\nThat's building up! Want me to generate your report? Just type "report" 📊`;
          }

          message.reply(response);
        } catch (error) {
          console.error('Receipt error:', error);
          message.reply(`Hmm, having trouble with that one ${firstName}. Can you type the details instead? Like "5000 lunch at restaurant" 😊`);
        }
      }
    }
    // Manual receipt entry
    else if (/\d/.test(userMessage) && userMessage.length > 3 && !userMessage.toLowerCase().includes('report') && !userMessage.toLowerCase().includes('status')) {
      const analysis = parseManualReceipt(userMessage);

      const taxRecord = {
        description: analysis.description,
        amount: analysis.amount,
        currency: analysis.currency,
        category: analysis.category,
        merchant: analysis.merchant,
        taxDeductible: analysis.taxDeductible,
        taxRate: analysis.taxRate,
        taxAmount: analysis.taxAmount
      };

      user.taxRecords.push(taxRecord);
      await user.save();

      const totalTax = calculateTotalTax(user.taxRecords);

      let response = `Added ${firstName}! 👍\n\n`;
      response += `₦${taxRecord.amount.toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;

      if (taxRecord.taxAmount > 0) {
        response += ` (VAT: ₦${taxRecord.taxAmount.toLocaleString('en-NG', { maximumFractionDigits: 2 })})`;
      }

      response += `\n${taxRecord.category}`;

      if (taxRecord.taxDeductible) {
        response += ` - Deductible ✨`;
      }

      response += `\n\nTotal tax: ₦${totalTax.toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;

      message.reply(response);
    }
    // ========== ENHANCED DATA QUERY COMMANDS ==========
    else if (userMessage.toLowerCase().includes('how much tax') || userMessage.toLowerCase().includes('tax owe') || userMessage.toLowerCase().includes('tax do i owe')) {
      const taxStatus = await getUserTaxStatus(user);
      const messageText = generateTaxSummaryMessage(taxStatus, firstName);
      message.reply(messageText);
    }
    else if (userMessage.toLowerCase().includes('what\'s my tax') || userMessage.toLowerCase().includes('my tax look') || userMessage.toLowerCase().includes('tax status')) {
      const taxStatus = await getUserTaxStatus(user);
      const messageText = generateTaxSummaryMessage(taxStatus, firstName);
      message.reply(messageText);
    }
    else if (userMessage.toLowerCase().includes('tax breakdown') || userMessage.toLowerCase().includes('detailed tax')) {
      const taxStatus = await getUserTaxStatus(user);
      const messageText = generateDetailedTaxMessage(taxStatus, firstName);
      message.reply(messageText);
    }
    else if (userMessage.toLowerCase().includes('unpaid') || userMessage.toLowerCase().includes('outstanding')) {
      const taxStatus = await getUserTaxStatus(user);

      if (taxStatus.unpaidMonths.length === 0) {
        message.reply(`Great news ${firstName}! You're all caught up on payments. No outstanding taxes! 🎉`);
      } else {
        let response = `Here are your outstanding payments ${firstName}:\n\n`;

        taxStatus.unpaidMonths.forEach(month => {
          response += `• ${month.monthName}: ₦${month.taxAmount.toLocaleString('en-NG', { maximumFractionDigits: 2 })}\n`;
        });

        response += `\nTotal Outstanding: ₦${taxStatus.unpaidMonths.reduce((sum, m) => sum + m.taxAmount, 0).toLocaleString('en-NG', { maximumFractionDigits: 2 })}\n\n`;
        response += `Once you pay, send me the payment receipt with "paid" to mark it as settled!`;

        message.reply(response);
      }
    }
    else if (userMessage.toLowerCase().includes('current month') || userMessage.toLowerCase().includes('this month')) {
      const currentMonthData = calculateCurrentMonthTax(user.taxRecords);

      let response = `📅 *Current Month Summary for ${firstName}*\n\n`;
      response += `• Receipts: ${currentMonthData.receiptsCount}\n`;
      response += `• Total Spent: ₦${currentMonthData.totalSpent.toLocaleString('en-NG', { maximumFractionDigits: 2 })}\n`;
      response += `• VAT Owed: ₦${currentMonthData.totalTax.toLocaleString('en-NG', { maximumFractionDigits: 2 })}\n\n`;

      if (currentMonthData.receiptsCount === 0) {
        response += `No receipts yet this month! Send me your receipts to start tracking.`;
      } else {
        response += `Keep those receipts coming ${firstName}!`;
      }

      message.reply(response);
    }
    else if (userMessage.toLowerCase().includes('category') || userMessage.toLowerCase().includes('categories')) {
      const categoryBreakdown = calculateTaxByCategory(user.taxRecords);

      let response = `🏷️ *Spending by Category for ${firstName}*\n\n`;

      Object.entries(categoryBreakdown).forEach(([category, data]) => {
        if (data.count > 0) {
          response += `• ${category.charAt(0).toUpperCase() + category.slice(1)}: ${data.count} receipts\n`;
          response += `  Amount: ₦${data.totalAmount.toLocaleString('en-NG', { maximumFractionDigits: 2 })}\n`;
          response += `  VAT: ₦${data.totalTax.toLocaleString('en-NG', { maximumFractionDigits: 2 })}\n\n`;
        }
      });

      if (Object.keys(categoryBreakdown).length === 0) {
        response = `No category data yet ${firstName}! Send me some receipts to see your spending breakdown.`;
      }

      message.reply(response);
    }
    else if (userMessage.toLowerCase().includes('receipts list') || userMessage.toLowerCase().includes('my receipts')) {
      const records = user.taxRecords.slice(-10); // Last 10 receipts

      if (records.length === 0) {
        message.reply(`No receipts yet ${firstName}! Send me some receipts or type amounts like "5000 lunch" to get started 😊`);
        return;
      }

      let response = `📋 *Your Recent Receipts (${records.length} total)*\n\n`;

      records.reverse().forEach((record, index) => {
        const date = new Date(record.date).toLocaleDateString('en-NG');
        response += `${index + 1}. ${date} - ${record.merchant}\n`;
        response += `   ₦${record.amount.toLocaleString('en-NG', { maximumFractionDigits: 2 })} (VAT: ₦${(record.taxAmount || 0).toLocaleString('en-NG', { maximumFractionDigits: 2 })})\n`;
        response += `   ${record.description}\n\n`;
      });

      response += `Type "report" for full PDF report with all ${user.taxRecords.length} receipts.`;

      message.reply(response);
    }
    // ========== END ENHANCED DATA QUERY COMMANDS ==========
    else if (userMessage.toLowerCase().includes('report') || userMessage.toLowerCase().includes('summary')) {
      const records = user.taxRecords;

      if (records.length === 0) {
        message.reply(`No receipts yet ${firstName}! Send me some receipts or type amounts like "5000 lunch" to get started 😊`);
        return;
      }

      message.reply(`Creating your report ${firstName}... 📄`);

      try {
        const pdfPath = await generateTaxReport(user, records);
        const media = MessageMedia.fromFilePath(pdfPath);

        const totalTax = calculateTotalTax(records);
        await message.reply(media, undefined, {
          caption: `Here's your full tax report ${firstName}! Total VAT: ₦${totalTax.toLocaleString('en-NG', { maximumFractionDigits: 2 })} 📊`
        });

        setTimeout(() => {
          if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
        }, 30000);

      } catch (error) {
        console.error('PDF error:', error);
        message.reply(`Something went wrong generating that report ${firstName}. Give me a moment and try again? 😅`);
      }
    }
    else if (userMessage.toLowerCase().includes('payments') || userMessage.toLowerCase().includes('payment history')) {
      if (!user.monthlyPayments || user.monthlyPayments.length === 0) {
        message.reply(`No payment history yet ${firstName}! Once you make payments and mark them with "paid", they'll appear here.`);
        return;
      }

      let response = `💳 *Payment History for ${firstName}*\n\n`;

      user.monthlyPayments.forEach(payment => {
        const status = payment.isPaid ? '✅ Paid' : '❌ Unpaid';
        response += `• ${payment.month}: ₦${payment.totalTax.toLocaleString('en-NG', { maximumFractionDigits: 2 })} - ${status}\n`;
      });

      message.reply(response);
    }
    else if (userMessage.toLowerCase().includes('help') || userMessage.toLowerCase().includes('menu')) {
      const totalReceipts = user.taxRecords.length;
      const totalAmount = user.taxRecords.reduce((sum, r) => sum + r.amount, 0);
      const currentMonthData = calculateCurrentMonthTax(user.taxRecords);

      const helpText = `Hey ${firstName}! Here's what I can do:\n\n`;
      const options = `📸 Send receipt photo (with text for context)\n`;
      const manual = `✍️ Type "5000 lunch" to add manually\n`;
      const report = `📊 Type "report" for your tax summary\n`;
      const status = `📈 Type "status" for quick overview\n`;
      const taxOwe = `💰 Type "how much tax do I owe" for current tax\n`;
      const breakdown = `📋 Type "tax breakdown" for detailed analysis\n`;
      const unpaid = `⚠️ Type "unpaid" for outstanding payments\n`;
      const receipts = `📝 Type "receipts" for recent receipts list\n`;
      const payments = `💳 Type "payments" for payment history\n`;
      const payAction = `✅ Send payment receipt with "paid" to mark as paid\n\n`;
      const current = `This month: ${currentMonthData.receiptsCount} receipt${currentMonthData.receiptsCount !== 1 ? 's' : ''}, ₦${currentMonthData.totalTax.toLocaleString('en-NG', { maximumFractionDigits: 2 })} VAT`;

      message.reply(helpText + options + manual + report + status + taxOwe + breakdown + unpaid + receipts + payments + payAction + current);
    }
    else if (userMessage.toLowerCase().includes('status') || userMessage.toLowerCase().includes('stats')) {
      const taxStatus = await getUserTaxStatus(user);
      const messageText = generateTaxSummaryMessage(taxStatus, firstName);
      message.reply(messageText);
    }
    else if (userMessage.toLowerCase().includes('delete') || userMessage.toLowerCase().includes('clear') || userMessage.toLowerCase().includes('reset')) {
      user.taxRecords = [];
      user.monthlyPayments = [];
      await user.save();
      message.reply(`Done ${firstName}! All cleared out. Fresh start! 🎉`);
    }
    else if (userMessage.toLowerCase().includes('hi') || userMessage.toLowerCase().includes('hello') || userMessage.toLowerCase().includes('hey')) {
      const taxStatus = await getUserTaxStatus(user);

      const greetings = [
        `Hey ${firstName}! You have ${taxStatus.totalReceipts} receipts totaling ₦${taxStatus.totalTaxAllTime.toLocaleString('en-NG', { maximumFractionDigits: 2 })} in VAT. How can I help? 😊`,
        `Hi ${firstName}! Ready to track some receipts? You've got ${taxStatus.currentMonth.receiptsCount} this month so far! 📸`,
        `Hello ${firstName}! Your tax is at ₦${taxStatus.totalTaxAllTime.toLocaleString('en-NG', { maximumFractionDigits: 2 })} across ${taxStatus.totalReceipts} receipts. Type "help" to see what I can do!`
      ];
      message.reply(greetings[Math.floor(Math.random() * greetings.length)]);
    }
    else {
      // General conversational AI response
      const aiResponse = await analyzeReceiptWithOpenAI(null, userMessage, user.name);
      message.reply(aiResponse.description);
    }

  } catch (error) {
    console.error('Message error:', error);
    message.reply('Oops, something went wrong on my end. Try again? 😅');
  }
});

function initializeWhatsApp() {
  client.initialize();
}

module.exports = { initializeWhatsApp, client };