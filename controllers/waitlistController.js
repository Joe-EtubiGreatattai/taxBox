const Waitlist = require('../models/Waitlist');
const { sendWaitlistConfirmationEmail } = require('../services/emailService');

exports.joinWaitlist = async (req, res) => {
    try {
        const { name, email } = req.body;

        // Basic validation
        if (!name || !email) {
            return res.status(400).json({
                success: false,
                message: 'Please provide both name and email'
            });
        }

        // Check if email already exists
        const existingUser = await Waitlist.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'This email is already on the waitlist'
            });
        }

        // Create new waitlist entry
        const newEntry = await Waitlist.create({
            name,
            email
        });

        // Send confirmation email (don't block on email errors)
        sendWaitlistConfirmationEmail(name, email)
            .then(result => {
                if (result.success) {
                    console.log(`Confirmation email sent to ${email}`);
                } else {
                    console.error(`Failed to send confirmation email to ${email}:`, result.error);
                }
            })
            .catch(err => {
                console.error('Email sending error:', err);
            });

        res.status(201).json({
            success: true,
            message: 'Successfully joined the waitlist',
            data: newEntry
        });
    } catch (error) {
        console.error('Waitlist join error:', error);
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};
