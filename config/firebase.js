const admin = require('firebase-admin');

let app;

const firebaseConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
};

if (!admin.apps.length) {
  if (!firebaseConfig.projectId || !firebaseConfig.privateKey || !firebaseConfig.clientEmail) {
    console.error('⚠️ Firebase Admin environment variables are missing. Google Auth will not work.');
  } else {
    try {
      app = admin.initializeApp({
        credential: admin.credential.cert(firebaseConfig),
      });
      console.log('✅ Firebase Admin initialized with environment variables');
    } catch (error) {
      console.error('❌ Firebase Admin initialization failed:', error.message);
      // Don't throw to allow the server to start for other features
    }
  }
} else {
  app = admin.app();
}

module.exports = {
  admin,
  app,
};
