const axios = require('axios');
const admin = require('firebase-admin');
const fs = require('fs');

// Load service account
const serviceAccountPath = 'service-account.json';
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id
});

const db = admin.firestore();

console.log('🔥 Firebase Admin initialized for ETF Guardian');

// Portfolio assets to monitor
const MONITOR_ASSETS = [
  { symbol: 'VOO', name: 'Vanguard S&P 500', type: 'ETF' },
  { symbol: 'BTC', name: 'Bitcoin', type: 'CRYPTO' },
  { symbol: 'ETH', name: 'Ethereum', type: 'CRYPTO' },
  { symbol: 'BND', name: 'Vanguard Bond ETF', type: 'ETF' },
  { symbol: 'SOL', name: 'Solana', type: 'CRYPTO' },
];

// Fetch ETF price from Yahoo Finance
async function fetchETFPrice(symbol) {
  try {
    const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`, {
      params: {
        interval: '1d',
        range: '1d',
      },
    });

    const data = response.data.chart.result[0];
    const currentPrice = data.meta.regularMarketPrice;
    const previousClose = data.meta.chartPreviousClose;
    const change = currentPrice - previousClose;
    const changePercent = (change / previousClose) * 100;

    return {
      symbol,
      price: currentPrice,
      change,
      changePercent,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`Error fetching ETF price for ${symbol}:`, error.message);
    return null;
  }
}

// Get asset peak from Firebase
async function getAssetPeak(symbol) {
  try {
    const assetRef = db.collection('portfolio_assets').doc(symbol);
    const assetDoc = await assetRef.get();
    
    if (assetDoc.exists) {
      return assetDoc.data().massimo_attuale || null;
    }
    return null;
  } catch (error) {
    console.error(`Error getting peak for ${symbol}:`, error.message);
    return null;
  }
}

// Update asset peak in Firebase
async function updateAssetPeak(symbol, newPeak) {
  try {
    const assetRef = db.collection('portfolio_assets').doc(symbol);
    const now = new Date().toISOString();
    
    await assetRef.update({
      massimo_attuale: newPeak,
      data_massimo: now,
      updated_at: now
    });
    
    console.log(`📈 Updated ${symbol} peak to: $${newPeak}`);
    return true;
  } catch (error) {
    console.error(`Error updating peak for ${symbol}:`, error.message);
    return false;
  }
}

// Calculate real drawdown based on Firebase peak
async function calculateDrawdown(symbol, currentPrice) {
  try {
    const peak = await getAssetPeak(symbol);
    if (!peak) return 0;
    
    const drawdown = ((currentPrice - peak) / peak) * 100;
    return drawdown;
  } catch (error) {
    console.error(`Error calculating drawdown for ${symbol}:`, error.message);
    return 0;
  }
}

// Log drawdown alert to Firebase
async function logDrawdownAlert(symbol, assetName, drawdown, threshold, currentPrice, peak) {
  try {
    const alertId = `alert_${new Date().toISOString().replace(/[:.]/g, '').replace('T', '_')}_${symbol.toLowerCase()}`;
    const alertRef = db.collection('drawdown_alerts').doc(alertId);
    
    const alertData = {
      symbol,
      asset_name: assetName,
      drawdown,
      threshold,
      prezzo_corrente: currentPrice,
      massimo: peak,
      timestamp: new Date().toISOString(),
      notifica_inviata: true
    };
    
    await alertRef.set(alertData);
    console.log(`🚨 Logged drawdown alert for ${symbol}: ${drawdown}%`);
  } catch (error) {
    console.error('Error logging drawdown alert:', error.message);
  }
}
async function fetchCryptoPrice(symbol) {
  try {
    const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}-USD`, {
      params: {
        interval: '1d',
        range: '5d', // Get 5 days for better context
      },
    });

    const data = response.data.chart.result[0];
    const currentPrice = data.meta.regularMarketPrice;
    const previousClose = data.meta.chartPreviousClose;
    const change = currentPrice - previousClose;
    const changePercent = (change / previousClose) * 100;

    return {
      symbol,
      price: currentPrice,
      change,
      changePercent,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`Error fetching crypto price for ${symbol}:`, error.message);
    return null;
  }
}

// Get price for any asset
async function getAssetPrice(asset) {
  if (asset.type === 'ETF') {
    return await fetchETFPrice(asset.symbol);
  } else {
    // Use Yahoo Finance directly for crypto
    return await fetchCryptoPrice(asset.symbol);
  }
}

// Send push notification to all device tokens
async function sendPushNotification(title, body, data = {}) {
  try {
    // Get device tokens from Firebase
    const deviceTokens = await getDeviceTokensFromFirebase();
    
    if (deviceTokens.length === 0) {
      console.log('⚠️ No device tokens found - notifications not sent');
      return;
    }
    
    // Send to all device tokens
    const message = {
      to: deviceTokens, // Array of device tokens
      sound: 'default',
      title: title,
      body: body,
      data: data,
    };
    
    const response = await axios.post('https://exp.host/--/api/v2/push/send', message, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
    });
    
    console.log('✅ Push notification sent to', deviceTokens.length, 'devices');
    console.log('Response:', response.data);
    
  } catch (error) {
    console.error('❌ Error sending push notification:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

// Get device tokens from Firebase
async function getDeviceTokensFromFirebase() {
  try {
    const tokensSnapshot = await db.collection('device_tokens')
      .where('active', '==', true)
      .get();
    
    const tokens = [];
    tokensSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.token) {
        tokens.push(data.token);
      }
    });
    
    console.log(`📱 Found ${tokens.length} active device tokens`);
    return tokens;
  } catch (error) {
    console.error('Error getting device tokens:', error.message);
    return [];
  }
}

// Calculate real drawdown from historical peak
async function calculateRealDrawdown(symbol, currentPrice) {
  try {
    // Get historical prices from Firebase (last 30 days)
    const snapshot = await db.collection('asset_prices')
      .where('symbol', '==', symbol)
      .orderBy('timestamp', 'desc')
      .limit(30)
      .get();
    
    if (snapshot.empty) {
      // No historical data, use daily change
      return 0;
    }
    
    // Find the peak price in the last 30 days
    let peakPrice = currentPrice;
    snapshot.forEach(doc => {
      const price = doc.data().price;
      if (price > peakPrice) {
        peakPrice = price;
      }
    });
    
    // Calculate drawdown from peak
    const drawdown = ((currentPrice - peakPrice) / peakPrice) * 100;
    return drawdown;
  } catch (error) {
    console.error(`Error calculating drawdown for ${symbol}:`, error.message);
    return 0;
  }
}

// Check drawdown threshold and send notification
async function checkDrawdownAlerts(asset, currentPrice) {
  // Calculate real drawdown from historical peak
  const drawdown = await calculateRealDrawdown(asset.symbol, currentPrice);
  
  // Alert if drawdown exceeds threshold
  if (drawdown <= -15) { // 15% drawdown threshold
    await sendPushNotification(
      '🚨 Drawdown Alert',
      `${asset.name} has reached ${Math.abs(drawdown).toFixed(1)}% drawdown from peak!`,
      {
        type: 'drawdown',
        asset: asset.symbol,
        drawdown: drawdown.toString(),
        threshold: '15',
      }
    );
    
    // Store alert in Firebase
    await db.collection('alerts').add({
      type: 'drawdown',
      asset: asset.symbol,
      assetName: asset.name,
      drawdown,
      threshold: 15,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
}

// Send test notification
async function sendTestNotification() {
  console.log('Sending test notification...');
  await sendPushNotification(
    '🧪 Test Notification',
    'ETF Guardian is working! This is a test alert.',
    {
      type: 'test',
      timestamp: new Date().toISOString(),
    }
  );
}

// Main monitoring function with Firebase integration
async function monitorPrices() {
  console.log('🚀 Starting price monitoring with Firebase...');
  
  for (const asset of MONITOR_ASSETS) {
    console.log(`\n📊 Checking ${asset.name}...`);
    
    const priceData = await getAssetPrice(asset);
    if (!priceData) {
      console.log(`❌ Failed to fetch price for ${asset.symbol}`);
      continue;
    }
    
    console.log(`💰 Current Price: $${priceData.price} (${priceData.changePercent >= 0 ? '+' : ''}${priceData.changePercent.toFixed(2)}%)`);
    
    // Get current peak from Firebase
    const currentPeak = await getAssetPeak(asset.symbol);
    if (!currentPeak) {
      console.log(`⚠️ No peak found for ${asset.symbol}, skipping...`);
      continue;
    }
    
    console.log(`🏔️ Current Peak: $${currentPeak}`);
    
    // Check if we need to update the peak
    if (priceData.price > currentPeak) {
      console.log(`📈 New high! Updating peak from $${currentPeak} to $${priceData.price}`);
      await updateAssetPeak(asset.symbol, priceData.price);
    }
    
    // Calculate real drawdown based on Firebase peak
    const drawdown = await calculateDrawdown(asset.symbol, priceData.price);
    console.log(`📉 Real Drawdown: ${drawdown.toFixed(2)}%`);
    
    // Check for drawdown alerts (15% threshold)
    if (drawdown <= -15) {
      console.log(`🚨 DRAWDOWN ALERT! ${asset.name} at ${Math.abs(drawdown).toFixed(1)}%`);
      
      // Send push notification
      await sendPushNotification(
        '🚨 Drawdown Alert',
        `${asset.name} has reached ${Math.abs(drawdown).toFixed(1)}% drawdown from peak!`,
        {
          type: 'drawdown',
          asset: asset.symbol,
          drawdown: drawdown.toString(),
          threshold: '15',
        }
      );
      
      // Log alert to Firebase
      await logDrawdownAlert(
        asset.symbol,
        asset.name,
        drawdown,
        15,
        priceData.price,
        Math.max(priceData.price, currentPeak)
      );
    } else {
      console.log(`✅ No alert needed (threshold: -15%)`);
    }
  }
  
  console.log('\n🎉 Price monitoring completed!');
  console.log('📈 Peaks updated when prices rise');
  console.log('📉 Real drawdowns calculated from Firebase peaks');
  console.log('🚨 Push notifications sent for 15%+ drawdowns');
}

// Run the monitoring
monitorPrices().catch(console.error);
