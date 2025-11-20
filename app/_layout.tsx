import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { isAuthenticated } from '@/lib/auth';
import { AppProvider } from '@/contexts/app-context';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const segments = useSegments();
  const [isReady, setIsReady] = useState(false);
  const [userAuthenticated, setUserAuthenticated] = useState(false);
  const [hasNavigated, setHasNavigated] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const authenticated = await isAuthenticated();
      setUserAuthenticated(authenticated);
    } catch (error) {
      console.error('Auth check error:', error);
    } finally {
      setIsReady(true);
    }
  };

  useEffect(() => {
    if (!isReady || hasNavigated) return;

    const inAuthGroup = segments[0] === 'auth';

    if (!userAuthenticated && !inAuthGroup) {
      // User is not authenticated and not on auth screen, redirect to auth
      setHasNavigated(true);
      router.replace('/auth');
    } else if (userAuthenticated && inAuthGroup) {
      // User is authenticated but still on auth screen, redirect to main app
      setHasNavigated(true);
      router.replace('/(tabs)');
    }
  }, [userAuthenticated, segments, isReady, hasNavigated]);

  if (!isReady) {
    return null; // Or a loading screen
  }

  return (
    <AppProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="auth" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </AppProvider>
  );
}
