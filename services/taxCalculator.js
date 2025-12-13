const NIGERIAN_TAX_RATES = require('../config/taxRates');

// Calculate total tax across all receipts
function calculateTotalTax(records) {
  return records.reduce((sum, r) => sum + (r.taxAmount || 0), 0);
}

// Calculate tax for current month
function calculateCurrentMonthTax(records) {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  
  const currentMonthRecords = records.filter(record => {
    const recordDate = new Date(record.date);
    return recordDate.getMonth() === currentMonth && recordDate.getFullYear() === currentYear;
  });
  
  return {
    totalTax: calculateTotalTax(currentMonthRecords),
    totalSpent: currentMonthRecords.reduce((sum, r) => sum + r.amount, 0),
    receiptsCount: currentMonthRecords.length,
    records: currentMonthRecords
  };
}

// Calculate tax for specific month
function calculateMonthTax(records, month, year) {
  const monthRecords = records.filter(record => {
    const recordDate = new Date(record.date);
    return recordDate.getMonth() === month && recordDate.getFullYear() === year;
  });
  
  return {
    totalTax: calculateTotalTax(monthRecords),
    totalSpent: monthRecords.reduce((sum, r) => sum + r.amount, 0),
    receiptsCount: monthRecords.length,
    records: monthRecords
  };
}

// Calculate tax breakdown by category
function calculateTaxByCategory(records) {
  const categoryBreakdown = {};
  
  records.forEach(record => {
    const category = record.category || 'other';
    if (!categoryBreakdown[category]) {
      categoryBreakdown[category] = {
        totalAmount: 0,
        totalTax: 0,
        count: 0
      };
    }
    
    categoryBreakdown[category].totalAmount += record.amount;
    categoryBreakdown[category].totalTax += (record.taxAmount || 0);
    categoryBreakdown[category].count += 1;
  });
  
  return categoryBreakdown;
}

// Manual receipt parsing
function parseManualReceipt(text) {
  const amountMatch = text.match(/(\d+\.?\d*)/);
  const amount = amountMatch ? parseFloat(amountMatch[1]) : 0;
  
  const lowerText = text.toLowerCase();
  let category = 'other';
  
  if (lowerText.match(/office|supplies|equipment|business|work|laptop|computer|printer/)) {
    category = 'business';
  } else if (lowerText.match(/medical|doctor|hospital|medicine|pharmacy|health/)) {
    category = 'medical';
  } else if (lowerText.match(/education|school|book|course|training|tuition/)) {
    category = 'education';
  } else if (lowerText.match(/food|lunch|dinner|breakfast|restaurant|meal/)) {
    category = 'food';
  } else if (lowerText.match(/transport|uber|taxi|fuel|petrol|bus/)) {
    category = 'transport';
  } else if (lowerText.match(/movie|entertainment|cinema|club|party/)) {
    category = 'entertainment';
  } else if (lowerText.match(/service|repair|maintenance|cleaning/)) {
    category = 'services';
  } else if (lowerText.match(/goods|product|item|purchase/)) {
    category = 'goods';
  }
  
  const taxInfo = NIGERIAN_TAX_RATES[category];
  
  return {
    amount,
    currency: 'NGN',
    date: new Date().toISOString().split('T')[0],
    merchant: 'Manual Entry',
    description: text,
    taxDeductible: taxInfo.deductible,
    category,
    taxRate: taxInfo.rate,
    taxAmount: amount * taxInfo.rate
  };
}

module.exports = {
  calculateTotalTax,
  calculateCurrentMonthTax,
  calculateMonthTax,
  calculateTaxByCategory,
  parseManualReceipt
};