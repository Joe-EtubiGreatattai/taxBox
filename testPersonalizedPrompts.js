require('dotenv').config();
const { generatePersonalizedEngagement } = require('./services/openaiService');

async function testPrompt() {
    console.log('--- Testing Personalized Prompt ---');

    // Scenario 1: High Spender
    const context1 = {
        name: 'Emeka',
        currentMonthSpent: 450000,
        currentMonthTax: 12000,
        daysSinceLastReceipt: 1,
        receiptCount: 15
    };
    console.log('\nScenario 1: High Spender (Emeka)');
    const msg1 = await generatePersonalizedEngagement(context1);
    console.log(`[TITLE]: ${msg1.title}`);
    console.log(`[BODY]: ${msg1.body}`);

    // Scenario 2: Lazy User
    const context2 = {
        name: 'Chioma',
        currentMonthSpent: 0,
        currentMonthTax: 0,
        daysSinceLastReceipt: 10,
        receiptCount: 0
    };
    console.log('\nScenario 2: Lazy User (Chioma)');
    const msg2 = await generatePersonalizedEngagement(context2);
    console.log(`[TITLE]: ${msg2.title}`);
    console.log(`[BODY]: ${msg2.body}`);
}

testPrompt();
