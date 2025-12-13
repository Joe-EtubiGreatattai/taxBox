require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const connectDB = require('./config/database');

const seedAdmin = async () => {
    await connectDB();

    const adminEmail = 'admin@tax-e.com';
    const adminPassword = 'adminpassword123'; // Change this in production!

    try {
        let admin = await User.findOne({ email: adminEmail });
        if (admin) {
            console.log('Admin user already exists');
            if (admin.role !== 'admin') {
                admin.role = 'admin';
                await admin.save();
                console.log('Updated existing user to admin role');
            }
        } else {
            admin = new User({
                name: 'Super Admin',
                email: adminEmail,
                password: adminPassword,
                role: 'admin',
                phone: '00000000000', // Dummy phone
                tin: 'ADMIN-TIN'
            });
            await admin.save();
            console.log('Admin user created successfully');
        }
    } catch (error) {
        console.error('Error seeding admin:', error);
    } finally {
        mongoose.connection.close();
    }
};

seedAdmin();
