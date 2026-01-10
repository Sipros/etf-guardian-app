import { db } from '../config/firebase';
import { collection, doc, setDoc, getDoc, getDocs, query, orderBy, limit, serverTimestamp, updateDoc } from 'firebase/firestore';

export interface PortfolioData {
  totalValue: number;
  totalInvested: number;
  totalBuffer: number;
  totalPriceChange: number;
  priceChangePercentage: number;
  averageDrawdown: number;
  timestamp: any;
  assets: PortfolioAsset[];
}

export interface AssetPrice {
  symbol: string;
  name: string;
  type: 'ETF' | 'CRYPTO';
  price: number;
  change: number;
  changePercent: number;
  timestamp: any;
  currency: string;
}

export interface PortfolioAsset {
  symbol: string;
  name: string;
  type: 'ETF' | 'CRYPTO';
  data_inizio: string;
  prezzo_inizio: number;
  massimo_attuale: number;
  data_massimo: string;
  threshold_alert: number;
  attivo: boolean;
  created_at: string;
  updated_at: string;
}

export interface DrawdownAlert {
  symbol: string;
  asset_name: string;
  drawdown: number;
  threshold: number;
  prezzo_corrente: number;
  massimo: number;
  timestamp: string;
  notifica_inviata: boolean;
}

export interface AlertData {
  type: 'drawdown' | 'recovery' | 'threshold';
  asset: string;
  assetName: string;
  value: number;
  threshold?: number;
  message: string;
  timestamp: any;
}

// Save portfolio snapshot to Firebase
export const savePortfolioSnapshot = async (portfolioData: PortfolioData): Promise<void> => {
  try {
    const portfolioRef = doc(collection(db, 'portfolio'));
    await setDoc(portfolioRef, {
      ...portfolioData,
      timestamp: serverTimestamp(),
    });
    console.log('Portfolio snapshot saved to Firebase');
  } catch (error) {
    console.error('Error saving portfolio snapshot:', error);
  }
};

// Save asset price to Firebase
export const saveAssetPrice = async (assetData: AssetPrice): Promise<void> => {
  try {
    const assetRef = doc(db, 'prices', assetData.symbol);
    await setDoc(assetRef, {
      ...assetData,
      timestamp: serverTimestamp(),
    });
    console.log(`Price saved for ${assetData.symbol}`);
  } catch (error) {
    console.error(`Error saving price for ${assetData.symbol}:`, error);
  }
};

// Save multiple asset prices
export const saveMultipleAssetPrices = async (assets: AssetPrice[]): Promise<void> => {
  const promises = assets.map(asset => saveAssetPrice(asset));
  await Promise.all(promises);
};

// Get latest portfolio snapshot
export const getLatestPortfolioSnapshot = async (): Promise<PortfolioData | null> => {
  try {
    const portfolioQuery = query(
      collection(db, 'portfolio'),
      orderBy('timestamp', 'desc'),
      limit(1)
    );
    const querySnapshot = await getDocs(portfolioQuery);
    
    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      return {
        totalValue: doc.data().totalValue,
        totalInvested: doc.data().totalInvested,
        totalBuffer: doc.data().totalBuffer,
        totalPriceChange: doc.data().totalPriceChange,
        priceChangePercentage: doc.data().priceChangePercentage,
        averageDrawdown: doc.data().averageDrawdown,
        timestamp: doc.data().timestamp,
      };
    }
    return null;
  } catch (error) {
    console.error('Error getting latest portfolio snapshot:', error);
    return null;
  }
};

// Get asset price history
export const getAssetPriceHistory = async (symbol: string, limit: number = 30): Promise<AssetPrice[]> => {
  try {
    const assetRef = doc(db, 'prices', symbol);
    const assetDoc = await getDoc(assetRef);
    
    if (assetDoc.exists()) {
      return [assetDoc.data() as AssetPrice];
    }
    return [];
  } catch (error) {
    console.error(`Error getting price history for ${symbol}:`, error);
    return [];
  }
};

// Save alert to Firebase
export const saveAlert = async (alertData: AlertData): Promise<void> => {
  try {
    const alertRef = doc(collection(db, 'alerts'));
    await setDoc(alertRef, {
      ...alertData,
      timestamp: serverTimestamp(),
    });
    console.log('Alert saved to Firebase');
  } catch (error) {
    console.error('Error saving alert:', error);
  }
};

// Get recent alerts
export const getRecentAlerts = async (limit: number = 10): Promise<AlertData[]> => {
  try {
    const alertsQuery = query(
      collection(db, 'alerts'),
      orderBy('timestamp', 'desc'),
      limit(limit)
    );
    const querySnapshot = await getDocs(alertsQuery);
    
    return querySnapshot.docs.map(doc => ({
      type: doc.data().type,
      asset: doc.data().asset,
      assetName: doc.data().assetName,
      value: doc.data().value,
      threshold: doc.data().threshold,
      message: doc.data().message,
      timestamp: doc.data().timestamp,
    })) as AlertData[];
  } catch (error) {
    console.error('Error getting recent alerts:', error);
    return [];
  }
};

// Save user preferences
export const saveUserPreferences = async (preferences: {
  drawdownThreshold: number;
  recoveryThreshold: number;
  notificationsEnabled: boolean;
}): Promise<void> => {
  try {
    const prefRef = doc(db, 'preferences', 'user');
    await setDoc(prefRef, {
      ...preferences,
      timestamp: serverTimestamp(),
    });
    console.log('User preferences saved');
  } catch (error) {
    console.error('Error saving user preferences:', error);
  }
};

// Initialize portfolio with current mock data as peaks
export const initializePortfolioWithCurrentData = async () => {
  const mockAssets = [
    {
      symbol: 'VOO',
      name: 'Vanguard S&P 500',
      type: 'ETF' as const,
      current_price: 638.31,
      monthly_investment: 500,
      allocation: 35
    },
    {
      symbol: 'BTC',
      name: 'Bitcoin', 
      type: 'CRYPTO' as const,
      current_price: 90524.70,
      monthly_investment: 300,
      allocation: 25
    },
    {
      symbol: 'ETH',
      name: 'Ethereum',
      type: 'CRYPTO' as const,
      current_price: 2280.75,
      monthly_investment: 250,
      allocation: 18
    },
    {
      symbol: 'BND',
      name: 'Vanguard Bond ETF',
      type: 'ETF' as const,
      current_price: 76.42,
      monthly_investment: 200,
      allocation: 12
    },
    {
      symbol: 'SOL',
      name: 'Solana',
      type: 'CRYPTO' as const,
      current_price: 187.30,
      monthly_investment: 150,
      allocation: 10
    }
  ];

  const now = new Date().toISOString();
  
  for (const asset of mockAssets) {
    const assetRef = doc(db, 'portfolio_assets', asset.symbol);
    
    // Check if asset already exists
    const assetDoc = await getDoc(assetRef);
    
    if (!assetDoc.exists()) {
      // Create new asset with current price as initial peak
      const portfolioAsset: PortfolioAsset = {
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
    } else {
      console.log(`ℹ️ ${asset.symbol} already exists in portfolio`);
    }
  }
};

// Get asset peak from Firebase
export const getAssetPeak = async (symbol: string): Promise<number | null> => {
  try {
    const assetRef = doc(db, 'portfolio_assets', symbol);
    const assetDoc = await getDoc(assetRef);
    
    if (assetDoc.exists()) {
      return assetDoc.data()?.massimo_attuale || null;
    }
    return null;
  } catch (error) {
    console.error(`Error getting peak for ${symbol}:`, error);
    return null;
  }
};

// Update asset peak in Firebase
export const updateAssetPeak = async (symbol: string, newPeak: number): Promise<boolean> => {
  try {
    const assetRef = doc(db, 'portfolio_assets', symbol);
    const now = new Date().toISOString();
    
    await updateDoc(assetRef, {
      massimo_attuale: newPeak,
      data_massimo: now,
      updated_at: now
    });
    
    console.log(`📈 Updated ${symbol} peak to: $${newPeak}`);
    return true;
  } catch (error) {
    console.error(`Error updating peak for ${symbol}:`, error);
    return false;
  }
};

// Calculate real drawdown based on Firebase peak
export const calculateDrawdown = async (symbol: string, currentPrice: number): Promise<number> => {
  try {
    const peak = await getAssetPeak(symbol);
    if (!peak) return 0;
    
    const drawdown = ((currentPrice - peak) / peak) * 100;
    return drawdown;
  } catch (error) {
    console.error(`Error calculating drawdown for ${symbol}:`, error);
    return 0;
  }
};

// Log drawdown alert
export const logDrawdownAlert = async (alert: Omit<DrawdownAlert, 'timestamp' | 'notifica_inviata'>) => {
  try {
    const alertId = `alert_${new Date().toISOString().replace(/[:.]/g, '').replace('T', '_')}_${alert.symbol.toLowerCase()}`;
    const alertRef = doc(db, 'drawdown_alerts', alertId);
    
    const alertData: DrawdownAlert = {
      ...alert,
      timestamp: new Date().toISOString(),
      notifica_inviata: true
    };
    
    await setDoc(alertRef, alertData);
    console.log(`🚨 Logged drawdown alert for ${alert.symbol}: ${alert.drawdown}%`);
  } catch (error) {
    console.error('Error logging drawdown alert:', error);
  }
};

// Get all portfolio assets
export const getPortfolioAssets = async (): Promise<PortfolioAsset[]> => {
  try {
    const assetsRef = collection(db, 'portfolio_assets');
    const querySnapshot = await getDocs(assetsRef);
    
    return querySnapshot.docs.map(doc => doc.data() as PortfolioAsset);
  } catch (error) {
    console.error('Error getting portfolio assets:', error);
    return [];
  }
};
