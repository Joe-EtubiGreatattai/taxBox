const admin = require('firebase-admin');

let app;

const firebaseConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
};

if (!admin.apps.length) {
  try {
    app = admin.initializeApp({
      credential: admin.credential.cert(firebaseConfig),
    });
    console.log('✅ Firebase Admin initialized with environment variables');
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
