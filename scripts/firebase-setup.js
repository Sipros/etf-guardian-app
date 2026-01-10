const { initializeApp } = require('firebase/app');
const { getFirestore, collection, doc, setDoc, serverTimestamp } = require('firebase/firestore');

// Firebase configuration (same as app)
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: "etf-guardian-clean.firebaseapp.com",
  projectId: "etf-guardian-clean",
  storageBucket: "etf-guardian-clean.appspot.com",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Mock assets with current data as initial peaks
const mockAssets = [
  {
    symbol: 'VOO',
    name: 'Vanguard S&P 500',
    type: 'ETF',
    current_price: 638.31,
    monthly_investment: 500,
    allocation: 35
  },
  {
    symbol: 'BTC',
    name: 'Bitcoin', 
    type: 'CRYPTO',
    current_price: 90524.70,
    monthly_investment: 300,
    allocation: 25
  },
  {
    symbol: 'ETH',
    name: 'Ethereum',
    type: 'CRYPTO',
    current_price: 2280.75,
    monthly_investment: 250,
    allocation: 18
  },
  {
    symbol: 'BND',
    name: 'Vanguard Bond ETF',
    type: 'ETF',
    current_price: 76.42,
    monthly_investment: 200,
    allocation: 12
  },
  {
    symbol: 'SOL',
    name: 'Solana',
    type: 'CRYPTO',
    current_price: 187.30,
    monthly_investment: 150,
    allocation: 10
  }
];

// Initialize portfolio with current data as peaks
async function initializePortfolio() {
  console.log('🚀 Initializing Firebase portfolio with current data...');
  
  const now = new Date().toISOString();
  
  for (const asset of mockAssets) {
    const assetRef = doc(db, 'portfolio_assets', asset.symbol);
    
    try {
      // Create new asset with current price as initial peak
      const portfolioAsset = {
        symbol: asset.symbol,
        name: asset.name,
        type: asset.type,
        data_inizio: now,
        prezzo_inizio: asset.current_price,
        massimo_attuale: asset.current_price, // Current price becomes initial peak
        data_massimo: now,
        threshold_alert: 15,
        attivo: true,
        created_at: now,
        updated_at: now
      };
      
      await setDoc(assetRef, portfolioAsset);
      console.log(`✅ Initialized ${asset.symbol} with peak: $${asset.current_price}`);
    } catch (error) {
      if (error.code === 6) {
        console.log(`ℹ️ ${asset.symbol} already exists in portfolio`);
      } else {
        console.error(`❌ Error initializing ${asset.symbol}:`, error);
      }
    }
  }
  
  console.log('🎉 Firebase portfolio initialization completed!');
  console.log('📊 Assets configured with current prices as initial peaks');
  console.log('⚡ GitHub Actions will now update peaks when prices rise');
  console.log('📱 App will show real drawdowns based on Firebase peaks');
}

// Run initialization
initializePortfolio().catch(console.error);
