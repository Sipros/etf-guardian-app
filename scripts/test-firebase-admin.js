const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Load service account
const serviceAccountPath = 'C:\\Users\\Admin\\Downloads\\etf-guardian-firebase-adminsdk-fbsvc-03800b523d.json';

console.log('🔧 Loading service account from:', serviceAccountPath);

let serviceAccount;
try {
  serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  console.log('✅ Service account loaded successfully');
  console.log('📋 Project ID:', serviceAccount.project_id);
} catch (error) {
  console.error('❌ Error loading service account:', error.message);
  process.exit(1);
}

// Initialize Firebase Admin
try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id
  });
  
  console.log('✅ Firebase Admin initialized successfully');
} catch (error) {
  console.error('❌ Firebase Admin initialization failed:', error.message);
  process.exit(1);
}

const db = admin.firestore();

// Test write with Admin SDK
async function testAdminWrite() {
  try {
    console.log('📝 Testing write with Firebase Admin SDK...');
    
    // Test simple write
    const testRef = db.collection('test_collection').doc('test_document');
    await testRef.set({
      message: 'Hello from ETF Guardian Admin SDK!',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      test: true,
      method: 'admin_sdk'
    });
    
    console.log('✅ Admin SDK write successful!');
    
    // Test portfolio write
    console.log('📊 Testing portfolio assets write...');
    
    const portfolioAssets = [
      {
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
      },
      {
        symbol: 'BTC',
        name: 'Bitcoin',
        type: 'CRYPTO',
        data_inizio: new Date().toISOString(),
        prezzo_inizio: 90524.70,
        massimo_attuale: 90524.70,
        data_massimo: new Date().toISOString(),
        threshold_alert: 15,
        attivo: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        symbol: 'ETH',
        name: 'Ethereum',
        type: 'CRYPTO',
        data_inizio: new Date().toISOString(),
        prezzo_inizio: 2280.75,
        massimo_attuale: 2280.75,
        data_massimo: new Date().toISOString(),
        threshold_alert: 15,
        attivo: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        symbol: 'BND',
        name: 'Vanguard Bond ETF',
        type: 'ETF',
        data_inizio: new Date().toISOString(),
        prezzo_inizio: 76.42,
        massimo_attuale: 76.42,
        data_massimo: new Date().toISOString(),
        threshold_alert: 15,
        attivo: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        symbol: 'SOL',
        name: 'Solana',
        type: 'CRYPTO',
        data_inizio: new Date().toISOString(),
        prezzo_inizio: 187.30,
        massimo_attuale: 187.30,
        data_massimo: new Date().toISOString(),
        threshold_alert: 15,
        attivo: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];
    
    for (const asset of portfolioAssets) {
      const assetRef = db.collection('portfolio_assets').doc(asset.symbol);
      await assetRef.set(asset);
      console.log(`✅ Created ${asset.symbol} with peak: $${asset.massimo_attuale}`);
    }
    
    // Test read back
    console.log('📖 Testing read from Firebase...');
    const snapshot = await db.collection('portfolio_assets').get();
    console.log(`📊 Found ${snapshot.size} assets in portfolio`);
    
    snapshot.forEach(doc => {
      const data = doc.data();
      console.log(`   ${doc.id}: ${data.name} - Peak: $${data.massimo_attuale}`);
    });
    
    console.log('\n🎉 Firebase Admin SDK is fully working!');
    console.log('📈 Portfolio assets created with current prices as peaks');
    console.log('🔥 Ready for GitHub Actions integration!');
    
  } catch (error) {
    console.error('❌ Admin SDK write failed:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
  }
}

// Run test
testAdminWrite().then(() => {
  console.log('\n✅ Test completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
