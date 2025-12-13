require('dotenv').config();
const mongoose = require('mongoose');
const Waitlist = require('./models/Waitlist');
const { sendWaitlistConfirmationEmail } = require('./services/emailService');

/**
 * One-time script to send confirmation emails to all existing waitlist members
 * Run with: node sendWaitlistEmails.js
 */

async function sendEmailsToWaitlist() {
    try {
        // Connect to MongoDB
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ MongoDB connected successfully\n');

        // Fetch all waitlist members
        console.log('📋 Fetching waitlist members...');
        const waitlistMembers = await Waitlist.find({});
        console.log(`✅ Found ${waitlistMembers.length} members on the waitlist\n`);

        if (waitlistMembers.length === 0) {
            console.log('ℹ️  No members found on the waitlist. Exiting.');
            await mongoose.connection.close();
            return;
        }

        // Send emails to each member
        console.log('📧 Starting to send confirmation emails...\n');
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < waitlistMembers.length; i++) {
            const member = waitlistMembers[i];
            const progress = `[${i + 1}/${waitlistMembers.length}]`;

            try {
                console.log(`${progress} Sending email to: ${member.email} (${member.name})`);

                const result = await sendWaitlistConfirmationEmail(member.name, member.email);

                if (result.success) {
                    successCount++;
                    console.log(`${progress} ✅ Email sent successfully to ${member.email}\n`);
                } else {
                    failCount++;
                    console.error(`${progress} ❌ Failed to send email to ${member.email}: ${result.error}\n`);
                }

                // Add a small delay to avoid rate limiting (500ms between emails)
                await new Promise(resolve => setTimeout(resolve, 500));

            } catch (error) {
                failCount++;
                console.error(`${progress} ❌ Error sending email to ${member.email}:`, error.message, '\n');
            }
        }

        // Summary
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 SUMMARY');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`Total members: ${waitlistMembers.length}`);
        console.log(`✅ Successfully sent: ${successCount}`);
        console.log(`❌ Failed: ${failCount}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Close connection
        await mongoose.connection.close();
        console.log('🔌 MongoDB connection closed');
        console.log('\n✨ Script completed!');

    } catch (error) {
        console.error('❌ Script error:', error);
        process.exit(1);
    }
}

// Run the script
console.log('🚀 Starting waitlist email migration...\n');
sendEmailsToWaitlist();
