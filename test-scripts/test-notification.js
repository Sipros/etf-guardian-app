const admin = require('firebase-admin');
const fs = require('fs');
const axios = require('axios');

// Load service account
const serviceAccount = JSON.parse(fs.readFileSync('../scripts/service-account.json', 'utf8'));

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id
});

const db = admin.firestore();

// Get device tokens and send test notification
async function sendTestNotification() {
  try {
    console.log('🧪 ETF GUARDIAN - TEST NOTIFICATION');
    console.log('====================================');
    
    // Get all device tokens
    const tokensSnapshot = await db.collection('device_tokens').get();
    
    if (tokensSnapshot.empty) {
      console.log('❌ No device tokens found');
      console.log('💡 Make sure the app is running and has saved tokens');
      return;
    }
    
    const tokens = [];
    tokensSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.active && data.token) {
        tokens.push(doc.id);
      }
    });
    
    console.log(`📱 Found ${tokens.length} active device tokens`);
    
    // Create test message
    const message = {
      to: tokens,
      sound: 'default',
      title: '🧪 ETF Guardian Test',
      body: 'Sistema notifiche funzionante! Test da GitHub Actions.',
      data: {
        type: 'test',
        timestamp: new Date().toISOString(),
        source: 'github_actions_test'
      },
    };
    
    console.log('📤 Sending notification...');
    console.log(`📱 To: ${tokens.length} devices`);
    console.log(`📝 Title: ${message.title}`);
    console.log(`💬 Body: ${message.body}`);
    
    // Send notification
    const response = await axios.post('https://exp.host/--/api/v2/push/send', message, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
    });
    
    console.log('✅ Notification sent successfully!');
    console.log('📊 Response:', response.data);
    
    // Log test notification
    await db.collection('test_notifications').add({
      type: 'test',
      title: message.title,
      body: message.body,
      devices_count: tokens.length,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      response: response.data
    });
    
    console.log('📝 Test logged to Firebase');
    
  } catch (error) {
    console.error('❌ Error sending test notification:', error.message);
    if (error.response) {
      console.error('📊 Response:', error.response.data);
    }
  }
}

// Run test
sendTestNotification().then(() => {
  console.log('\n🎉 Test notification completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
