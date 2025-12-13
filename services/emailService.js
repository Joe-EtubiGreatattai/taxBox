const nodemailer = require('nodemailer');

// Configure email transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

/**
 * Send confirmation email to users who join the waitlist
 * @param {string} name - User's name
 * @param {string} email - User's email address
 */
const sendWaitlistConfirmationEmail = async (name, email) => {
    try {
        const mailOptions = {
            from: `"Tax-e Team" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: '🎉 Welcome to Tax-e Waitlist!',
            html: `
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
            `
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Waitlist confirmation email sent:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error sending waitlist confirmation email:', error);
        return { success: false, error: error.message };
    }
};

module.exports = {
    sendWaitlistConfirmationEmail
};
