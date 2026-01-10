const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Local storage file path
const STORAGE_FILE = path.join(__dirname, 'portfolio_data.json');

// Initialize local storage
function initializeLocalStorage() {
  if (!fs.existsSync(STORAGE_FILE)) {
    const initialData = {
      portfolio_assets: {
        'VOO': {
          symbol: 'VOO',
          name: 'Vanguard S&P 500',
          type: 'ETF',
          data_inizio: new Date().toISOString(),
          prezzo_inizio: 638.31,
          massimo_attuale: 638.31, // Current price as initial peak
          data_massimo: new Date().toISOString(),
          threshold_alert: 15,
          attivo: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        'BTC': {
          symbol: 'BTC',
          name: 'Bitcoin',
          type: 'CRYPTO',
          data_inizio: new Date().toISOString(),
          prezzo_inizio: 90524.70,
          massimo_attuale: 90524.70, // Current price as initial peak
          data_massimo: new Date().toISOString(),
          threshold_alert: 15,
          attivo: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        'ETH': {
          symbol: 'ETH',
          name: 'Ethereum',
          type: 'CRYPTO',
          data_inizio: new Date().toISOString(),
          prezzo_inizio: 2280.75,
          massimo_attuale: 2280.75, // Current price as initial peak
          data_massimo: new Date().toISOString(),
          threshold_alert: 15,
          attivo: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        'BND': {
          symbol: 'BND',
          name: 'Vanguard Bond ETF',
          type: 'ETF',
          data_inizio: new Date().toISOString(),
          prezzo_inizio: 76.42,
          massimo_attuale: 76.42, // Current price as initial peak
          data_massimo: new Date().toISOString(),
          threshold_alert: 15,
          attivo: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        'SOL': {
          symbol: 'SOL',
          name: 'Solana',
          type: 'CRYPTO',
          data_inizio: new Date().toISOString(),
          prezzo_inizio: 187.30,
          massimo_attuale: 187.30, // Current price as initial peak
          data_massimo: new Date().toISOString(),
          threshold_alert: 15,
          attivo: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      },
      drawdown_alerts: []
    };
    
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(initialData, null, 2));
    console.log('✅ Local storage initialized with current data as peaks');
  }
}

// Load data from local storage
function loadData() {
  try {
    return JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
  } catch (error) {
    console.error('Error loading data:', error);
    return { portfolio_assets: {}, drawdown_alerts: [] };
  }
}

// Save data to local storage
function saveData(data) {
  try {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving data:', error);
  }
}

// Get asset peak from local storage
function getAssetPeak(symbol) {
  const data = loadData();
  return data.portfolio_assets[symbol]?.massimo_attuale || null;
}

// Update asset peak in local storage
function updateAssetPeak(symbol, newPeak) {
  const data = loadData();
  if (data.portfolio_assets[symbol]) {
    data.portfolio_assets[symbol].massimo_attuale = newPeak;
    data.portfolio_assets[symbol].data_massimo = new Date().toISOString();
    data.portfolio_assets[symbol].updated_at = new Date().toISOString();
    saveData(data);
    console.log(`📈 Updated ${symbol} peak to: $${newPeak}`);
    return true;
  }
  return false;
}

// Calculate drawdown
function calculateDrawdown(symbol, currentPrice) {
  const peak = getAssetPeak(symbol);
  if (!peak) return 0;
  
  const drawdown = ((currentPrice - peak) / peak) * 100;
  return drawdown;
}

// Log drawdown alert
function logDrawdownAlert(symbol, assetName, drawdown, threshold, currentPrice, peak) {
  const data = loadData();
  const alert = {
    symbol,
    asset_name: assetName,
    drawdown,
    threshold,
    prezzo_corrente: currentPrice,
    massimo: peak,
    timestamp: new Date().toISOString(),
    notifica_inviata: true
  };
  
  data.drawdown_alerts.push(alert);
  saveData(data);
  console.log(`🚨 Logged drawdown alert for ${symbol}: ${drawdown}%`);
}

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

// Send push notification (simulation)
async function sendPushNotification(title, body, data = {}) {
  console.log(`📱 PUSH NOTIFICATION: ${title}`);
  console.log(`   Body: ${body}`);
  console.log(`   Data:`, data);
  console.log(`   (In production, this would send via Expo)`);
}

// Portfolio assets to monitor
const MONITOR_ASSETS = [
  { symbol: 'VOO', name: 'Vanguard S&P 500', type: 'ETF' },
  { symbol: 'BTC', name: 'Bitcoin', type: 'CRYPTO' },
  { symbol: 'ETH', name: 'Ethereum', type: 'CRYPTO' },
  { symbol: 'BND', name: 'Vanguard Bond ETF', type: 'ETF' },
  { symbol: 'SOL', name: 'Solana', type: 'CRYPTO' },
];

// Main monitoring function with local storage
async function monitorPrices() {
  console.log('🚀 Starting price monitoring with LOCAL STORAGE...');
  
  for (const asset of MONITOR_ASSETS) {
    console.log(`\n📊 Checking ${asset.name}...`);
    
    const priceData = await getAssetPrice(asset);
    if (!priceData) {
      console.log(`❌ Failed to fetch price for ${asset.symbol}`);
      continue;
    }
    
    console.log(`💰 Current Price: $${priceData.price} (${priceData.changePercent >= 0 ? '+' : ''}${priceData.changePercent.toFixed(2)}%)`);
    
    // Get current peak from local storage
    const currentPeak = getAssetPeak(asset.symbol);
    if (!currentPeak) {
      console.log(`⚠️ No peak found for ${asset.symbol}, skipping...`);
      continue;
    }
    
    console.log(`🏔️ Current Peak: $${currentPeak}`);
    
    // Check if we need to update the peak
    if (priceData.price > currentPeak) {
      console.log(`📈 New high! Updating peak from $${currentPeak} to $${priceData.price}`);
      updateAssetPeak(asset.symbol, priceData.price);
    }
    
    // Calculate real drawdown based on peak
    const drawdown = calculateDrawdown(asset.symbol, priceData.price);
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
      
      // Log alert to local storage
      logDrawdownAlert(
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
  console.log('📉 Real drawdowns calculated from local peaks');
  console.log('🚨 Push notifications sent for 15%+ drawdowns');
  console.log('💾 Data saved locally to portfolio_data.json');
}

// Run the monitoring
async function main() {
  console.log('🔧 ETF Guardian - Local Storage Simulator');
  console.log('==========================================\n');
  
  // Initialize local storage
  initializeLocalStorage();
  
  // Run monitoring
  await monitorPrices();
}

main().catch(console.error);
