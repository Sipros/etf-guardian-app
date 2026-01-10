const admin = require('firebase-admin');
const fs = require('fs');

// Load service account
const serviceAccount = JSON.parse(fs.readFileSync('C:\\Users\\Admin\\Downloads\\etf-guardian-firebase-adminsdk-fbsvc-03800b523d.json', 'utf8'));

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id
});

const db = admin.firestore();

async function checkDeviceTokens() {
  try {
    console.log('📱 Checking device tokens in Firebase...');
    
    const tokensSnapshot = await db.collection('device_tokens').get();
    
    if (tokensSnapshot.empty) {
      console.log('❌ No device tokens found in Firebase');
      console.log('💡 Make sure the app is running and has saved the token');
    } else {
      console.log(`✅ Found ${tokensSnapshot.size} device token(s):`);
      tokensSnapshot.forEach(doc => {
        const data = doc.data();
        console.log(`   📱 Token: ${doc.id}`);
        console.log(`   📱 Platform: ${data.platform}`);
        console.log(`   📱 Created: ${data.created_at}`);
        console.log(`   📱 Active: ${data.active}`);
        console.log('');
      });
    }
    
    // Test manual notification
    if (!tokensSnapshot.empty) {
      console.log('🧪 Sending test notification to all devices...');
      
      const tokens = [];
      tokensSnapshot.forEach(doc => {
        tokens.push(doc.id);
      });
      
      const message = {
        to: tokens,
        sound: 'default',
        title: '🧪 ETF Guardian Test',
        body: 'Sistema notifiche funzionante! Token salvato correttamente.',
        data: {
          type: 'test',
          timestamp: new Date().toISOString()
        },
      };
      
      const axios = require('axios');
      try {
        const response = await axios.post('https://exp.host/--/api/v2/push/send', message, {
          headers: {
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
        });
        
        console.log('✅ Test notification sent!');
        console.log('Response:', response.data);
      } catch (error) {
        console.error('❌ Error sending test notification:', error.message);
      }
    }
    
  } catch (error) {
    console.error('❌ Error checking device tokens:', error);
  }
}

checkDeviceTokens().then(() => {
  console.log('\n🎉 Device token check completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Check failed:', error);
  process.exit(1);
});
