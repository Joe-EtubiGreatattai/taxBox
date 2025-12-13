const Contact = require('../models/Contact');

exports.submitContactForm = async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;

        // Basic validation
        if (!name || !email || !subject || !message) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields'
            });
        }

        // Create new contact entry
        const newContact = await Contact.create({
            name,
            email,
            subject,
            message
        });

        res.status(201).json({
            success: true,
            message: 'Message sent successfully',
            data: newContact
        });
    } catch (error) {
        console.error('Contact form submission error:', error);
        res.status(500).json({
            success: false,
            message: 'Server Error',
            error: error.message
        });
    }
};
