import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { getFirestore, collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// Firebase configuration using service account approach
const firebaseConfig = {
  apiKey: "AIzaSyBkZ7y8fL9vQhXyJlXmNqR5sT2wY7K8", // Use a valid API key
  authDomain: "etf-guardian.firebaseapp.com",
  projectId: "etf-guardian",
  storageBucket: "etf-guardian.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Set notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Initialize notifications and save device token to Firebase
export const initializeNotifications = async (): Promise<string | null> => {
  try {
    // Request permissions
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      console.log('Notification permissions denied');
      return null;
    }

    // Get project ID from app config
    const projectId = Constants?.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.error('Project ID not found in app config');
      return null;
    }

    // Get push token
    const token = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    
    console.log('📱 Device Push Token:', token.data);
    
    // Save device token to Firebase
    await saveDeviceToken(token.data);
    
    return token.data;
  } catch (error) {
    console.error('Error initializing notifications:', error);
    return null;
  }
};

// Save device token to Firebase
const saveDeviceToken = async (token: string): Promise<void> => {
  try {
    const tokenRef = doc(db, 'device_tokens', token);
    await setDoc(tokenRef, {
      token,
      platform: Constants.platform?.ios ? 'ios' : 'android',
      created_at: serverTimestamp(),
      last_active: serverTimestamp(),
      active: true
    });
    console.log('✅ Device token saved to Firebase');
  } catch (error) {
    console.error('Error saving device token:', error);
  }
};

// Get all active device tokens from Firebase
export const getDeviceTokens = async (): Promise<string[]> => {
  try {
    // This would be used by GitHub Actions
    // For now, we'll use a hardcoded approach
    console.log('📱 Device tokens would be fetched from Firebase');
    return [];
  } catch (error) {
    console.error('Error getting device tokens:', error);
    return [];
  }
};

// Request notification permissions
export const requestNotificationPermission = async (): Promise<boolean> => {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
};

// Get current permission status
export const getNotificationPermission = async (): Promise<boolean> => {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
};

// Send a test notification
export const sendTestNotification = async (): Promise<void> => {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'ETF Guardian',
      body: 'Test notification - Portfolio monitoring is active!',
      data: { type: 'test' },
    },
    trigger: null, // Show immediately
  });
};

// Send drawdown notification
export const sendDrawdownNotification = async (
  assetName: string,
  drawdown: number,
  threshold: number
): Promise<void> => {
  try {
    const isAboveThreshold = Math.abs(drawdown) >= threshold;
    
    if (isAboveThreshold) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🚨 Drawdown Alert',
          body: `${assetName} has reached ${Math.abs(drawdown).toFixed(1)}% drawdown!`,
          data: {
            type: 'drawdown',
            asset: assetName,
            drawdown: drawdown.toString(),
            threshold: threshold.toString(),
          },
        },
        trigger: null, // Show immediately
      });
    }
  } catch (error) {
    console.error('Error sending notification:', error);
  }
};

// Send portfolio recovery notification
export const sendRecoveryNotification = async (
  portfolioValue: number,
  previousValue: number
): Promise<void> => {
  const recoveryPercent = ((portfolioValue - previousValue) / previousValue) * 100;
  
  if (recoveryPercent > 5) { // 5% recovery threshold
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '📈 Portfolio Recovery',
        body: `Portfolio has recovered ${recoveryPercent.toFixed(1)}%! Value: $${portfolioValue.toLocaleString()}`,
        data: { 
          type: 'recovery',
          portfolioValue: portfolioValue.toString(),
          recoveryPercent: recoveryPercent.toString(),
        },
      },
      trigger: null, // Send immediately
    });
  }
};
