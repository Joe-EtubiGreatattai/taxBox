require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function listModels() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  
  try {
    // Access the model directly to list models if possible, or use a REST call if the SDK doesn't expose it easily in this version
    // The SDK v0.24.1 might not have a direct 'listModels' method on the top-level class easily accessible without looking at docs,
    // but we can try to use a simple fetch to the API endpoint to be sure, or check the SDK capabilities.
    // Actually, let's try a simple generation with a known "safe" model first to see if it's just the model name.
    // But the error said "Call ListModels".
    
    // Let's use a raw fetch to the list models endpoint to be absolutely sure what's available for this key.
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('No GEMINI_API_KEY found in environment variables.');
      return;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    
    console.log('Fetching available models from:', url.replace(apiKey, 'HIDDEN_KEY'));
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.error) {
      console.error('Error listing models:', data.error);
    } else {
      console.log('Available Models:');
      if (data.models) {
        data.models.forEach(m => {
          if (m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent')) {
             console.log(`- ${m.name} (Supported methods: ${m.supportedGenerationMethods.join(', ')})`);
          }
        });
      } else {
        console.log('No models returned.', data);
      }
    }

  } catch (error) {
    console.error('Script error:', error);
  }
}

listModels();
