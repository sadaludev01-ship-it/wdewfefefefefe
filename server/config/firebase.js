// Firebase Admin configuration for backend
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Firebase configuration - using same project as frontend
const firebaseConfig = {
  apiKey: "AIzaSyCJIjb2CN9AmZIqnJDyiyz2pFB_E3bgt_E",
  authDomain: "buddy-voicechat.firebaseapp.com",
  databaseURL: "https://buddy-voicechat-default-rtdb.firebaseio.com",
  projectId: "buddy-voicechat",
  storageBucket: "buddy-voicechat.firebasestorage.app",
  messagingSenderId: "821470144439",
  appId: "1:821470144439:web:0278edab8683a6d6966a32",
  measurementId: "G-R782W0VLFY"
};

let firebaseApp = null;
let database = null;

/**
 * Initialize Firebase Admin SDK
 */
function initializeFirebase() {
  try {
    if (firebaseApp) return { app: firebaseApp, database };

    // Determine credentials
    let credential = null;
    const svcEnv = process.env.FIREBASE_SERVICE_ACCOUNT; // JSON string
    const localKeyPath = path.join(__dirname, 'serviceAccountKey.json');
    const gcloudADC = process.env.GOOGLE_APPLICATION_CREDENTIALS;

    if (svcEnv) {
      try {
        const svcObj = JSON.parse(svcEnv);
        credential = admin.credential.cert(svcObj);
        console.log('Using FIREBASE_SERVICE_ACCOUNT for Firebase Admin');
      } catch (e) {
        console.warn('FIREBASE_SERVICE_ACCOUNT is not valid JSON, ignoring');
      }
    }

    if (!credential && fs.existsSync(localKeyPath)) {
      try {
        const svcObj = JSON.parse(fs.readFileSync(localKeyPath, 'utf8'));
        credential = admin.credential.cert(svcObj);
        console.log('Using local serviceAccountKey.json for Firebase Admin');
      } catch (e) {
        console.warn('Failed to read local serviceAccountKey.json:', e.message);
      }
    }

    if (!credential && gcloudADC) {
      try {
        credential = admin.credential.applicationDefault();
        console.log('Using GOOGLE_APPLICATION_CREDENTIALS for Firebase Admin');
      } catch (e) {
        console.warn('applicationDefault() not available:', e.message);
      }
    }

    if (!credential) {
      console.warn('No Firebase Admin credentials found. Falling back to REST mode only.');
      firebaseApp = null;
      database = null;
      return { app: null, database: null };
    }

    firebaseApp = admin.initializeApp({
      credential,
      databaseURL: firebaseConfig.databaseURL,
      projectId: firebaseConfig.projectId,
    });
    database = admin.database();
    console.log('Firebase Admin initialized successfully with credentials');
    return { app: firebaseApp, database };
  } catch (error) {
    console.error('Firebase Admin initialization failed:', error);
    // Continue without Admin SDK (REST mode)
    firebaseApp = null;
    database = null;
    return { app: null, database: null };
  }
}

/**
 * Get Firebase database instance
 */
function getDatabase() {
  if (!database) {
    const { database: db } = initializeFirebase();
    return db;
  }
  return database;
}

/**
 * Check if Firebase is available
 */
function isFirebaseAvailable() {
  return database !== null;
}

module.exports = {
  initializeFirebase,
  getDatabase,
  isFirebaseAvailable,
  firebaseConfig
};
