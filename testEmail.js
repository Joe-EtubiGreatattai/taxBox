require('dotenv').config();
const { sendWaitlistConfirmationEmail } = require('./services/emailService');

(async () => {
  const recipient = 'joeetubigreatattai@gmail.com';
  const name = 'Joe Great';
  console.log('📧 Sending test email...');
  try {
    const result = await sendWaitlistConfirmationEmail(name, recipient);
    console.log('✅ Email send result:', result);
  } catch (err) {
    console.error('❌ Email send failed:', err?.message || err);
  }
})();
