const User = require('../models/User');
const { 
  calculateTotalTax, 
  calculateCurrentMonthTax, 
  calculateMonthTax, 
  calculateTaxByCategory 
} = require('./taxCalculator');

// Get user's comprehensive tax status
async function getUserTaxStatus(user) {
  const records = user.taxRecords || [];
  const currentMonthData = calculateCurrentMonthTax(records);
  const categoryBreakdown = calculateTaxByCategory(records);
  
  // Calculate unpaid months
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  
  const unpaidMonths = [];
  
  // Check last 6 months for unpaid taxes
  for (let i = 0; i < 6; i++) {
    const month = (currentMonth - i + 12) % 12;
    const year = month > currentMonth ? currentYear - 1 : currentYear;
    
    const monthData = calculateMonthTax(records, month, year);
    
    if (monthData.totalTax > 0) {
      const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
      const paymentRecord = user.monthlyPayments?.find(p => p.month === monthKey);
      
      if (!paymentRecord || !paymentRecord.isPaid) {
        unpaidMonths.push({
          month: monthKey,
          monthName: new Date(year, month).toLocaleString('en-NG', { month: 'long', year: 'numeric' }),
          taxAmount: monthData.totalTax,
          receiptsCount: monthData.receiptsCount,
          isPaid: false
        });
      }
    }
  }
  
  return {
    totalReceipts: records.length,
    totalSpent: records.reduce((sum, r) => sum + r.amount, 0),
    totalTaxAllTime: calculateTotalTax(records),
    currentMonth: currentMonthData,
    categoryBreakdown: categoryBreakdown,
    unpaidMonths: unpaidMonths,
    deductibleAmount: records.filter(r => r.taxDeductible).reduce((sum, r) => sum + r.amount, 0)
  };
}

// Generate tax summary message
function generateTaxSummaryMessage(taxStatus, firstName) {
  const { currentMonth, totalTaxAllTime, unpaidMonths } = taxStatus;
  
  let message = `Here's your tax situation ${firstName}! 📊\n\n`;
  
  // Current month summary
  message += `📅 *This Month:*\n`;
  message += `• Receipts: ${currentMonth.receiptsCount}\n`;
  message += `• Total Spent: ₦${currentMonth.totalSpent.toLocaleString('en-NG', {maximumFractionDigits: 2})}\n`;
  message += `• VAT Owed: ₦${currentMonth.totalTax.toLocaleString('en-NG', {maximumFractionDigits: 2})}\n\n`;
  
  // All-time summary
  message += `⏳ *All Time:*\n`;
  message += `• Total Receipts: ${taxStatus.totalReceipts}\n`;
  message += `• Total Spent: ₦${taxStatus.totalSpent.toLocaleString('en-NG', {maximumFractionDigits: 2})}\n`;
  message += `• Total VAT: ₦${totalTaxAllTime.toLocaleString('en-NG', {maximumFractionDigits: 2})}\n\n`;
  
  // Unpaid months
  if (unpaidMonths.length > 0) {
    message += `⚠️ *Unpaid Months:*\n`;
    unpaidMonths.forEach(month => {
      message += `• ${month.monthName}: ₦${month.taxAmount.toLocaleString('en-NG', {maximumFractionDigits: 2})}\n`;
    });
    message += `\n`;
  }
  
  // Tax deductible info
  if (taxStatus.deductibleAmount > 0) {
    message += `✨ *Tax Deductible:* ₦${taxStatus.deductibleAmount.toLocaleString('en-NG', {maximumFractionDigits: 2})}\n\n`;
  }
  
  message += `Type "report" for detailed breakdown or "payments" for payment history.`;
  
  return message;
}

// Generate detailed tax breakdown message
function generateDetailedTaxMessage(taxStatus, firstName) {
  const { categoryBreakdown, currentMonth } = taxStatus;
  
  let message = `📈 *Detailed Tax Breakdown for ${firstName}*\n\n`;
  
  // Category breakdown
  message += `🏷️ *By Category:*\n`;
  Object.entries(categoryBreakdown).forEach(([category, data]) => {
    if (data.count > 0) {
      message += `• ${category.charAt(0).toUpperCase() + category.slice(1)}: ${data.count} receipts, ₦${data.totalTax.toLocaleString('en-NG', {maximumFractionDigits: 2})} VAT\n`;
    }
  });
  
  message += `\n`;
  
  // Current month details
  message += `📅 *Current Month Details:*\n`;
  message += `• Total Receipts: ${currentMonth.receiptsCount}\n`;
  message += `• Total Amount: ₦${currentMonth.totalSpent.toLocaleString('en-NG', {maximumFractionDigits: 2})}\n`;
  message += `• VAT Payable: ₦${currentMonth.totalTax.toLocaleString('en-NG', {maximumFractionDigits: 2})}\n\n`;
  
  message += `Need to see specific receipts? Type "receipts" or send "report" for PDF.`;
  
  return message;
}

// Get or create monthly payment record
async function getMonthlyPayment(user, month, year) {
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  
  // Initialize monthlyPayments if it doesn't exist
  if (!user.monthlyPayments) {
    user.monthlyPayments = [];
  }
  
  let payment = user.monthlyPayments.find(p => p.month === monthKey);
  
  if (!payment) {
    // Calculate tax for this month
    const monthRecords = user.taxRecords.filter(record => {
      const recordDate = new Date(record.date);
      return recordDate.getMonth() === month && recordDate.getFullYear() === year;
    });
    
    payment = {
      month: monthKey,
      year: year,
      totalTax: calculateTotalTax(monthRecords),
      paidAmount: 0,
      currency: 'NGN',
      isPaid: false,
      receiptsCount: monthRecords.length,
      totalSpent: monthRecords.reduce((sum, r) => sum + r.amount, 0)
    };
    
    user.monthlyPayments.push(payment);
    await user.save();
  }
  
  return payment;
}

module.exports = {
  getUserTaxStatus,
  generateTaxSummaryMessage,
  generateDetailedTaxMessage,
  getMonthlyPayment
};