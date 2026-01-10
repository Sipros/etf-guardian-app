import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, getDoc, setDoc, updateDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "YOUR_API_KEY",
  authDomain: "etf-guardian-clean.firebaseapp.com",
  projectId: "etf-guardian-clean",
  storageBucket: "etf-guardian-clean.appspot.com",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "YOUR_SENDER_ID",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "YOUR_APP_ID",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

export { db, storage, collection, doc, getDoc, setDoc, updateDoc, serverTimestamp, query, where, getDocs };

// Firebase Admin for server-side (GitHub Actions)
export const adminConfig = {
  projectId: "etf-guardian-clean",
  clientEmail: process.env.FIREBASE_SERVICE_ACCOUNT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

export default app;
