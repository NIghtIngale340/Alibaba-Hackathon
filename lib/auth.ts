import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

// Platform-specific client IDs - YOU MUST CREATE iOS/Android OAuth clients in Google Cloud Console
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';
const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '';
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '';

// Use platform-specific client ID
const GOOGLE_CLIENT_ID = Platform.select({
  ios: GOOGLE_IOS_CLIENT_ID,
  android: GOOGLE_ANDROID_CLIENT_ID,
  default: GOOGLE_WEB_CLIENT_ID,
}) || GOOGLE_WEB_CLIENT_ID;

// Required scopes for Gmail, Calendar, and user profile
const GOOGLE_SCOPES = [
  'openid',
  'profile',
  'email',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/gmail.metadata',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

// Storage keys
const TOKEN_KEY = 'auth_token';
const USER_KEY = 'user_data';
const TOKEN_EXPIRY_KEY = 'token_expiry';

const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

/**
 * Hook for Google OAuth
 * REQUIRES: iOS and Android OAuth client IDs created in Google Cloud Console
 */
export const useGoogleAuth = () => {
  // For iOS: Use reverse client ID (required by Google)
  // Format: com.googleusercontent.apps.{CLIENT_ID_PREFIX}
  const iosReverseClientId = GOOGLE_IOS_CLIENT_ID.split('.').reverse().join('.');
  
  const redirectUri = Platform.select({
    ios: `${iosReverseClientId}:/oauth2redirect/google`,
    android: 'com.anonymous.qmobile://oauth2redirect/google',
    default: 'com.anonymous.qmobile://oauth2redirect/google',
  });

  // Log OAuth config only once (removed spam logs)
  // Platform: ${Platform.OS}, ClientID: ${GOOGLE_CLIENT_ID}, RedirectURI: ${redirectUri}

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: GOOGLE_CLIENT_ID,
      scopes: GOOGLE_SCOPES,
      redirectUri,
    },
    discovery
  );

  return { request, response, promptAsync };
};

/**
 * Store authentication tokens securely
 */
export const storeTokens = async (
  accessToken: string,
  expiresIn?: number
): Promise<void> => {
  await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
  
  if (expiresIn) {
    const expiryTime = Date.now() + expiresIn * 1000;
    await SecureStore.setItemAsync(TOKEN_EXPIRY_KEY, expiryTime.toString());
  }
};

/**
 * Get stored access token
 */
export const getAccessToken = async (): Promise<string | null> => {
  return await SecureStore.getItemAsync(TOKEN_KEY);
};

/**
 * Get stored refresh token
 */
export const getRefreshToken = async (): Promise<string | null> => {
  return null; // Not using refresh tokens with implicit flow
};

/**
 * Check if token is expired
 */
export const isTokenExpired = async (): Promise<boolean> => {
  const expiryTimeStr = await SecureStore.getItemAsync(TOKEN_EXPIRY_KEY);
  if (!expiryTimeStr) return true;
  
  const expiryTime = parseInt(expiryTimeStr, 10);
  return Date.now() >= expiryTime;
};

/**
 * Get valid access token (refresh if expired)
 */
export const getValidAccessToken = async (): Promise<string | null> => {
  const token = await getAccessToken();
  if (!token) return null;

  const expired = await isTokenExpired();
  if (!expired) return token;

  // Token expired - user needs to re-login
  return null;
};

/**
 * Store user data
 */
export const storeUserData = async (userData: any): Promise<void> => {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(userData));
};

/**
 * Get user data
 */
export const getUserData = async (): Promise<any | null> => {
  const data = await SecureStore.getItemAsync(USER_KEY);
  return data ? JSON.parse(data) : null;
};

/**
 * Fetch user info from Google (kept for compatibility)
 */
export const fetchUserInfo = async (accessToken: string): Promise<any> => {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch user info');
  }

  return await response.json();
};

/**
 * Clear all authentication data
 */
export const clearAuth = async (): Promise<void> => {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
  await SecureStore.deleteItemAsync(TOKEN_EXPIRY_KEY);
};

/**
 * Check if user is authenticated
 */
export const isAuthenticated = async (): Promise<boolean> => {
  const token = await getValidAccessToken();
  return token !== null;
};

/**
 * Revoke Google OAuth token
 */
export const revokeToken = async (token: string): Promise<void> => {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, {
    method: 'POST',
  });
};

/**
 * Logout user
 */
export const logout = async (): Promise<void> => {
  await clearAuth();
};
