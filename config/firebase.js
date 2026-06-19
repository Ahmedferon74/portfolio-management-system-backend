const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccount.json');

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

// Initialize Firestore
const db = admin.firestore();

// Initialize Realtime Database
const realtimeDb = admin.database();

// Initialize Auth
const auth = admin.auth();

module.exports = {
  admin,
  db,
  realtimeDb,
  auth
};