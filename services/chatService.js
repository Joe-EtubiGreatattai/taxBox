const OpenAI = require('openai');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate a response from Eunice (AI tax assistant)
 * @param {string} userMessage - The user's message
 * @param {Array} chatHistory - Previous chat messages for context
 * @param {Object} userProfile - User profile information
 * @param {Object} userData - User's tax and receipt data
 * @returns {Promise<string>} - Eunice's response
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

        // Build context from chat history
        const messages = [
            {
                role: 'system',
                content: `You are Eunice, a friendly and knowledgeable tax assistant for Nigerian taxpayers. You help users understand their tax obligations, answer questions about PAYE, VAT, and other tax matters in Nigeria. You are helpful, professional, and explain things in simple terms. 

User Profile:
- Name: ${userProfile.name || 'User'}
- Tax Type: ${userProfile.taxType || 'PAYE'}
- Profession: ${userProfile.profession || 'Not specified'}
- Income Range: ${userProfile.incomeRange || 'Not specified'}${dataContext}

When the user asks about their receipts, tax data, or spending, use the information provided above. Keep responses concise (2-3 sentences max unless explaining complex topics). Be warm and encouraging.`
            },
            // Add chat history
            ...chatHistory.slice(-10).map(msg => ({
                role: msg.sender === 'user' ? 'user' : 'assistant',
                content: msg.text
            })),
            // Add current message
            {
                role: 'user',
                content: userMessage
            }
        ];

        const response = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: messages,
            max_tokens: 200,
            temperature: 0.7,
        });

        return response.choices[0].message.content.trim();
    } catch (error) {
        console.error('Error generating Eunice response:', error);

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
