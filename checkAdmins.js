require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function listAdmins() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const admins = await User.find({ role: 'admin' }).select('email name');
        console.log('--- ADIMIN USERS ---');
        if (admins.length === 0) {
            console.log('No admins found.');
        } else {
            admins.forEach(admin => {
                console.log(`Email: ${admin.email}, Name: ${admin.name}`);
            });
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

listAdmins();
