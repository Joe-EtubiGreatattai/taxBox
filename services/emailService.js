const nodemailer = require('nodemailer');

function getSmtpPassword() {
    const raw = process.env.SMTP_PASSWORD || process.env.SMTP_PASS || process.env.EMAIL_PASS || '';
    const m = raw.match(/^"(.*)"$/);
    return m ? m[1] : raw;
}

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    secure: (process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : false) || parseInt(process.env.SMTP_PORT || '0', 10) === 465,
    auth: {
        user: process.env.SMTP_USER || process.env.SMTP_EMAIL || process.env.EMAIL_USER,
        pass: getSmtpPassword()
    },
    logger: true,
    debug: true
});

function maskEmail(email) {
    if (!email) return '';
    const parts = String(email).split('@');
    if (parts.length !== 2) return '***';
    const local = parts[0];
    const domain = parts[1];
    const maskedLocal = local.length <= 2 ? local : `${local.slice(0, 2)}***`;
    return `${maskedLocal}@${domain}`;
}

async function sendEmail(to, subject, html) {
    const fromName = process.env.FROM_NAME || 'Tax-e Team';
    const fromEmail = process.env.FROM_EMAIL || process.env.SMTP_EMAIL || process.env.EMAIL_USER;
    console.log('SMTP sending init:', {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        secure: (process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : false) || parseInt(process.env.SMTP_PORT || '0', 10) === 465,
        user: maskEmail(process.env.SMTP_USER || process.env.SMTP_EMAIL || process.env.EMAIL_USER),
        from: `"${fromName}" <${maskEmail(fromEmail)}>`
    });
    const mailOptions = {
        from: `"${fromName}" <${fromEmail}>`,
        to,
        subject,
        html
    };
    try {
        try {
            const verifyRes = await transporter.verify();
            console.log('SMTP verify:', verifyRes === true ? 'ok' : verifyRes);
        } catch (verErr) {
            console.log('SMTP verify failed:', verErr && (verErr.message || verErr));
        }
        console.log('SMTP sending start:', { to: maskEmail(to), subject });
        const info = await transporter.sendMail(mailOptions);
        console.log('SMTP sending done:', {
            messageId: info.messageId,
            response: info.response,
            accepted: info.accepted,
            rejected: info.rejected
        });
        return { success: true, messageId: info.messageId, accepted: info.accepted, rejected: info.rejected };
    } catch (err) {
        console.log('SMTP sending error:', {
            code: err && err.code,
            responseCode: err && err.responseCode,
            command: err && err.command,
            message: err && err.message
        });
        return { success: false, error: err && err.message ? err.message : String(err) };
    }
}

/**
 * Send confirmation email to users who join the waitlist
 * @param {string} name - User's name
 * @param {string} email - User's email address
 */
const sendWaitlistConfirmationEmail = async (name, email) => {
    try {
        const html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body {
                            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                            line-height: 1.6;
                            color: #333;
                            max-width: 600px;
                            margin: 0 auto;
                            padding: 20px;
                        }
                        .header {
                            background: linear-gradient(135deg, hsl(174, 95%, 15%) 0%, hsl(174, 80%, 25%) 100%);
                            color: white;
                            padding: 30px;
                            text-align: center;
                            border-radius: 10px 10px 0 0;
                        }
                        .header h1 {
                            margin: 0;
                            font-size: 28px;
                        }
                        .content {
                            background: #f9f9f9;
                            padding: 30px;
                            border-radius: 0 0 10px 10px;
                        }
                        .welcome-text {
                            font-size: 18px;
                            margin-bottom: 20px;
                        }
                        .info-box {
                            background: white;
                            padding: 20px;
                            border-left: 4px solid hsl(174, 95%, 15%);
                            margin: 20px 0;
                            border-radius: 5px;
                        }
                        .footer {
                            text-align: center;
                            margin-top: 30px;
                            color: #666;
                            font-size: 14px;
                        }
                        .button {
                            display: inline-block;
                            padding: 12px 30px;
                            background: hsl(174, 95%, 15%);
                            color: white;
                            text-decoration: none;
                            border-radius: 5px;
                            margin: 20px 0;
                        }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1>🎉 Welcome to Tax-e!</h1>
                    </div>
                    <div class="content">
                        <p class="welcome-text">Hi <strong>${name}</strong>,</p>
                        
                        <p>Thank you for joining the Tax-e waitlist! We're thrilled to have you on board.</p>
                        
                        <div class="info-box">
                            <h3>What's Next?</h3>
                            <p>✅ You're officially on our waitlist<br>
                            📧 We'll keep you updated on our launch progress<br>
                            🚀 You'll be among the first to access Tax-e when we go live</p>
                        </div>
                        
                        <p>Tax-e is revolutionizing the way people manage their taxes. With our AI-powered assistant, tax tracking has never been easier.</p>
                        
                        <p>We're working hard to bring you the best tax management experience. Stay tuned for updates!</p>
                        
                        <div class="footer">
                            <p>Best regards,<br>
                            <strong>The Tax-e Team</strong></p>
                            <p style="font-size: 12px; color: #999;">
                                This email was sent because you signed up for the Tax-e waitlist.
                            </p>
                        </div>
                    </div>
                </body>
                </html>
            `;

        const result = await sendEmail(
            email,
            '🎉 Welcome to Tax-e Waitlist!',
            html
        );
        console.log('Waitlist confirmation email sent:', result.messageId);
        return result;
    } catch (error) {
        console.error('Error sending waitlist confirmation email:', error);
        return { success: false, error: error.message };
    }
};

module.exports = {
    sendWaitlistConfirmationEmail,
    sendEmail
};
