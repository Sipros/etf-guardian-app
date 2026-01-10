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

// Portfolio assets to check
const MONITOR_ASSETS = [
  { symbol: 'VOO', name: 'Vanguard S&P 500', type: 'ETF' },
  { symbol: 'BTC', name: 'Bitcoin', type: 'CRYPTO' },
  { symbol: 'ETH', name: 'Ethereum', type: 'CRYPTO' },
  { symbol: 'BND', name: 'Vanguard Bond ETF', type: 'ETF' },
  { symbol: 'SOL', name: 'Solana', type: 'CRYPTO' },
];

// Fetch current price from Yahoo Finance
async function fetchCurrentPrice(symbol, type) {
  try {
    const url = type === 'ETF' 
      ? `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`
      : `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}-USD`;
    
    const response = await axios.get(url, {
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
      currentPrice,
      change,
      changePercent,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`Error fetching price for ${symbol}:`, error.message);
    return null;
  }
}

// Main verification function
async function checkSystemStatus() {
  console.log('🔍 ETF GUARDIAN - SYSTEM STATUS CHECK');
  console.log('==========================================');
  
  try {
    // 1. Check device tokens
    console.log('\n📱 DEVICE TOKENS:');
    const tokensSnapshot = await db.collection('device_tokens').get();
    if (tokensSnapshot.empty) {
      console.log('❌ No device tokens found');
    } else {
      console.log(`✅ Found ${tokensSnapshot.size} device token(s)`);
      tokensSnapshot.forEach(doc => {
        const data = doc.data();
        console.log(`   📱 ${doc.id.substring(0, 20)}... (${data.platform})`);
      });
    }

    // 2. Check portfolio assets and peaks
    console.log('\n📊 PORTFOLIO ASSETS & PEAKS:');
    const assetsSnapshot = await db.collection('portfolio_assets').get();
    
    if (assetsSnapshot.empty) {
      console.log('❌ No portfolio assets found');
      return;
    }

    let totalAssets = 0;
    let updatedAssets = 0;
    
    for (const asset of MONITOR_ASSETS) {
      const assetDoc = assetsSnapshot.docs.find(doc => doc.id === asset.symbol);
      
      if (assetDoc) {
        const data = assetDoc.data();
        totalAssets++;
        
        console.log(`\n   📈 ${asset.symbol} - ${asset.name}`);
        console.log(`      💰 Current Peak: $${data.massimo_attuale}`);
        console.log(`      📅 Peak Updated: ${data.data_massimo}`);
        console.log(`      🎯 Start Price: $${data.prezzo_inizio}`);
        console.log(`      📅 Start Date: ${data.data_inizio}`);
        
        // Check if peak was updated recently (last 24 hours)
        const peakAge = Date.now() - new Date(data.data_massimo).getTime();
        const hoursSinceUpdate = peakAge / (1000 * 60 * 60);
        
        if (hoursSinceUpdate < 24) {
          console.log(`      ✅ Peak updated recently (${hoursSinceUpdate.toFixed(1)} hours ago)`);
          updatedAssets++;
        } else {
          console.log(`      ⚠️ Peak not updated recently (${hoursSinceUpdate.toFixed(1)} hours ago)`);
        }
      } else {
        console.log(`\n   ❌ ${asset.symbol} - Not found in portfolio`);
      }
    }

    console.log(`\n📈 SUMMARY: ${totalAssets}/${MONITOR_ASSETS.length} assets in portfolio`);
    console.log(`🔄 ${updatedAssets} assets updated in last 24 hours`);

    // 3. Check current prices and calculate drawdowns
    console.log('\n💰 CURRENT PRICES & DRAWDOWNS:');
    
    for (const asset of MONITOR_ASSETS) {
      const assetDoc = assetsSnapshot.docs.find(doc => doc.id === asset.symbol);
      
      if (assetDoc) {
        const portfolioData = assetDoc.data();
        const priceData = await fetchCurrentPrice(asset.symbol, asset.type);
        
        if (priceData) {
          const drawdown = ((priceData.currentPrice - portfolioData.massimo_attuale) / portfolioData.massimo_attuale) * 100;
          
          console.log(`\n   📊 ${asset.symbol}:`);
          console.log(`      💰 Current Price: $${priceData.currentPrice}`);
          console.log(`      📈 Peak Price: $${portfolioData.massimo_attuale}`);
          console.log(`      📉 Drawdown: ${drawdown.toFixed(2)}%`);
          console.log(`      📈 Daily Change: ${priceData.changePercent >= 0 ? '+' : ''}${priceData.changePercent.toFixed(2)}%`);
          
          if (drawdown <= -15) {
            console.log(`      🚨 ALERT: Drawdown exceeds 15%!`);
          } else if (drawdown <= -10) {
            console.log(`      ⚠️ WARNING: Drawdown approaching 15%`);
          } else {
            console.log(`      ✅ Drawdown within normal range`);
          }
        }
      }
    }

    // 4. Check recent alerts
    console.log('\n🚨 RECENT ALERTS (Last 24h):');
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const alertsSnapshot = await db.collection('drawdown_alerts')
      .where('timestamp', '>=', oneDayAgo.toISOString())
      .orderBy('timestamp', 'desc')
      .limit(5)
      .get();
    
    if (alertsSnapshot.empty) {
      console.log('✅ No alerts in last 24 hours');
    } else {
      console.log(`📨 Found ${alertsSnapshot.size} alert(s):`);
      alertsSnapshot.forEach(doc => {
        const data = doc.data();
        const alertTime = new Date(data.timestamp).toLocaleString();
        console.log(`   🚨 ${data.symbol}: ${data.drawdown.toFixed(1)}% at ${alertTime}`);
      });
    }

    // 5. Check GitHub Actions activity
    console.log('\n⚡ GITHUB ACTIONS ACTIVITY:');
    console.log('   📅 Schedule: Every 5 minutes');
    console.log('   🔄 Last run: Check GitHub Actions tab');
    console.log('   🔗 Repository: etf-guardian-clean');
    
    console.log('\n🎉 SYSTEM CHECK COMPLETED');
    console.log('==========================================');
    
  } catch (error) {
    console.error('❌ Error during system check:', error);
  }
}

// Run the check
checkSystemStatus().then(() => {
  console.log('\n✅ Status check completed successfully');
  process.exit(0);
}).catch(error => {
  console.error('❌ Status check failed:', error);
  process.exit(1);
});
