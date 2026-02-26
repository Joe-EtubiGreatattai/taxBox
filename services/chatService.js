const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
let model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' });

/**
 * Generate a response from Nas (AI tax assistant)
 * @param {string} userMessage - The user's message
 * @param {Array} chatHistory - Previous chat messages for context
 * @param {Object} userProfile - User profile information
 * @param {Object} userData - User's tax and receipt data
 * @returns {Promise<string>} - Nas's response
 */
async function generateEuniceResponse(userMessage, chatHistory = [], userProfile = {}, userData = {}) {
    try {
        // Format user data for context
        let dataContext = '';

        if (userData.taxSummary) {
            dataContext += `\n\nUser's Tax Summary:
- Total Receipts: ${userData.taxSummary.totalReceipts}
- Total Spent: ₦${userData.taxSummary.totalSpent.toLocaleString()}
- Total Tax: ₦${userData.taxSummary.totalTax.toLocaleString()}
- Deductible Amount: ₦${userData.taxSummary.deductibleAmount.toLocaleString()}`;
        }

        if (userData.recentReceipts && userData.recentReceipts.length > 0) {
            dataContext += `\n\nRecent Receipts (last 5):`;
            userData.recentReceipts.forEach((receipt, index) => {
                dataContext += `\n${index + 1}. ${receipt.description} - ₦${receipt.amount.toLocaleString()} (Tax: ₦${receipt.taxAmount.toLocaleString()}) - ${new Date(receipt.date).toLocaleDateString()}`;
            });
        }

        if (userData.monthlyPayments && userData.monthlyPayments.length > 0) {
            dataContext += `\n\nRecent Monthly Payments:`;
            userData.monthlyPayments.forEach(payment => {
                dataContext += `\n- ${payment.month}: ₦${payment.totalTax.toLocaleString()} (${payment.isPaid ? 'Paid' : 'Unpaid'})`;
            });
        }

        const systemPrompt = `You are Nas, a friendly and knowledgeable tax assistant for Nigerian taxpayers. You help users understand their tax obligations, answer questions about PAYE, VAT, and other tax matters in Nigeria. You are helpful, professional, and explain things in simple terms.

User Profile:
- Name: ${userProfile.name || 'User'}
- Tax Type: ${userProfile.taxType || 'PAYE'}
- Profession: ${userProfile.profession || 'Not specified'}
- Income Range: ${userProfile.incomeRange || 'Not specified'}${dataContext}

When the user asks about their receipts, tax data, or spending, use the information provided above. Keep responses concise (2-3 sentences max unless explaining complex topics). Be warm and encouraging.`;

        const historyText = chatHistory
            .slice(-10)
            .map(msg => `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
            .join('\n');

        const result = await model.generateContent({
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: `${systemPrompt}\n\n${historyText}\n\nUser: ${userMessage}` }
                    ]
                }
            ],
            generationConfig: {
                maxOutputTokens: 200,
                temperature: 0.7
            }
        });

        return result.response.text().trim();
    } catch (error) {
        console.error('Error generating Nas response:', error);

        // Fallback responses if OpenAI fails
        const fallbackResponses = [
            "I'm here to help with your tax questions! Could you please provide more details?",
            "That's a great question! Let me help you understand that better.",
            "I'm experiencing some technical difficulties right now, but I'm here to assist you with your tax matters.",
        ];

        return fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
    }
}

module.exports = {
    generateEuniceResponse
};
