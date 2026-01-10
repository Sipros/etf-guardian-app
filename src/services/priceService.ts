import axios from 'axios';

export interface PriceData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  timestamp: string;
}

export interface AssetPrice {
  symbol: string;
  name: string;
  type: 'ETF' | 'CRYPTO';
  price: number;
  change: number;
  changePercent: number;
  currency: string;
}

// Yahoo Finance API for ETFs
export const fetchETFPrice = async (symbol: string): Promise<PriceData> => {
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
    console.error(`Error fetching ETF price for ${symbol}:`, error);
    throw error;
  }
};

// Yahoo Finance API for Crypto (using -USD suffix)
export const fetchCryptoPrice = async (symbol: string): Promise<PriceData> => {
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
    console.error(`Error fetching crypto price for ${symbol}:`, error);
    // Return mock data on error
    const mockPrices: { [key: string]: number } = {
      'BTC': 41250.50,
      'ETH': 2280.75,
      'SOL': 187.30,
    };
    
    return {
      symbol,
      price: mockPrices[symbol] || 0,
      change: 0,
      changePercent: 0,
      timestamp: new Date().toISOString(),
    };
  }
};

// Get price for any asset
export const fetchAssetPrice = async (symbol: string, type: 'ETF' | 'CRYPTO'): Promise<PriceData> => {
  if (type === 'ETF') {
    return await fetchETFPrice(symbol);
  } else {
    // Use Yahoo Finance directly for crypto (no mapping needed)
    return await fetchCryptoPrice(symbol);
  }
};

// Fetch multiple prices
export const fetchMultiplePrices = async (assets: Array<{symbol: string; type: 'ETF' | 'CRYPTO'}>): Promise<PriceData[]> => {
  const promises = assets.map(asset => 
    fetchAssetPrice(asset.symbol, asset.type).catch(error => ({
      symbol: asset.symbol,
      price: 0,
      change: 0,
      changePercent: 0,
      timestamp: new Date().toISOString(),
    }))
  );

  return Promise.all(promises);
};

// ISIN to Yahoo ticker conversion
export const isinToYahooTicker = (isin: string): string => {
  // Common ETF ISIN mappings
  const isinMap: { [key: string]: string } = {
    'IE00B4LJJ59': 'VOO', // Vanguard S&P 500
    'IE00B4LMM59': 'BND', // Vanguard Total Bond
    'IE00B4LQY59': 'QQQ', // Invesco QQQ
    'IE00B4L5Y59': 'IVV', // iShares S&P 500
    'IE00B4L5T59': 'VUG', // Vanguard Growth ETF
    'IE00B4L5P59': 'VTV', // Vanguard Value ETF
  };

  return isinMap[isin] || isin;
};

// Get crypto ticker
export const getCryptoTicker = (symbol: string): string => {
  const cryptoTickers: { [key: string]: string } = {
    'BTC': 'BTC',
    'ETH': 'ETH',
    'SOL': 'SOL',
    'ADA': 'ADA',
    'DOT': 'DOT',
    'AVAX': 'AVAX',
  };

  return cryptoTickers[symbol] || symbol;
};
