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

// Portfolio assets to monitor (same as GitHub Actions)
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

// Fetch crypto price from Yahoo Finance
async function fetchCryptoPrice(symbol) {
  try {
    const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}-USD`, {
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
    console.error(`Error fetching crypto price for ${symbol}:`, error.message);
    return null;
  }
}

// Get price for any asset
async function getAssetPrice(asset) {
  if (asset.type === 'ETF') {
    return await fetchETFPrice(asset.symbol);
  } else {
    return await fetchCryptoPrice(asset.symbol);
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

// Calculate drawdown
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

// Log drawdown alert
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

// Send push notification
async function sendPushNotification(title, body, data = {}) {
  try {
    const deviceTokens = await getDeviceTokensFromFirebase();
    
    if (deviceTokens.length === 0) {
      console.log('⚠️ No device tokens found - notifications not sent');
      return;
    }
    
    const message = {
      to: deviceTokens,
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
    
  } catch (error) {
    console.error('❌ Error sending push notification:', error.message);
  }
}

// Simulate GitHub Actions monitoring (exactly like the real script)
async function simulateGitHubActions() {
  console.log('🚀 SIMULATING GITHUB ACTIONS MONITORING');
  console.log('==========================================');
  console.log('⏰ This is exactly what GitHub Actions does every 5 minutes');
  console.log('');
  
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
      console.log(`📈 NEW HIGH! Updating peak from $${currentPeak} to $${priceData.price}`);
      await updateAssetPeak(asset.symbol, priceData.price);
    } else {
      console.log(`📉 Price below peak, no update needed`);
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
  
  console.log('\n🎉 SIMULATION COMPLETED!');
  console.log('📈 This is exactly what GitHub Actions does every 5 minutes');
  console.log('⚡ Check GitHub Actions tab for real execution logs');
}

// Run simulation
simulateGitHubActions().then(() => {
  console.log('\n✅ GitHub Actions simulation completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Simulation failed:', error);
  process.exit(1);
});
