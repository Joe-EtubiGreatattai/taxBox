const User = require('../models/User');
const Waitlist = require('../models/Waitlist');
const Contact = require('../models/Contact');

exports.getDashboardStats = async (req, res) => {
    try {
        // 1. Basic Counts
        // Some legacy users may not have role explicitly set to "user", so
        // count everyone who is NOT an admin to reflect real user total.
        const totalUsers = await User.countDocuments({ role: { $ne: 'admin' } });
        const totalWaitlist = await Waitlist.countDocuments();
        const totalMessages = await Contact.countDocuments();

        // 2. Receipt Stats
        // Use taxAmount for revenue to match how tax is stored on each receipt
        // and still track the underlying gross amount for potential future use.
        const receiptsAggregation = await User.aggregate([
            { $unwind: '$taxRecords' },
            {
                $group: {
                    _id: null,
                    count: { $sum: 1 },
                    totalTax: { $sum: '$taxRecords.taxAmount' },
                    totalAmount: { $sum: '$taxRecords.amount' },
                },
            },
        ]);

        const totalReceipts = receiptsAggregation[0]?.count || 0;
        // Revenue here is the total tax (VAT) calculated across all receipts,
        // which is what the rest of the system uses as "tax" / "revenue".
        const totalRevenue = receiptsAggregation[0]?.totalTax || 0;

        // 3. Pending Payments (number of unpaid monthly payment entries)
        const paymentsAggregation = await User.aggregate([
            { $unwind: '$monthlyPayments' },
            { $match: { 'monthlyPayments.isPaid': false } },
            { $count: 'pendingCount' },
        ]);
        const pendingPayments = paymentsAggregation[0]?.pendingCount || 0;

        // 4. Recent Activity Feed
        // Fetch recent users
        const recentUsers = await User.find({ role: 'user' })
            .sort({ createdAt: -1 })
            .limit(5)
            .select('name email createdAt')
            .lean();

        // Fetch recent receipts (requires aggregation since they are embedded)
        const recentReceipts = await User.aggregate([
            { $unwind: '$taxRecords' },
            { $sort: { 'taxRecords.createdAt': -1 } },
            { $limit: 5 },
            {
                $project: {
                    userName: '$name',
                    type: 'receipt',
                    amount: '$taxRecords.amount',
                    date: '$taxRecords.createdAt'
                }
            }
        ]);

        // Fetch recent waitlist joins
        const recentWaitlist = await Waitlist.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .select('name email createdAt')
            .lean();

        // Combine and sort activities
        let activities = [
            ...recentUsers.map(u => ({ type: 'user_signup', message: `New user signed up: ${u.name}`, date: u.createdAt })),
            ...recentReceipts.map(r => ({ type: 'receipt_upload', message: `${r.userName} uploaded a receipt of ₦${r.amount}`, date: r.date })),
            ...recentWaitlist.map(w => ({ type: 'waitlist_join', message: `${w.name} joined the waitlist`, date: w.createdAt }))
        ];

        // Sort by date descending and take top 10
        activities.sort((a, b) => new Date(b.date) - new Date(a.date));
        activities = activities.slice(0, 10);

        res.json({
            success: true,
            data: {
                totalUsers,
                totalWaitlist,
                totalMessages,
                totalReceipts,
                totalRevenue,
                pendingPayments,
                recentActivity: activities
            }
        });
    } catch (error) {
        console.error('Stats Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getAllUsers = async (req, res) => {
    try {
        // Align with dashboard stats: include all non-admin users
        const users = await User.find({ role: { $ne: 'admin' } })
            .sort({ createdAt: -1 })
            .lean();

        const now = new Date();

        const usersWithStats = users.map(user => {
            const taxRecords = user.taxRecords || [];
            const monthlyPayments = user.monthlyPayments || [];

            const totalReceipts = taxRecords.length;
            const totalSpent = taxRecords.reduce((sum, r) => sum + (r.amount || 0), 0);
            const totalTaxAllTime = taxRecords.reduce((sum, r) => sum + (r.taxAmount || 0), 0);
            const unpaidMonthsCount = monthlyPayments.filter(p => !p.isPaid && (p.totalTax || 0) > 0).length;

            let deletePhaseDaysRemaining = null;
            if (user.deleteRequestedAt) {
                const diffMs = now.getTime() - new Date(user.deleteRequestedAt).getTime();
                const elapsedDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                deletePhaseDaysRemaining = Math.max(0, 10 - elapsedDays);
            }

            return {
                _id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone || '',
                tin: user.tin || '',
                isActive: user.isActive,
                isSuspended: user.isSuspended || false,
                suspendedAt: user.suspendedAt || null,
                suspendedReason: user.suspendedReason || null,
                deleteRequestedAt: user.deleteRequestedAt || null,
                deleteRequestedReason: user.deleteRequestedReason || null,
                deletePhaseDaysRemaining,
                role: user.role,
                createdAt: user.createdAt,
                lastLogin: user.lastLogin,
                totalReceipts,
                totalSpent,
                totalTaxAllTime,
                unpaidMonthsCount,
            };
        });

        res.json({ success: true, data: usersWithStats });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Admin: suspend a user account with a reason
exports.suspendUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const { reason } = req.body;

        if (!reason) {
            return res.status(400).json({ success: false, message: 'Suspension reason is required' });
        }

        const user = await User.findById(userId);
        if (!user || user.role === 'admin') {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        user.isSuspended = true;
        user.isActive = false;
        user.suspendedAt = new Date();
        user.suspendedReason = reason;

        await user.save();

        return res.json({ success: true, message: 'User suspended successfully' });
    } catch (error) {
        console.error('Suspend user error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Admin: remove suspension from a user
exports.unsuspendUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findById(userId);
        if (!user || user.role === 'admin') {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        user.isSuspended = false;
        user.suspendedAt = null;
        // Reactivate only if not already scheduled for deletion
        user.isActive = !user.deleteRequestedAt;

        await user.save();

        return res.json({ success: true, message: 'User unsuspended successfully' });
    } catch (error) {
        console.error('Unsuspend user error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Admin: request deletion for a user (10-day grace period), with reason
exports.requestUserDeletion = async (req, res) => {
    try {
        const { userId } = req.params;
        const { reason } = req.body;

        if (!reason) {
            return res.status(400).json({ success: false, message: 'Deletion reason is required' });
        }

        const user = await User.findById(userId);
        if (!user || user.role === 'admin') {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (user.deleteRequestedAt) {
            return res.json({ success: true, message: 'User is already scheduled for deletion' });
        }

        user.isActive = false;
        user.deleteRequestedAt = new Date();
        user.deleteRequestedReason = reason;

        await user.save();

        return res.json({ success: true, message: 'User scheduled for deletion in 10 days' });
    } catch (error) {
        console.error('Request user deletion error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Admin: permanently delete a user immediately (hard delete)
const { hardDeleteUserById } = require('../services/userCleanupService');

exports.deleteUserNow = async (req, res) => {
    try {
        const { userId } = req.params;
        const { reason } = req.body;

        if (!reason) {
            return res.status(400).json({ success: false, message: 'Deletion reason is required' });
        }

        const user = await User.findById(userId);
        if (!user || user.role === 'admin') {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const result = await hardDeleteUserById(userId, { reason });

        if (!result.deleted) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        return res.json({ success: true, message: 'User deleted permanently' });
    } catch (error) {
        console.error('Delete user now error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

const { chatWithMercyAdmin } = require('../services/openaiService');

exports.handleAdminChat = async (req, res) => {
    try {
        const { message, history } = req.body;

        // Gather context for the AI
        const totalUsers = await User.countDocuments({ role: { $ne: 'admin' } });
        const users = await User.find({ 'taxRecords.0': { $exists: true } }).lean();

        let totalRevenue = 0;
        let totalReceipts = 0;

        users.forEach(user => {
            if (user.taxRecords) {
                totalReceipts += user.taxRecords.length;
                user.taxRecords.forEach(record => {
                    totalRevenue += (record.taxAmount || 0);
                });
            }
        });

        const adminContext = {
            totalUsers,
            totalRevenue: `₦${totalRevenue.toLocaleString()}`,
            totalReceipts,
            pendingPayments: 'Calculated on request' // Optimization: don't calc everything unless needed
        };

        const response = await chatWithMercyAdmin(message, history || [], adminContext);

        res.json({ success: true, message: response });
    } catch (error) {
        console.error('Admin chat error:', error);
        res.status(500).json({ success: false, message: 'Chat failed' });
    }
};

exports.getAllReceipts = async (req, res) => {
    try {
        const users = await User.find({ 'taxRecords.0': { $exists: true } })
            .select('name email taxRecords');

        let allReceipts = [];
        users.forEach(user => {
            user.taxRecords.forEach(receipt => {
                allReceipts.push({
                    ...receipt.toObject(),
                    userName: user.name,
                    userEmail: user.email,
                    userId: user._id
                });
            });
        });

        // Sort by date desc
        allReceipts.sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json({ success: true, data: allReceipts });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getAllPayments = async (req, res) => {
    try {
        const users = await User.find({ 'monthlyPayments.0': { $exists: true } })
            .select('name email monthlyPayments');

        let allPayments = [];
        users.forEach(user => {
            user.monthlyPayments.forEach(payment => {
                allPayments.push({
                    ...payment.toObject(),
                    userName: user.name,
                    userEmail: user.email,
                    userId: user._id
                });
            });
        });

        allPayments.sort((a, b) => {
            if (a.year !== b.year) return b.year - a.year;
            return b.month.localeCompare(a.month);
        });

        res.json({ success: true, data: allPayments });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.adminLogin = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (!user || user.role !== 'admin') {
            return res.status(401).json({ success: false, message: 'Invalid credentials or not an admin' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const token = user.generateAuthToken();
        res.json({ success: true, token, user: { name: user.name, email: user.email, role: user.role } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateAdminProfile = async (req, res) => {
    try {
        const { name, password } = req.body;
        const userId = req.user._id;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (name) user.name = name;
        if (password) user.password = password; // Will be hashed by pre-save hook

        await user.save();

        res.json({ success: true, message: 'Profile updated successfully', user: { name: user.name, email: user.email, role: user.role } });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.createAdmin = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Email already in use' });
        }

        const newAdmin = new User({
            name,
            email,
            password,
            role: 'admin',
            isActive: true
        });

        await newAdmin.save();

        res.status(201).json({ success: true, message: 'New admin created successfully' });
    } catch (error) {
        console.error('Create admin error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
