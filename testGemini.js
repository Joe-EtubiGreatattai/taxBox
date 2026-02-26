require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  
  console.log(`Testing Gemini with model: ${modelName}`);
  
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  try {
    const result = await model.generateContent("Hello! Are you working?");
    const response = await result.response;
    const text = response.text();
    console.log('Response:', text);
    console.log('✅ Gemini test passed!');
  } catch (error) {
    console.error('❌ Gemini test failed:', error);
  }
}

testGemini();
