const OpenAI = require('openai');
const fs = require('fs');
// Use pdfjs-dist (ESM) via dynamic import to extract text from PDFs in a CommonJS backend.
const pdfjsLibPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
const NIGERIAN_TAX_RATES = require('../config/taxRates');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

console.log('🔧 OpenAI Service Initialized');

// Enhanced OpenAI AI with conversational tone
async function analyzeReceiptWithOpenAI(imageBuffer = null, textContext = '', userName = '', userMessage = '') {
    console.log('\n🚀 analyzeReceiptWithOpenAI called');
    console.log('📊 Parameters:', {
        hasImageBuffer: !!imageBuffer,
        imageBufferSize: imageBuffer?.length,
        textContext: textContext?.substring(0, 50),
        userName,
        userMessage: userMessage?.substring(0, 50)
    });

    try {
        const firstName = userName.split(' ')[0];

        // Text-only conversational response
        if (!imageBuffer) {
            console.log('💬 Text-only mode (no image)');
            console.log('👤 First name extracted:', firstName);

            const systemPrompt = `You are Eunice, a warm, friendly, and intelligent Nigerian tax assistant for Tax-e. You're chatting with ${firstName}.

Context: The New Nigeria Tax Law 2025 is now in effect. This changes the PAYE system, income tax bands, and allowable deductions. However, the specific rates and bands are currently being finalized. If asked about tax calculations, inform the user that the new 2025 PAYE system applies, but specific details on rates are pending.

Respond naturally like a helpful friend. Always identify yourself as Eunice if asked. Keep it SHORT (1-2 sentences max). Be warm but not over the top. Use Nigerian expressions occasionally. Reference ${firstName} by name when it feels natural.`;

            console.log('📝 Sending text-only request to OpenAI...');

            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: textContext }
                ],
                temperature: 0.8,
                max_tokens: 500,
            });

            console.log('✅ Text response received');
            const result = response.choices[0].message.content;
            console.log('💡 AI Response:', result.substring(0, 100));

            return {
                description: result,
                amount: 0,
                currency: 'NGN',
                date: new Date().toISOString().split('T')[0],
                merchant: 'N/A',
                taxDeductible: false,
                category: 'other'
            };
        }

        // Receipt image analysis with user context
        console.log('🖼️ Image analysis mode');
        console.log('📸 Analyzing receipt...');

        const base64Image = imageBuffer.toString('base64');
        console.log('📸 Image converted to base64, length:', base64Image.length);

        console.log('👤 First name extracted:', firstName);

        const systemPrompt = `Analyze this receipt image and extract information. ${userMessage ? `The user said: "${userMessage}" - use this context to better understand the receipt.` : ''}

Return ONLY a JSON object:
{
  "amount": <total amount as number, just the number>,
  "currency": "<currency code: NGN, USD, GBP, EUR, etc. Default to NGN if unclear>",
  "date": "<YYYY-MM-DD or today's date>",
  "merchant": "<store name>",
  "description": "<brief natural description>",
  "category": "<one of: business, goods, services, medical, education, food, transport, entertainment, other>",
  "items": "<comma-separated list of items if visible>"
}

Nigerian context: Identify currency carefully. Look for ₦, NGN, Naira symbols. If no currency shown, assume NGN.`;

        console.log('📤 Sending vision request to OpenAI...');

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Analyze this receipt." },
                        {
                            type: "image_url",
                            image_url: {
                                "url": `data:image/jpeg;base64,${base64Image}`
                            },
                        },
                    ],
                },
            ],
            temperature: 0.1,
            max_tokens: 2000,
            response_format: { type: "json_object" }
        });

        console.log('✅ Vision response received');
        const aiText = response.choices[0].message.content;
        console.log('📄 AI raw text response:', aiText.substring(0, 200));

        try {
            console.log('📄 Attempting to parse JSON...');
            const parsed = JSON.parse(aiText);
            console.log('✅ JSON parsed successfully:', parsed);

            // Calculate Nigerian tax
            const category = parsed.category || 'other';
            console.log('🏷️ Category:', category);

            const taxInfo = NIGERIAN_TAX_RATES[category] || NIGERIAN_TAX_RATES.other;
            console.log('💰 Tax info:', taxInfo);

            const result = {
                amount: parsed.amount || 0,
                currency: parsed.currency || 'NGN',
                date: parsed.date || new Date().toISOString().split('T')[0],
                merchant: parsed.merchant || 'Unknown',
                description: parsed.description || parsed.items || 'Receipt items',
                taxDeductible: taxInfo.deductible,
                category: category,
                taxRate: taxInfo.rate,
                taxAmount: (parsed.amount || 0) * taxInfo.rate,
                userContext: userMessage
            };

            console.log('✨ Final result:', result);
            return result;

        } catch (parseError) {
            console.error('❌ JSON Parse error:', parseError.message);
            return {
                amount: 0,
                currency: 'NGN',
                date: new Date().toISOString().split('T')[0],
                merchant: 'Unknown',
                description: `Hey ${firstName}, I'm having trouble reading that receipt. Can you type the amount and what it's for? Like "5000 lunch at restaurant"`,
                taxDeductible: false,
                category: 'other',
                taxRate: 0.075,
                taxAmount: 0,
                userContext: userMessage
            };
        }

    } catch (error) {
        console.error('❌ OpenAI error:', error.message);
        return {
            amount: 0,
            currency: 'NGN',
            date: new Date().toISOString().split('T')[0],
            merchant: 'Unknown',
            description: 'Having trouble analyzing that receipt. Try typing the details like "5000 office supplies"',
            taxDeductible: false,
            category: 'other',
            taxRate: 0.075,
            taxAmount: 0
        };
    }
}

// Helper: extract plain text from a PDF buffer using pdfjs-dist
async function extractTextFromPdfBuffer(pdfBuffer) {
    try {
        console.log('📚 Loading pdfjs-dist library...');
        const pdfjsLib = await pdfjsLibPromise;
        console.log('✅ pdfjs-dist loaded successfully');

        let pdfData;
        if (Buffer.isBuffer(pdfBuffer)) {
            pdfData = Uint8Array.from(pdfBuffer);
        } else if (pdfBuffer instanceof Uint8Array) {
            pdfData = pdfBuffer;
        } else {
            pdfData = new Uint8Array(pdfBuffer);
        }

        console.log('📖 Loading PDF document...');
        const loadingTask = pdfjsLib.getDocument({ data: pdfData });
        const pdf = await loadingTask.promise;
        console.log('✅ PDF loaded successfully, pages:', pdf.numPages);

        let fullText = '';
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n';
        }

        console.log('✅ Total text extracted:', fullText.length, 'characters');
        return fullText;
    } catch (error) {
        console.error('❌ PDF text extraction error:', error.message);
        return '';
    }
}

// Analyze a bank/account statement PDF and return structured transactions
async function analyzeStatementPdfWithOpenAI(pdfBuffer, userName = '') {
    console.log('\n📄 analyzeStatementPdfWithOpenAI (chunked) called');

    if (!pdfBuffer) {
        console.error('❌ No PDF buffer provided');
        return { transactions: [], totalAmount: 0, totalTax: 0 };
    }

    // 1) Extract full text
    let pdfText;
    try {
        pdfText = await extractTextFromPdfBuffer(pdfBuffer);
    } catch (err) {
        console.error('❌ Failed extracting PDF text:', err.message);
        return { transactions: [], totalAmount: 0, totalTax: 0 };
    }

    if (!pdfText.trim()) {
        console.warn('⚠️ No extractable text found in PDF');
        return { transactions: [], totalAmount: 0, totalTax: 0 };
    }

    const firstName = userName ? userName.split(' ')[0] : 'friend';

    // Helper: chunk the pdfText
    function chunkStringByChars(str, maxChars = 3000) {
        const chunks = [];
        for (let i = 0; i < str.length; i += maxChars) {
            chunks.push(str.slice(i, i + maxChars));
        }
        return chunks;
    }

    const chunks = chunkStringByChars(pdfText, 3000);
    console.log('🔪 PDF split into', chunks.length, 'chunks');

    const allParsedTransactions = [];

    for (let i = 0; i < chunks.length; i++) {
        const chunkText = chunks[i];
        const prompt = `You are a Nigerian tax assistant helping ${firstName}.
The following is PART ${i + 1} of ${chunks.length} of a bank/account statement text. Only read this part and extract any transaction lines.

----------------- STATEMENT TEXT PART ${i + 1} START -----------------
${chunkText}
----------------- STATEMENT TEXT PART ${i + 1} END -----------------

TASK:
1. Extract ALL financial transactions (BOTH money coming in/CREDIT/INCOME and money going out/DEBIT/EXPENSE).
2. For each transaction, return a JSON array item with the fields:
   {
     "date": "YYYY-MM-DD",
     "description": "<short description>",
     "merchant": "<merchant or counterparty if available>",
     "amount": <number, MUST BE POSITIVE. If the text shows negative, convert to positive>,
     "type": "income" | "expense",  <-- CRITICAL: Identify if it is money IN (income) or money OUT (expense)
     "currency": "NGN" | "USD" | "GBP" | "EUR" | "...",
     "category": "business" | "goods" | "services" | "medical" | "education" | "food" | "transport" | "entertainment" | "salary" | "transfer" | "other",
     "taxDeductible": true | false,
     "taxRate": <number>,
     "taxAmount": <number, MUST BE POSITIVE>,
     "reference": "<transaction reference if visible>"
   }

Return ONLY a JSON object with the shape:
{
  "transactions": [ /* array of transaction objects from this PART */ ]
}

If there are no transactions in this PART, return {"transactions": []}.`;

        try {
            console.log(`📤 OpenAI request for chunk ${i + 1}...`);
            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    { role: "system", content: prompt }
                ],
                temperature: 0.1,
                max_tokens: 4096,
                response_format: { type: "json_object" }
            });

            const aiText = response.choices[0].message.content;
            const parsed = JSON.parse(aiText);
            const chunkTx = Array.isArray(parsed.transactions) ? parsed.transactions : [];
            console.log(`✅ Parsed ${chunkTx.length} transactions from chunk ${i + 1}`);

            for (const tx of chunkTx) {
                allParsedTransactions.push({
                    date: tx.date || tx.transactionDate || null,
                    description: tx.description || tx.narration || '',
                    merchant: tx.merchant || tx.counterparty || '',
                    amount: Math.abs(typeof tx.amount === 'number' ? tx.amount : Number(tx.amount) || 0),
                    type: tx.type === 'income' ? 'income' : 'expense', // Capture type
                    currency: tx.currency || 'NGN',
                    category: tx.category || 'other',
                    taxDeductible: typeof tx.taxDeductible === 'boolean' ? tx.taxDeductible : undefined,
                    taxRate: typeof tx.taxRate === 'number' ? tx.taxRate : undefined,
                    taxAmount: Math.abs(typeof tx.taxAmount === 'number' ? tx.taxAmount : undefined),
                    reference: tx.reference || tx.id || tx.transactionId || tx.ref || null
                });
            }

        } catch (err) {
            console.error(`❌ Failed to get AI response for chunk ${i + 1}:`, err.message);
            continue;
        }
    }

    if (!allParsedTransactions.length) {
        console.warn('⚠️ No transactions extracted from any chunk');
        return { transactions: [], totalAmount: 0, totalTax: 0 };
    }

    // De-duplicate
    const seen = new Map();
    const deduped = [];
    for (const tx of allParsedTransactions) {
        const key = tx.reference || `${tx.date}|${tx.amount}|${(tx.merchant || tx.description || '').slice(0, 30)}`;
        if (!seen.has(key)) {
            seen.set(key, true);
            deduped.push(tx);
        }
    }

    console.log('🔁 Aggregated transactions:', allParsedTransactions.length, '-> deduped:', deduped.length);

    // Enrich
    const enriched = deduped.map((tx) => {
        const amount = Number(tx.amount) || 0;
        const category = tx.category || 'other';
        const taxInfo = NIGERIAN_TAX_RATES[category] || NIGERIAN_TAX_RATES.other;
        const taxRate = typeof tx.taxRate === 'number' ? tx.taxRate : taxInfo.rate;
        const taxAmount = typeof tx.taxAmount === 'number' ? tx.taxAmount : amount * taxRate;

        let dateString = tx.date || new Date().toISOString().split('T')[0];
        const parsedDate = new Date(dateString);
        if (isNaN(parsedDate.getTime())) {
            dateString = new Date().toISOString().split('T')[0];
        }

        return {
            date: dateString,
            description: tx.description || 'Transaction from statement',
            merchant: tx.merchant || 'Statement transaction',
            amount,
            type: tx.type, // Pass through type
            currency: tx.currency || 'NGN',
            category,
            taxDeductible: typeof tx.taxDeductible === 'boolean' ? tx.taxDeductible : !!taxInfo.deductible,
            taxRate,
            taxAmount,
            reference: tx.reference || `STMT-${Math.floor(Math.random() * 1e9)}`
        };
    });

    const computedTotalAmount = enriched.reduce((sum, t) => sum + (t.amount || 0), 0);
    const computedTotalTax = enriched.reduce((sum, t) => sum + (t.taxAmount || 0), 0);

    return {
        transactions: enriched,
        totalAmount: computedTotalAmount,
        totalTax: computedTotalTax
    };
}

// Chat with Eunice
async function chatWithMercy(userMessage, history = []) {
    console.log('💬 chatWithMercy called');

    try {
        const systemPrompt = `You are Eunice, a warm, friendly, and intelligent Nigerian tax assistant for Tax-e.
    
Context: The New Nigeria Tax Law 2025 is now in effect. This changes the PAYE system, income tax bands, and allowable deductions. However, the specific rates and bands are currently being finalized.

YOUR MISSION:
1. Help users with tax-related questions, receipt categorization, and understanding Tax-e features.
2. STRICTLY REFUSE to discuss topics unrelated to taxes, finance, business, or the Tax-e app.
3. If a user asks about a non-tax topic (e.g., sports, politics, general life advice), politely decline and steer them back to taxes. Example: "Ah, I only know about taxes and money matters o! Let's talk about your business expenses instead."
4. Be warm, use occasional Nigerian expressions (like "o", "abeg", "no wahala"), but keep it professional.
5. Keep responses concise (2-3 sentences max usually).`;

        const messages = [
            { role: "system", content: systemPrompt },
            ...history.map(msg => ({ role: msg.role, content: msg.content })),
            { role: "user", content: userMessage }
        ];

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: messages,
            temperature: 0.7,
            max_tokens: 300,
        });

        const reply = response.choices[0].message.content;
        return { role: 'assistant', content: reply };

    } catch (error) {
        console.error('❌ Eunice chat error:', error.message);
        return {
            role: 'assistant',
            content: "Eyah, network is somehow o. I couldn't hear you well. Please say that again?"
        };
    }
}

// Chat with Eunice (Admin Mode)
// Generate a personalized engagement prompt based on user stats
async function generatePersonalizedEngagement(context) {
    console.log('📢 generatePersonalizedEngagement called for:', context.name);

    try {
        const systemPrompt = `You are Eunice, a personal Nigerian tax assistant. 
Context: 
- User: ${context.name}
- Current Month Spend: ₦${context.currentMonthSpent.toLocaleString()}
- Current Month Tax Liability: ₦${context.currentMonthTax.toLocaleString()}
- Last Receipt Upload: ${context.daysSinceLastReceipt} days ago
- Receipts this month: ${context.receiptCount}

Task: Generate a SHORT, ENGAGING, 1-SENTENCE push notification message to bring them back to the app.

Guidelines:
1. Be personal and specific to their data.
2. Adopt a persona of "keeping tabs" and "ready to help".
3. CRITICAL: Invite them to chat with you ("Come chat", "Ask me", "Let's discuss").
4. If they haven't uploaded in a while (>3 days), playfully nag them.
5. If they have high spend, comment on it and offer to analyze it.
6. Use Nigerian flair occasionally ("Abeg", "Oga", "Madam", "Wetin dey").
7. Goal: Get them to open the app and chat with Eunice.

Examples:
- "Oga John, 5 days since your last receipt? Come chat, let's sort your records out!"
- "Madam Sarah, 200k spent? E plenty o! Come ask me how this affects your tax."
- "I've been reviewing your expenses. Come chat, I have some insights for you!"
- "Tax Reminder: You owe ₦15k so far. Come chat if you need advice on deductions."`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: "Generate notification." }
            ],
            temperature: 0.8,
            max_tokens: 100,
        });

        const reply = response.choices[0].message.content;
        // Clean up quotes if present
        const cleanedReply = reply.replace(/^["']|["']$/g, '');

        return {
            title: `Hello ${context.name.split(' ')[0]} 👋`,
            body: cleanedReply
        };

    } catch (error) {
        console.error('❌ Engagement prompt error:', error.message);
        // Fallback generic message
        return {
            title: 'Hey there! 👋',
            body: "It's a good time to upload your recent receipts. Keep your records straight!"
        };
    }
}

async function chatWithMercyAdmin(userMessage, history = [], adminContext = {}) {
    console.log('💬 chatWithMercyAdmin called');

    try {
        const systemPrompt = `You are Eunice, the intelligent Admin Assistant for the Tax-e platform.
    
Context:
- Total Users: ${adminContext.totalUsers || 'Unknown'}
- Total Revenue: ${adminContext.totalRevenue || 'Unknown'}
- Total Receipts: ${adminContext.totalReceipts || 'Unknown'}
- Pending Payments: ${adminContext.pendingPayments || 'Unknown'}
- Recent Activity: ${JSON.stringify(adminContext.recentActivity || [])}

YOUR MISSION:
1. Assist the Admin with platform management, insights, and finding information.
2. You have access to the summary data above. Use it to answer questions like "How many users do we have?" or "What's the revenue?".
3. If asked to "find" a specific user or receipt, explain that you can't search the live database yet, but you can guide them to the Users or Receipts page.
4. Be professional, efficient, but maintain a slight warm Nigerian charm (e.g., "All systems operational, Oga/Madam").
5. Keep responses concise.`;

        const messages = [
            { role: "system", content: systemPrompt },
            ...history.map(msg => ({ role: msg.role, content: msg.content })),
            { role: "user", content: userMessage }
        ];

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: messages,
            temperature: 0.5,
            max_tokens: 300,
        });

        const reply = response.choices[0].message.content;
        return { role: 'assistant', content: reply };

    } catch (error) {
        console.error('❌ Eunice admin chat error:', error.message);
        return {
            role: 'assistant',
            content: "System error. I couldn't process that request."
        };
    }
}

module.exports = { analyzeReceiptWithOpenAI, analyzeStatementPdfWithOpenAI, chatWithMercy, chatWithMercyAdmin, generatePersonalizedEngagement };
