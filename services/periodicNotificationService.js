const User = require('../models/User');
const pushService = require('./pushService');

const { generatePersonalizedEngagement } = require('./openaiService');

class PeriodicNotificationService {
    constructor() {
        this.intervalId = null;
        this.isRunning = false;
    }

    // Generate a fallback motivational/helpful message
    generateFallbackMessage() {
        const messages = [
            {
                title: '📊 Tax Reminder',
                body: 'Don\'t forget to track your receipts! Stay on top of your taxes.',
            },
            {
                title: '💡 Tax Tip',
                body: 'Keep all your receipts organized for easier tax filing.',
            },
            {
                title: '🎯 Stay Organized',
                body: 'Upload your receipts regularly to avoid last-minute stress.',
            },
            {
                title: '📱 Tax-e Update',
                body: 'Your tax assistant is here to help! Upload receipts anytime.',
            },
            {
                title: '✨ Quick Reminder',
                body: 'Track your expenses today for a stress-free tax season tomorrow.',
            },
            {
                title: '💰 Financial Health',
                body: 'Regular receipt tracking helps you understand your spending better.',
            },
            {
                title: '📈 Tax Planning',
                body: 'Stay ahead of your tax obligations by tracking receipts consistently.',
            },
            {
                title: '🌟 Tax-e Tip',
                body: 'Did you know? Organized receipts can maximize your tax deductions.',
            },
        ];

        // Return a random message
        return messages[Math.floor(Math.random() * messages.length)];
    }

    // Helper: Calculate user stats for context
    async getUserStats(user) {
        try {
            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();

            // Filter for current month receipts
            const monthRecords = user.taxRecords.filter(r => {
                const d = new Date(r.date);
                return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
            });

            // Calculate totals
            const currentMonthSpent = monthRecords
                .filter(r => r.type !== 'income')
                .reduce((sum, r) => sum + (r.amount || 0), 0);

            // Get monthly payment record for tax
            const monthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
            const monthlyPayment = user.monthlyPayments?.find(p => p.month === monthKey);
            const currentMonthTax = monthlyPayment ? monthlyPayment.totalTax : 0;

            // Last receipt date
            let daysSinceLastReceipt = 7; // Default if no receipts
            if (user.taxRecords.length > 0) {
                const sorted = [...user.taxRecords].sort((a, b) => new Date(b.date) - new Date(a.date));
                const lastDate = new Date(sorted[0].date);
                const diffTime = Math.abs(now - lastDate);
                daysSinceLastReceipt = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            }

            return {
                name: user.name || 'Friend',
                currentMonthSpent,
                currentMonthTax,
                daysSinceLastReceipt,
                receiptCount: monthRecords.length
            };
        } catch (error) {
            console.error('Error calculating user stats:', error);
            return {
                name: user.name || 'Friend',
                currentMonthSpent: 0,
                currentMonthTax: 0,
                daysSinceLastReceipt: 0,
                receiptCount: 0
            };
        }
    }

    // Send notifications to all active users
    async sendPeriodicNotifications() {
        try {
            console.log('⏰ Sending periodic push notifications...');

            // Get all active users with push tokens
            // Populate taxRecords and monthlyPayments to calculate stats
            const users = await User.find({
                isActive: true,
                expoPushToken: { $exists: true, $ne: null },
            }).select('name expoPushToken taxRecords monthlyPayments lastEngagementNotification');

            if (!users || users.length === 0) {
                console.log('ℹ️ No active users with push tokens found');
                return;
            }

            console.log(`Testing: Generating personalized prompts for ${users.length} users...`);

            // Send notification to each user
            let successCount = 0;
            for (const user of users) {
                try {
                    // 1. Check if user should receive notification (2h cooldown)
                    const lastSent = user.lastEngagementNotification ? new Date(user.lastEngagementNotification) : null;
                    const now = new Date();
                    const hoursSinceLast = lastSent ? (now - lastSent) / (1000 * 60 * 60) : 24; // If never sent, treat as > 24h

                    if (hoursSinceLast < 2) {
                        // console.log(`⏳ Skipping ${user.name} (Last sent ${hoursSinceLast.toFixed(1)}h ago)`);
                        continue;
                    }

                    // 2. Get User Context
                    const context = await this.getUserStats(user);

                    // 3. Generate Personalized Message via AI
                    // Note: In production with many users, might want to limit AI calls or batch them.
                    // For now, doing it per user for maximum personalization as requested.
                    const message = await generatePersonalizedEngagement(context);

                    // 4. Send Push
                    await pushService.sendPushToToken(user.expoPushToken, {
                        title: message.title,
                        message: message.body,
                        type: 'reminder',
                        url: '/chat', // Deep link to chat
                        metadata: {
                            sentAt: new Date().toISOString(),
                            automated: true,
                            personalized: true
                        },
                    });

                    // 5. Update lastEngagementNotification
                    user.lastEngagementNotification = new Date();
                    await user.save();

                    successCount++;

                    // Small delay to be nice to API limits if many users
                    await new Promise(r => setTimeout(r, 500));

                } catch (error) {
                    console.error(`❌ Failed to send to user ${user._id}:`, error.message);
                }
            }

            console.log(`✅ Periodic notifications sent successfully to ${successCount}/${users.length} users`);
        } catch (error) {
            console.error('❌ Error sending periodic notifications:', error);
        }
    }

    // Start the periodic notification service
    start() {
        if (this.isRunning) {
            console.log('⚠️ Periodic notification service is already running');
            return;
        }

        console.log('🚀 Starting periodic notification service (every 1 hour)');

        // Send first notification immediately - DISABLED to allow standard scheduling and prevent restart spam
        // this.sendPeriodicNotifications();

        // Then send every hour (3600000 milliseconds = 1 hour)
        this.intervalId = setInterval(() => {
            this.sendPeriodicNotifications();
        }, 3600000); // 1 hour

        this.isRunning = true;
        console.log('✅ Periodic notification service started');
    }

    // Stop the periodic notification service
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            this.isRunning = false;
            console.log('🛑 Periodic notification service stopped');
        }
    }
}

module.exports = new PeriodicNotificationService();
