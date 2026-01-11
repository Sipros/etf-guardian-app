import React, { useState, useEffect, useRef } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  RefreshControl,
  ActivityIndicator,
  AppState,
  AppStateStatus,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { fetchMultiplePrices } from './src/services/priceService';
import { initializeNotifications, sendDrawdownNotification } from './src/services/notificationService';
import * as Notifications from 'expo-notifications';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Color Theme
const COLORS = {
  purple: '#AEA7FE',
  cyan: '#7DD0FF',
  lightGray: '#BFBFBF',
  darkGray: '#212731',
  mediumGray: '#3F454F',
  white: '#FFFFFF',
  mint: '#A7FED9',
  black: '#000000',
  glassLight: 'rgba(255, 255, 255, 0.05)',
  glassMedium: 'rgba(255, 255, 255, 0.1)',
};

interface Asset {
  id: string;
  name: string;
  symbol: string;
  type: 'ETF' | 'CRYPTO';
  price: number;
  priceChange: number;
  drawdown: number;
  monthlyInvestment: number;
  buffer: number;
  bufferPercentage: number;
  allocationPercentage: number;
  chartData: number[];
  trend: 'up' | 'down' | 'neutral';
}

interface PortfolioSummary {
  totalValue: number;
  totalInvested: number;
  totalBuffer: number;
  totalPriceChange: number;
  priceChangePercentage: number;
  averageDrawdown: number;
}

interface Transaction {
  id: string;
  name: string;
  category: string;
  amount: number;
  icon: string;
  time: string;
}

const App: React.FC = () => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [portfolioSummary, setPortfolioSummary] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timeout | null>(null);
  const appState = useRef(AppState.currentState);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);

  const mockAssets: Asset[] = [
    {
      id: '1',
      name: 'Vanguard S&P 500',
      symbol: 'VOO',
      type: 'ETF',
      price: 428.35,
      priceChange: 5.23,
      drawdown: -8.5,
      monthlyInvestment: 500,
      buffer: 2500,
      bufferPercentage: 8.2,
      allocationPercentage: 35,
      chartData: [400, 405, 410, 408, 415, 420, 425, 428.35],
      trend: 'up',
    },
    {
      id: '2',
      name: 'Bitcoin',
      symbol: 'BTC',
      type: 'CRYPTO',
      price: 41250.50,
      priceChange: 12.75,
      drawdown: -15.3,
      monthlyInvestment: 300,
      buffer: 1850,
      bufferPercentage: 6.8,
      allocationPercentage: 25,
      chartData: [36500, 37200, 38100, 39500, 40000, 41000, 41200, 41250.50],
      trend: 'up',
    },
    {
      id: '3',
      name: 'Ethereum',
      symbol: 'ETH',
      type: 'CRYPTO',
      price: 2280.75,
      priceChange: -3.45,
      drawdown: -22.4,
      monthlyInvestment: 250,
      buffer: 1200,
      bufferPercentage: 4.5,
      allocationPercentage: 18,
      chartData: [2400, 2350, 2320, 2280, 2250, 2270, 2260, 2280.75],
      trend: 'down',
    },
    {
      id: '4',
      name: 'Vanguard Bond ETF',
      symbol: 'BND',
      type: 'ETF',
      price: 76.42,
      priceChange: 2.15,
      drawdown: -4.2,
      monthlyInvestment: 200,
      buffer: 950,
      bufferPercentage: 3.1,
      allocationPercentage: 12,
      chartData: [74, 74.5, 75, 75.8, 76, 76.2, 76.3, 76.42],
      trend: 'up',
    },
    {
      id: '5',
      name: 'Solana',
      symbol: 'SOL',
      type: 'CRYPTO',
      price: 187.30,
      priceChange: 8.90,
      drawdown: -18.6,
      monthlyInvestment: 150,
      buffer: 650,
      bufferPercentage: 2.4,
      allocationPercentage: 10,
      chartData: [160, 165, 170, 175, 180, 185, 186, 187.30],
      trend: 'up',
    },
  ];

  const mockTransactions: Transaction[] = [
    { id: '1', name: 'PlayStation Store', category: 'Gaming', amount: -51.0, icon: 'gamepad-variant', time: '2:34 PM' },
    { id: '2', name: 'Amazon', category: 'Shopping', amount: -192.0, icon: 'cart', time: 'Yesterday' },
    { id: '3', name: 'Facebook', category: 'Social Media', amount: -51.0, icon: 'facebook', time: 'Yesterday' },
    { id: '4', name: 'YouTube', category: 'Entertainment', amount: -51.0, icon: 'youtube', time: 'Yesterday' },
  ];

  useEffect(() => {
    initializeApp();
    
    // Start auto-refresh timer
    startAutoRefresh();
    
    // Handle app state changes
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      console.log('App state changed to:', nextAppState);
      
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        // App coming to foreground - restart auto-refresh
        console.log('📱 App became active - starting auto-refresh');
        startAutoRefresh();
      } else if (nextAppState.match(/inactive|background/)) {
        // App going to background - stop auto-refresh
        console.log('📱 App going to background - stopping auto-refresh');
        stopAutoRefresh();
      }
      
      appState.current = nextAppState;
    };
    
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    return () => {
      stopAutoRefresh();
      subscription?.remove();
    };
  }, []);

  // Start auto-refresh timer
  const startAutoRefresh = () => {
    stopAutoRefresh(); // Clear any existing timer
    
    console.log('🔄 Starting auto-refresh every 30 seconds');
    const interval = setInterval(() => {
      console.log('🔄 Auto-refreshing portfolio data...');
      loadPortfolioData();
    }, 30000); // 30 seconds
    
    setRefreshInterval(interval);
  };

  // Stop auto-refresh timer
  const stopAutoRefresh = () => {
    if (refreshInterval) {
      console.log('⏹️ Stopping auto-refresh');
      clearInterval(refreshInterval);
      setRefreshInterval(null);
    }
  };

  const initializeApp = async () => {
    // Initialize notifications and save device token to Firebase
    await initializeNotifications();
    loadPortfolioData();
  };

  const loadPortfolioData = async () => {
    setLoading(true);
    try {
      // Fetch real prices for assets
      const assetSymbols = mockAssets.map(asset => ({
        symbol: asset.symbol,
        type: asset.type
      }));
      
      const realPrices = await fetchMultiplePrices(assetSymbols);
      
      // Update mock assets with real prices
      const updatedAssets = mockAssets.map((asset, index) => {
        const priceData = realPrices[index];
        return {
          ...asset,
          price: priceData.price || asset.price,
          priceChange: priceData.change || asset.priceChange,
          drawdown: priceData.changePercent < 0 ? priceData.changePercent : asset.drawdown,
        };
      });
      
      setAssets(updatedAssets);
      calculatePortfolioSummary(updatedAssets);
      setLastRefresh(new Date()); // Track last refresh time
      
      // Check for drawdown alerts
      updatedAssets.forEach(asset => {
        if (asset.drawdown <= -15) {
          sendDrawdownNotification(asset.name, asset.drawdown, 15);
        }
      });
      
    } catch (error) {
      console.error('Error loading portfolio data:', error);
      // Fallback to mock data
      setAssets(mockAssets);
      calculatePortfolioSummary(mockAssets);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      // Fetch real prices for assets
      const assetSymbols = mockAssets.map(asset => ({
        symbol: asset.symbol,
        type: asset.type
      }));
      
      const realPrices = await fetchMultiplePrices(assetSymbols);
      
      // Update mock assets with real prices
      const updatedAssets = mockAssets.map((asset, index) => {
        const priceData = realPrices[index];
        return {
          ...asset,
          price: priceData.price || asset.price,
          priceChange: priceData.change || asset.priceChange,
          drawdown: priceData.changePercent < 0 ? priceData.changePercent : asset.drawdown,
        };
      });
      
      setAssets(updatedAssets);
      calculatePortfolioSummary(updatedAssets);
      setLastRefresh(new Date());
      
    } catch (error) {
      console.error('Error refreshing portfolio data:', error);
      // Fallback to mock data
      setAssets(mockAssets);
      calculatePortfolioSummary(mockAssets);
    } finally {
      setRefreshing(false);
    }
  };

  // Auto-refresh status indicator
  const getRefreshStatus = () => {
    if (!lastRefresh) return '🔄 Initializing...';
    
    const now = new Date();
    const secondsSinceRefresh = (now.getTime() - lastRefresh.getTime()) / 1000;
    
    if (secondsSinceRefresh < 5) return '✅ Just updated';
    if (secondsSinceRefresh < 30) return `🔄 Next update in ${(30 - secondsSinceRefresh).toFixed(0)}s`;
    return '🔄 Updating now...';
  };

  const calculatePortfolioSummary = (assetList: Asset[]) => {
    const totalInvested = assetList.reduce((sum, asset) => sum + asset.buffer + asset.monthlyInvestment * 12, 0);
    const totalValue = assetList.reduce((sum, asset) => sum + asset.price * 100, 0);
    const totalBuffer = assetList.reduce((sum, asset) => sum + asset.buffer, 0);
    const totalPriceChange = assetList.reduce((sum, asset) => sum + asset.priceChange, 0);
    const averageDrawdown = assetList.reduce((sum, asset) => sum + asset.drawdown, 0) / assetList.length;

    setPortfolioSummary({
      totalValue,
      totalInvested,
      totalBuffer,
      totalPriceChange,
      priceChangePercentage: ((totalPriceChange / assetList.length) * 100) / 100,
      averageDrawdown,
    });
  };

  const renderAssetCard = (asset: Asset) => {
    const isSelected = selectedAsset === asset.id;
    const isPositive = asset.priceChange >= 0;

    return (
      <TouchableOpacity
        key={asset.id}
        style={[styles.assetCard, isSelected && styles.assetCardSelected]}
        onPress={() => setSelectedAsset(isSelected ? null : asset.id)}
        activeOpacity={0.9}
      >
        <View style={styles.assetHeader}>
          <View style={styles.assetTitleContainer}>
            <Text style={styles.assetName}>{asset.name}</Text>
            <Text style={styles.assetSymbol}>{asset.symbol}</Text>
          </View>
          <View style={styles.assetAllocationBadge}>
            <Text style={styles.assetAllocationText}>{asset.allocationPercentage}%</Text>
          </View>
        </View>

        <View style={styles.assetPriceSection}>
          <View>
            <Text style={styles.priceLabel}>Current Price</Text>
            <Text style={styles.assetPrice}>${asset.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text>
          </View>
          <View style={[styles.priceChangeBadge, { backgroundColor: isPositive ? `${COLORS.mint}20` : `${COLORS.cyan}20` }]}>
            <Icon
              name={isPositive ? 'arrow-top-right' : 'arrow-bottom-left'}
              size={16}
              color={isPositive ? COLORS.mint : COLORS.cyan}
              style={{ marginRight: 4 }}
            />
            <Text style={[styles.priceChangeText, { color: isPositive ? COLORS.mint : COLORS.cyan }]}>
              {isPositive ? '+' : ''}{asset.priceChange.toFixed(2)}%
            </Text>
          </View>
        </View>

        <View style={styles.drawdownContainer}>
          <View style={styles.drawdownLabelSection}>
            <Text style={styles.drawdownLabel}>Max Drawdown</Text>
            <Text style={[styles.drawdownValue, { color: asset.drawdown < -15 ? COLORS.cyan : COLORS.lightGray }]}>
              {asset.drawdown.toFixed(1)}%
            </Text>
          </View>
          <View style={[styles.drawdownBar, { backgroundColor: COLORS.mediumGray + '40' }]}>
            <View
              style={[
                styles.drawdownFill,
                {
                  width: `${Math.abs(asset.drawdown)}%`,
                  backgroundColor: asset.drawdown < -15 ? COLORS.cyan : COLORS.purple,
                },
              ]}
            />
          </View>
        </View>

        <View style={styles.metricsContainer}>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Monthly</Text>
            <Text style={styles.metricValue}>${asset.monthlyInvestment}</Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Buffer</Text>
            <Text style={[styles.metricValue, { color: COLORS.mint }]}>${asset.buffer}</Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Peak</Text>
            <Text style={styles.metricValue}>${(asset.price * 1.1).toFixed(0)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.container}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.purple} />
            <Text style={styles.loadingText}>Loading Portfolio...</Text>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <ScrollView
          style={styles.scrollView}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.purple} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 20 }}
        >
          <View style={styles.headerContainer}>
            <View style={styles.headerTop}>
              <View>
                <Text style={styles.headerTitle}>Portfolio</Text>
                <Text style={styles.headerSubtitle}>ETF & Crypto Guardian</Text>
              </View>
              <View style={styles.refreshStatusContainer}>
                <Text style={styles.refreshStatusText}>{getRefreshStatus()}</Text>
                {refreshInterval && <View style={styles.refreshIndicator} />}
              </View>
            </View>
          </View>

          <View style={styles.assetsSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Holdings</Text>
              <Text style={styles.assetsCount}>{assets.length} Assets</Text>
            </View>

            <View style={styles.assetsList}>
              {assets.map((asset) => renderAssetCard(asset))}
            </View>
          </View>

          <View style={styles.transactionsSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Activity</Text>
              <TouchableOpacity>
                <Text style={styles.seeAllText}>See all</Text>
              </TouchableOpacity>
            </View>

            {mockTransactions.map((transaction) => (
              <View key={transaction.id} style={styles.transactionItem}>
                <View style={[styles.transactionIcon, { backgroundColor: COLORS.purple + '20' }]}>
                  <Icon name={transaction.icon} size={20} color={COLORS.purple} />
                </View>
                <View style={styles.transactionInfo}>
                  <Text style={styles.transactionName}>{transaction.name}</Text>
                  <Text style={styles.transactionCategory}>{transaction.category}</Text>
                </View>
                <View style={styles.transactionAmount}>
                  <Text style={styles.transactionAmountValue}>${Math.abs(transaction.amount).toFixed(2)}</Text>
                  <Text style={styles.transactionTime}>{transaction.time}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.black,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.lightGray,
    marginTop: 12,
    fontSize: 14,
  },
  headerContainer: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    backgroundColor: COLORS.black,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: COLORS.lightGray,
  },
  refreshStatusContainer: {
    alignItems: 'flex-end',
    flex: 1,
  },
  refreshStatusText: {
    fontSize: 11,
    color: COLORS.lightGray,
    textAlign: 'right',
  },
  refreshIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.mint,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  assetsSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.white,
  },
  assetsCount: {
    fontSize: 12,
    color: COLORS.lightGray,
    backgroundColor: COLORS.mediumGray,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  seeAllText: {
    fontSize: 12,
    color: COLORS.cyan,
    fontWeight: '600',
  },
  assetsList: {
    gap: 12,
  },
  assetCard: {
    backgroundColor: COLORS.glassMedium,
    borderWidth: 1,
    borderColor: COLORS.glassLight,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  assetCardSelected: {
    borderColor: COLORS.purple,
    borderWidth: 2,
  },
  assetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  assetTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  assetName: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: 2,
  },
  assetSymbol: {
    fontSize: 11,
    color: COLORS.lightGray,
  },
  assetAllocationBadge: {
    backgroundColor: COLORS.glassMedium,
    borderWidth: 1,
    borderColor: COLORS.glassLight,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  assetAllocationText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.cyan,
  },
  assetPriceSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  priceLabel: {
    fontSize: 10,
    color: COLORS.lightGray,
    marginBottom: 4,
  },
  assetPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.white,
  },
  priceChangeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  priceChangeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  drawdownContainer: {
    marginBottom: 12,
  },
  drawdownLabelSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  drawdownLabel: {
    fontSize: 10,
    color: COLORS.lightGray,
  },
  drawdownValue: {
    fontSize: 11,
    fontWeight: '600',
  },
  drawdownBar: {
    height: 5,
    borderRadius: 2.5,
    overflow: 'hidden',
  },
  drawdownFill: {
    height: '100%',
  },
  metricsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  metricBox: {
    flex: 1,
    backgroundColor: COLORS.glassMedium,
    borderWidth: 1,
    borderColor: COLORS.glassLight,
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 9,
    color: COLORS.lightGray,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.white,
  },
  transactionsSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.glassMedium,
    borderWidth: 1,
    borderColor: COLORS.glassLight,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionName: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: 2,
  },
  transactionCategory: {
    fontSize: 10,
    color: COLORS.lightGray,
  },
  transactionAmount: {
    alignItems: 'flex-end',
  },
  transactionAmountValue: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.white,
  },
  transactionTime: {
    fontSize: 9,
    color: COLORS.lightGray,
    marginTop: 2,
  },
});

export default App;