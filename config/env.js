// config/env.js
const requiredEnvVars = [
  'JWT_SECRET',
  'MONGODB_URI',
  'PORT'
];

function validateEnv() {
  const missing = requiredEnvVars.filter(envVar => !process.env[envVar]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(envVar => {
      console.error(`   - ${envVar}`);
    });
    console.error('\n💡 Please check your .env file and make sure all variables are set.');
    process.exit(1);
  }

  // Validate JWT secret strength
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    console.error('❌ JWT_SECRET must be at least 32 characters long for security');
    process.exit(1);
  }

  if (!process.env.GEMINI_API_KEY) {
    process.env.GEMINI_API_KEY = 'GEMINI_API_KEY_PLACEHOLDER';
  }
  if (!process.env.GEMINI_MODEL) {
    process.env.GEMINI_MODEL = 'gemini-2.5-flash';
  }
  if (!process.env.TAX_NEWS_POLL_INTERVAL_MINUTES) {
    process.env.TAX_NEWS_POLL_INTERVAL_MINUTES = '360';
  }
  if (!process.env.JWT_EXPIRES_IN) {
    process.env.JWT_EXPIRES_IN = '7d';
  }
  if (!process.env.BCRYPT_ROUNDS) {
    process.env.BCRYPT_ROUNDS = '12';
  }
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('⚠️ EMAIL_USER/EMAIL_PASS not set; email sending may be disabled');
  }
  if (!process.env.SERPAPI_API_KEY) {
    console.warn('⚠️ SERPAPI_API_KEY not set; tax news polling will be disabled');
  }
  if (!process.env.SMTP_HOST || !process.env.SMTP_EMAIL || !process.env.SMTP_PASSWORD) {
    console.warn('⚠️ SMTP settings incomplete; email sending may fail (SMTP_HOST/SMTP_EMAIL/SMTP_PASSWORD)');
  }

  console.log('✅ Environment variables validated successfully');
}

module.exports = { validateEnv };
