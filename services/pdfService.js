const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

// Enhanced PDF generation with multiple fallback options
async function generateTaxReport(user, records) {
    let browser;
    try {
        // Calculate summary data
        const incomeRecords = records.filter(r => r.type === 'income');
        const expenseRecords = records.filter(r => r.type !== 'income');

        const totalIncome = incomeRecords.reduce((sum, r) => sum + r.amount, 0);
        const totalExpenses = expenseRecords.reduce((sum, r) => sum + r.amount, 0);

        // PAYE Calculation (Simplified for MVP)
        // Taxable Income = Total Income - Tax Exemptions (Consolidated Relief Allowance etc.)
        // For now, let's assume a simplified flat rate or bands if needed. 
        // Using a simplified progressive tax logic for Nigeria:
        // First 300k @ 7%, Next 300k @ 11%, Next 500k @ 15%, Next 500k @ 19%, Next 1.6M @ 21%, Above 3.2M @ 24%
        // Consolidated Relief Allowance (CRA): Higher of 200k or 1% of Gross Income + 20% of Gross Income

        let payeTax = 0;
        if (user.taxType === 'PAYE') {
            const cra = Math.max(200000, totalIncome * 0.01) + (totalIncome * 0.20);
            const taxableIncome = Math.max(0, totalIncome - cra); // Ensure not negative

            // Simplified tax bands
            let remaining = taxableIncome;

            if (remaining > 0) {
                const band1 = Math.min(remaining, 300000);
                payeTax += band1 * 0.07;
                remaining -= band1;
            }
            if (remaining > 0) {
                const band2 = Math.min(remaining, 300000);
                payeTax += band2 * 0.11;
                remaining -= band2;
            }
            if (remaining > 0) {
                const band3 = Math.min(remaining, 500000);
                payeTax += band3 * 0.15;
                remaining -= band3;
            }
            if (remaining > 0) {
                const band4 = Math.min(remaining, 500000);
                payeTax += band4 * 0.19;
                remaining -= band4;
            }
            if (remaining > 0) {
                const band5 = Math.min(remaining, 1600000);
                payeTax += band5 * 0.21;
                remaining -= band5;
            }
            if (remaining > 0) {
                payeTax += remaining * 0.24;
            }
        }

        const totalAmount = records.reduce((sum, r) => sum + r.amount, 0); // Keep for legacy/total flow
        const totalTax = records.reduce((sum, r) => sum + (r.taxAmount || 0), 0);
        const deductibleAmount = records.filter(r => r.taxDeductible).reduce((sum, r) => sum + r.amount, 0);
        const totalReceipts = records.length;

        // Create HTML content
        const htmlContent = createHTMLContent(user, records, totalAmount, totalTax, deductibleAmount, totalReceipts, totalIncome, totalExpenses, payeTax);

        // Browser launch options with multiple fallbacks
        const launchOptions = {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ],
            // Try to use system Chrome if available
            executablePath: await getChromePath()
        };

        console.log('Launching browser with options:', launchOptions);

        // Launch browser with retry logic
        browser = await launchBrowserWithRetry(launchOptions);

        const page = await browser.newPage();

        // Set viewport for better PDF rendering
        await page.setViewport({ width: 1200, height: 1600 });

        // Set page content
        await page.setContent(htmlContent, {
            waitUntil: ['networkidle0', 'domcontentloaded']
        });

        // Wait for fonts to load
        await page.evaluateHandle('document.fonts.ready');

        // Ensure reports directory exists
        const reportsDir = path.join(__dirname, '../reports');
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }

        // Generate filename and path
        const filename = `tax-report-${user.tin}-${Date.now()}.pdf`;
        const filepath = path.join(reportsDir, filename);

        // Generate PDF with better options
        await page.pdf({
            path: filepath,
            format: 'A4',
            printBackground: true,
            displayHeaderFooter: false,
            margin: {
                top: '20mm',
                right: '15mm',
                bottom: '20mm',
                left: '15mm'
            }
        });

        await browser.close();
        console.log('PDF generated successfully at:', filepath);
        return filepath;

    } catch (error) {
        console.error('PDF generation error:', error);

        if (browser) {
            await browser.close();
        }

        // Fallback to PDFKit if Puppeteer fails
        console.log('Attempting fallback to PDFKit...');
        return await generateWithPDFKit(user, records);
    }
}

// Helper function to get Chrome path
async function getChromePath() {
    const possiblePaths = [
        // System Chrome
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/usr/bin/google-chrome',
        // Puppeteer cached Chrome
        '/Users/mac/.cache/puppeteer/chrome/**/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
    ];

    for (const chromePath of possiblePaths) {
        if (fs.existsSync(chromePath)) {
            console.log('Found Chrome at:', chromePath);
            return chromePath;
        }
    }

    console.log('No system Chrome found, using Puppeteer default');
    return undefined;
}

// Browser launch with retry logic
async function launchBrowserWithRetry(options, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            return await puppeteer.launch(options);
        } catch (error) {
            console.log(`Browser launch attempt ${i + 1} failed:`, error.message);

            if (i === retries - 1) {
                throw error;
            }

            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

// Fallback PDF generation using PDFKit
function generateWithPDFKit(user, records) {
    return new Promise((resolve, reject) => {
        try {
            const PDFDocument = require('pdfkit');
            const doc = new PDFDocument({ margin: 50, size: 'A4' });

            const filename = `tax-report-${user.tin}-${Date.now()}.pdf`;
            const filepath = path.join(__dirname, '../reports', filename);

            if (!fs.existsSync(path.join(__dirname, '../reports'))) {
                fs.mkdirSync(path.join(__dirname, '../reports'), { recursive: true });
            }

            const stream = fs.createWriteStream(filepath);
            doc.pipe(stream);

            // Calculate totals
            const totalAmount = records.reduce((sum, r) => sum + r.amount, 0);
            const totalTax = records.reduce((sum, r) => sum + (r.taxAmount || 0), 0);

            // Header with styling
            doc.rect(0, 0, doc.page.width, 100).fill('#0A2540');

            doc.font('Helvetica-Bold')
                .fontSize(24)
                .fillColor('#FFFFFF')
                .text('TAX REPORT', 50, 30);

            doc.fontSize(10)
                .fillColor('#E0E0E0')
                .text('Nigerian Tax Assistant', 50, 60)
                .text(`Generated: ${new Date().toLocaleDateString('en-NG')}`, 50, 75);

            // User information section
            doc.fillColor('#000000')
                .fontSize(14)
                .font('Helvetica-Bold')
                .text('Taxpayer Information', 50, 130);

            doc.font('Helvetica')
                .fontSize(10)
                .text(`Name: ${user.name}`, 50, 155)
                .text(`TIN: ${user.tin}`, 50, 170)
                .text(`Phone: ${user.phone}`, 50, 185)
                .text(`Email: ${user.email}`, 50, 200);

            // Summary boxes
            doc.fontSize(11)
                .font('Helvetica-Bold')
                .text('Total Receipts:', 50, 240)
                .text('Total Amount:', 200, 240)
                .text('Total Tax:', 350, 240);

            doc.fontSize(14)
                .text(records.length.toString(), 50, 255)
                .text(`₦${totalAmount.toLocaleString()}`, 200, 255)
                .text(`₦${totalTax.toLocaleString()}`, 350, 255);

            // Transaction details
            doc.fontSize(14)
                .font('Helvetica-Bold')
                .text('Transaction Details', 50, 300);

            let yPosition = 330;
            doc.fontSize(9);

            records.forEach((record, index) => {
                if (yPosition > 700) {
                    doc.addPage();
                    yPosition = 50;
                }

                doc.font('Helvetica')
                    .text(`${new Date(record.date).toLocaleDateString('en-NG')}`, 50, yPosition)
                    .text(record.merchant || 'N/A', 130, yPosition)
                    .text(`₦${record.amount.toLocaleString()}`, 350, yPosition)
                    .text(`₦${(record.taxAmount || 0).toLocaleString()}`, 450, yPosition);

                yPosition += 20;
            });

            // Footer
            doc.fontSize(8)
                .fillColor('#666666')
                .text('Generated by Tax Assistant AI | Nigerian Tax Code Compliant', 50, doc.page.height - 50, {
                    align: 'center',
                    width: doc.page.width - 100
                });

            doc.end();

            stream.on('finish', () => resolve(filepath));
            stream.on('error', reject);

        } catch (error) {
            reject(error);
        }
    });
}

// Helper function to get size class for numbers
function getNumberSizeClass(amount) {
    const formatted = amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const length = formatted.length;

    if (length > 15) return 'very-large-number';
    if (length > 12) return 'large-number';
    return '';
}

// HTML content creation function with modern, official design
function createHTMLContent(user, records, totalAmount, totalTax, deductibleAmount, totalReceipts, totalIncome, totalExpenses, payeTax) {
    const isPaye = user.taxType === 'PAYE';

    return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Tax Report</title>
      <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
          
          * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
          }
          
          body {
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              color: #1a1a1a;
              line-height: 1.6;
              background: #ffffff;
              padding: 0;
          }
          
          .page {
              max-width: 210mm;
              margin: 0 auto;
              padding: 15mm;
          }
          
          /* Modern Header with gradient */
          .header {
              background: linear-gradient(135deg, #0A2540 0%, #1a4d7a 100%);
              color: white;
              padding: 40px 35px;
              margin: -15mm -15mm 30px -15mm;
              position: relative;
              overflow: hidden;
          }
          
          .header::before {
              content: '';
              position: absolute;
              top: -50%;
              right: -10%;
              width: 300px;
              height: 300px;
              background: rgba(255, 255, 255, 0.05);
              border-radius: 50%;
          }
          
          .header-content {
              position: relative;
              z-index: 1;
          }
          
          .header h1 {
              font-size: 32px;
              font-weight: 700;
              margin-bottom: 8px;
              letter-spacing: -0.5px;
          }
          
          .header .subtitle {
              font-size: 14px;
              opacity: 0.9;
              font-weight: 400;
          }
          
          .header .report-meta {
              margin-top: 20px;
              padding-top: 20px;
              border-top: 1px solid rgba(255, 255, 255, 0.2);
              display: flex;
              justify-content: space-between;
              font-size: 13px;
          }
          
          .report-id {
              font-family: 'Courier New', monospace;
              opacity: 0.8;
          }
          
          /* User Information Card */
          .info-section {
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 12px;
              padding: 25px 30px;
              margin-bottom: 30px;
          }
          
          .info-section h2 {
              font-size: 16px;
              font-weight: 600;
              color: #0A2540;
              margin-bottom: 20px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
          }
          
          .info-grid {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 15px;
          }
          
          .info-item {
              display: flex;
              flex-direction: column;
          }
          
          .info-label {
              font-size: 11px;
              color: #64748b;
              font-weight: 500;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin-bottom: 4px;
          }
          
          .info-value {
              font-size: 14px;
              color: #1e293b;
              font-weight: 500;
          }
          
          /* Summary Cards */
          .summary-section {
              margin: 30px 0;
          }
          
          .summary-cards {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 20px;
              margin-bottom: 25px;
          }
          
          .card {
              background: white;
              border: 1px solid #e2e8f0;
              border-radius: 12px;
              padding: 25px 20px;
              text-align: center;
              transition: all 0.3s ease;
              position: relative;
              overflow: hidden;
          }
          
          .card::before {
              content: '';
              position: absolute;
              top: 0;
              left: 0;
              right: 0;
              height: 3px;
              background: linear-gradient(90deg, #0A2540 0%, #1a4d7a 100%);
          }
          
          .card-label {
              font-size: 12px;
              color: #64748b;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              font-weight: 500;
              margin-bottom: 8px;
          }
          
          .card-value {
              font-size: 20px;
              font-weight: 700;
              color: #0A2540;
              line-height: 1.3;
              word-break: break-word;
              overflow-wrap: break-word;
              hyphens: none;
          }
          
          .card-value.large-number {
              font-size: 16px;
          }
          
          .card-value.very-large-number {
              font-size: 14px;
          }
          
          /* Deductible Highlight */
          .deductible-highlight {
              background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
              border-left: 4px solid #10b981;
              padding: 20px 25px;
              border-radius: 8px;
              margin: 25px 0;
          }
          
          .deductible-highlight .label {
              font-size: 12px;
              color: #065f46;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              font-weight: 600;
              margin-bottom: 5px;
          }
          
          .deductible-highlight .value {
              font-size: 22px;
              color: #047857;
              font-weight: 700;
              word-break: break-word;
          }
          
          .deductible-highlight .value.large {
              font-size: 18px;
          }
          
          .deductible-highlight .value.very-large {
              font-size: 16px;
          }
          
          /* Table Section */
          .table-section {
              margin: 30px 0;
          }
          
          .section-title {
              font-size: 18px;
              font-weight: 600;
              color: #0A2540;
              margin-bottom: 20px;
              padding-bottom: 10px;
              border-bottom: 2px solid #e2e8f0;
          }
          
          table {
              width: 100%;
              border-collapse: separate;
              border-spacing: 0;
              background: white;
              border-radius: 8px;
              overflow: hidden;
              border: 1px solid #e2e8f0;
          }
          
          thead {
              background: linear-gradient(135deg, #0A2540 0%, #1a4d7a 100%);
          }
          
          th {
              padding: 14px 16px;
              text-align: left;
              font-size: 12px;
              font-weight: 600;
              color: white;
              text-transform: uppercase;
              letter-spacing: 0.5px;
          }
          
          tbody tr {
              border-bottom: 1px solid #f1f5f9;
          }
          
          tbody tr:last-child {
              border-bottom: none;
          }
          
          tbody tr:nth-child(even) {
              background: #f8fafc;
          }
          
          td {
              padding: 14px 16px;
              font-size: 13px;
              color: #334155;
          }
          
          td:first-child {
              font-weight: 500;
              color: #0f172a;
          }
          
          .amount-cell {
              font-weight: 600;
              color: #0A2540;
          }
          
          .tax-cell {
              color: #059669;
              font-weight: 500;
          }
          
          /* Footer */
          .footer {
              margin-top: 50px;
              padding-top: 25px;
              border-top: 1px solid #e2e8f0;
              text-align: center;
          }
          
          .footer-content {
              color: #64748b;
              font-size: 11px;
              line-height: 1.8;
          }
          
          .footer-content strong {
              color: #334155;
              font-weight: 600;
          }
          
          .disclaimer {
              background: #fef3c7;
              border: 1px solid #fbbf24;
              border-radius: 6px;
              padding: 12px 15px;
              margin-top: 15px;
              font-size: 11px;
              color: #92400e;
              text-align: left;
          }
          
          /* Print optimizations */
          @media print {
              body {
                  -webkit-print-color-adjust: exact;
                  print-color-adjust: exact;
              }
          }
      </style>
  </head>
  <body>
      <div class="page">
          <div class="header">
              <div class="header-content">
                  <h1>TAX REPORT</h1>
                  <div class="subtitle">Nigerian Tax Compliance Documentation</div>
                  <div class="report-meta">
                      <div>
                          <strong>Report Date:</strong> ${new Date().toLocaleDateString('en-NG', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    })}
                      </div>
                      <div class="report-id">
                          ID: ${user.tin}-${Date.now().toString().slice(-8)}
                      </div>
                  </div>
              </div>
          </div>
          
          <div class="info-section">
              <h2>Taxpayer Information</h2>
              <div class="info-grid">
                  <div class="info-item">
                      <div class="info-label">Full Name</div>
                      <div class="info-value">${user.name}</div>
                  </div>
                  <div class="info-item">
                      <div class="info-label">Tax Identification Number</div>
                      <div class="info-value">${user.tin}</div>
                  </div>
                  <div class="info-item">
                      <div class="info-label">Contact Phone</div>
                      <div class="info-value">${user.phone}</div>
                  </div>
                  <div class="info-item">
                      <div class="info-label">Email Address</div>
                      <div class="info-value">${user.email}</div>
                  </div>
              </div>
          </div>
          
          <div class="summary-section">
              <div class="summary-cards">
                  <div class="card">
                      <div class="card-label">Total Transactions</div>
                      <div class="card-value">${totalReceipts}</div>
                  </div>
                  
                  ${isPaye ? `
                  <div class="card">
                      <div class="card-label">Total Income</div>
                      <div class="card-value ${getNumberSizeClass(totalIncome)}">₦${totalIncome.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  </div>
                  <div class="card">
                      <div class="card-label">Total Expenses</div>
                      <div class="card-value ${getNumberSizeClass(totalExpenses)}">₦${totalExpenses.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  </div>
                  ` : `
                  <div class="card">
                      <div class="card-label">Total Amount</div>
                      <div class="card-value ${getNumberSizeClass(totalAmount)}">₦${totalAmount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  </div>
                  <div class="card">
                      <div class="card-label">Total VAT</div>
                      <div class="card-value ${getNumberSizeClass(totalTax)}">₦${totalTax.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  </div>
                  `}
              </div>
              
              ${isPaye ? `
              <div class="deductible-highlight" style="background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%); border-left-color: #0284c7;">
                  <div class="label" style="color: #0369a1;">Estimated PAYE Tax Payable</div>
                  <div class="value ${getNumberSizeClass(payeTax).replace('number', '')}" style="color: #0c4a6e;">₦${payeTax.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </div>
              ` : `
              <div class="deductible-highlight">
                  <div class="label">Tax Deductible Amount</div>
                  <div class="value ${getNumberSizeClass(deductibleAmount).replace('number', '')}">₦${deductibleAmount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </div>
              `}
          </div>
          
          <div class="table-section">
              <h3 class="section-title">Transaction Details</h3>
              <table>
                  <thead>
                      <tr>
                          <th>Date</th>
                          <th>Merchant/Source</th>
                          <th>Description</th>
                          <th>Type</th>
                          <th>Amount (₦)</th>
                          ${!isPaye ? '<th>Tax (₦)</th>' : ''}
                      </tr>
                  </thead>
                  <tbody>
                      ${records.map(record => `
                          <tr>
                              <td>${new Date(record.date).toLocaleDateString('en-NG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    })}</td>
                              <td>${record.merchant || 'N/A'}</td>
                              <td>${record.description || '-'}</td>
                              <td><span style="
                                  padding: 4px 8px; 
                                  border-radius: 4px; 
                                  font-size: 11px; 
                                  font-weight: 600; 
                                  background: ${record.type === 'income' ? '#dcfce7' : '#fee2e2'}; 
                                  color: ${record.type === 'income' ? '#166534' : '#991b1b'};
                              ">${(record.type || 'expense').toUpperCase()}</span></td>
                              <td class="amount-cell" style="color: ${record.type === 'income' ? '#166534' : '#0A2540'}">
                                  ${record.type === 'income' ? '+' : '-'}₦${record.amount.toLocaleString('en-NG', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}</td>
                              ${!isPaye ? `<td class="tax-cell">₦${(record.taxAmount || 0).toLocaleString('en-NG', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}</td>` : ''}
                          </tr>
                      `).join('')}
                  </tbody>
              </table>
          </div>
          
          <div class="footer">
              <div class="footer-content">
                  <strong>Generated by Tax Assistant AI</strong><br>
                  Nigerian Tax Code Compliant • Federal Inland Revenue Service (FIRS)<br>
                  <br>
                  <div class="disclaimer">
                      <strong>⚠️ Important Notice:</strong> This is an automated report generated for record-keeping purposes. 
                      For official tax filing and compliance matters, please consult with a certified tax professional or contact FIRS directly.
                  </div>
              </div>
          </div>
      </div>
  </body>
  </html>
  `;
}

module.exports = { generateTaxReport };