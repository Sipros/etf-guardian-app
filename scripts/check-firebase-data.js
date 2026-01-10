const admin = require('firebase-admin');
const fs = require('fs');

// Load service account
const serviceAccount = JSON.parse(fs.readFileSync('C:\\Users\\Admin\\Downloads\\etf-guardian-firebase-adminsdk-fbsvc-03800b523d.json', 'utf8'));

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkFirebaseData() {
  try {
    console.log('📊 Current Firebase Peaks:');
    console.log('================================');
    
    const snapshot = await db.collection('portfolio_assets').get();
    snapshot.forEach(doc => {
      const data = doc.data();
      console.log(`${doc.id}: ${data.name}`);
      console.log(`   Peak: $${data.massimo_attuale}`);
      console.log(`   Updated: ${data.data_massimo}`);
      console.log('');
    });
    
    console.log('🚨 Recent Alerts:');
    console.log('==================');
    
    const alerts = await db.collection('drawdown_alerts')
      .orderBy('timestamp', 'desc')
      .limit(5)
      .get();
    
    if (alerts.empty) {
      console.log('No alerts yet');
    } else {
      alerts.forEach(doc => {
        const data = doc.data();
        console.log(`${data.symbol}: ${data.drawdown.toFixed(2)}% at ${data.timestamp}`);
        console.log(`   Current: $${data.prezzo_corrente}, Peak: $${data.massimo}`);
        console.log('');
      });
    }
    
    console.log('✅ Firebase data check completed');
    
  } catch (error) {
    console.error('❌ Error checking Firebase data:', error);
  }
}

checkFirebaseData().then(() => {
  process.exit(0);
}).catch(error => {
  console.error('❌ Check failed:', error);
  process.exit(1);
});
