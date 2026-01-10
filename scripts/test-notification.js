const axios = require('axios');

// Simple test notification without Firebase
async function sendTestNotification() {
  try {
    console.log('Sending test notification...');
    
    // Get your token from the app console or alert
    // It will look like: "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
    const expoPushToken = 'ExponentPushToken[PASTE_YOUR_TOKEN_HERE]'; // Replace with your actual token
    
    if (expoPushToken.includes('PASTE_YOUR_TOKEN_HERE')) {
      console.log('❌ Please update the token in this file!');
      console.log('📱 Run the app to get your token from the console/alert');
      return;
    }
    
    const response = await axios.post('https://exp.host/--/api/v2/push/send', {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.EXPO_PUSH_TOKEN}`,
      },
      data: {
        to: expoPushToken,
        title: '🧪 Test Notification',
        body: 'ETF Guardian is working! This is a test alert.',
        data: {
          type: 'test',
          timestamp: new Date().toISOString(),
        },
      },
    });

    console.log('✅ Test notification sent:', response.data);
  } catch (error) {
    console.error('❌ Error sending test notification:', error.message);
    if (error.response) {
      console.log('Response data:', error.response.data);
    }
  }
}

// Test Yahoo Finance API
async function testYahooFinance() {
  try {
    console.log('Testing Yahoo Finance API...');
    
    // Test ETF
    const etfResponse = await axios.get('https://query1.finance.yahoo.com/v8/finance/chart/VOO', {
      params: {
        interval: '1d',
        range: '1d',
      },
    });
    
    const etfData = etfResponse.data.chart.result[0];
    console.log('VOO ETF:', {
      price: etfData.meta.regularMarketPrice,
      change: etfData.meta.regularMarketPrice - etfData.meta.chartPreviousClose,
      changePercent: ((etfData.meta.regularMarketPrice - etfData.meta.chartPreviousClose) / etfData.meta.chartPreviousClose * 100).toFixed(2)
    });
    
    // Test Crypto
    const cryptoResponse = await axios.get('https://query1.finance.yahoo.com/v8/finance/chart/BTC-USD', {
      params: {
        interval: '1d',
        range: '1d',
      },
    });
    
    const cryptoData = cryptoResponse.data.chart.result[0];
    console.log('BTC-USD:', {
      price: cryptoData.meta.regularMarketPrice,
      change: cryptoData.meta.regularMarketPrice - cryptoData.meta.chartPreviousClose,
      changePercent: ((cryptoData.meta.regularMarketPrice - cryptoData.meta.chartPreviousClose) / cryptoData.meta.chartPreviousClose * 100).toFixed(2)
    });
    
  } catch (error) {
    console.error('Error testing Yahoo Finance:', error.message);
  }
}

// Run tests
async function runTests() {
  console.log('🧪 Running ETF Guardian Tests...\n');
  
  await testYahooFinance();
  console.log('\n');
  await sendTestNotification();
}

runTests();
