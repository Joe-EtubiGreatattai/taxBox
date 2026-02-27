require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function createAdmin() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        const existingAdmin = await User.findOne({ email: 'admin@tax-e.com' });
        if (existingAdmin) {
            console.log('Admin already exists.');
            existingAdmin.role = 'admin';
            existingAdmin.password = 'admin123';
            await existingAdmin.save();
            console.log('Admin updated with password: admin123');
        } else {
            const admin = new User({
                name: 'System Admin',
                email: 'admin@tax-e.com',
                password: 'admin123',
                role: 'admin',
                phone: '0000000000', // Dummy unique phone
                tin: 'ADMIN-001',      // Dummy unique TIN
                isActive: true
            });
            await admin.save();
            console.log('Admin created successfully.');
            console.log('Email: admin@tax-e.com');
            console.log('Password: admin123');
        }
        process.exit(0);
    } catch (err) {
        console.error('Error creating admin:', err);
        process.exit(1);
    }
}

createAdmin();
