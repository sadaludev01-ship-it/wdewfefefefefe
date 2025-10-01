// Firebase configuration and initialization
import { initializeApp } from 'firebase/app';
import { getDatabase, Database } from 'firebase/database';

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

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Realtime Database and get a reference to the service
export const database: Database = getDatabase(app);

export default app;
