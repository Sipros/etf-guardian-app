const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc, serverTimestamp } = require('firebase/firestore');

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: "etf-guardian-clean.firebaseapp.com",
  projectId: "etf-guardian-clean",
  storageBucket: "etf-guardian-clean.appspot.com",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID
};

console.log('🔧 Firebase Config:', {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ? '✅ Set' : '❌ Missing',
  projectId: firebaseConfig.projectId,
  authDomain: firebaseConfig.authDomain
});

// Initialize Firebase
try {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  console.log('✅ Firebase initialized successfully');
  
  // Test write
  async function testWrite() {
    try {
      console.log('📝 Testing write to Firebase...');
      
      const testRef = doc(db, 'test_collection', 'test_document');
      await setDoc(testRef, {
        message: 'Hello from ETF Guardian!',
        timestamp: serverTimestamp(),
        test: true
      });
      
      console.log('✅ Write successful! Firebase is working.');
      
      // Test portfolio write
      console.log('📊 Testing portfolio write...');
      const portfolioRef = doc(db, 'portfolio_assets', 'VOO');
      await setDoc(portfolioRef, {
        symbol: 'VOO',
        name: 'Vanguard S&P 500',
        type: 'ETF',
        data_inizio: new Date().toISOString(),
        prezzo_inizio: 638.31,
        massimo_attuale: 638.31,
        data_massimo: new Date().toISOString(),
        threshold_alert: 15,
        attivo: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      
      console.log('✅ Portfolio write successful!');
      
    } catch (error) {
      console.error('❌ Write failed:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      
      if (error.code === 7) {
        console.log('🔍 PERMISSION_DENIED - Check Firebase Security Rules');
        console.log('📋 Go to Firebase Console → Firestore → Rules');
        console.log('📝 Try these rules:');
        console.log(`
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
        `);
      }
    }
  }
  
  testWrite();
  
} catch (error) {
  console.error('❌ Firebase initialization failed:', error);
}
