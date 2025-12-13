const admin = require('firebase-admin');

let app;

const serviceAccount = require('../serviceAccount.json');

if (!admin.apps.length) {
  try {
    app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('✅ Firebase Admin initialized with serviceAccount.json');
  } catch (error) {
    console.error('❌ Firebase Admin initialization failed:', error.message);
    throw error;
  }
} else {
  app = admin.app();
}

module.exports = {
  admin,
  app,
};
