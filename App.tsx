import React, { useEffect, useState, useCallback } from 'react';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import {
  NotoSansJP_400Regular,
  NotoSansJP_500Medium,
  NotoSansJP_600SemiBold,
  NotoSansJP_700Bold,
} from '@expo-google-fonts/noto-sans-jp';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AppNavigator from './src/navigation/AppNavigator';
import ErrorBoundary from './src/components/ErrorBoundary';
import { EnvironmentBanner } from './src/components/EnvironmentBanner';
import { initializeFacebookSDK } from './src/services/facebookAnalytics';
import { initializeFirebaseAnalytics } from './src/services/firebaseAnalytics';

// Configure React Query client with optimal settings
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes - data is fresh for this duration
      gcTime: 30 * 60 * 1000, // 30 minutes - cache time (formerly cacheTime)
      retry: 2, // Retry failed requests twice
      refetchOnWindowFocus: false, // Don't refetch on window focus (mobile app)
      refetchOnReconnect: true, // Refetch when reconnecting to network
      refetchOnMount: true, // Refetch stale data when component mounts
    },
    mutations: {
      retry: 1, // Retry failed mutations once
    },
  },
});

// Global error handler for unhandled promise rejections and errors
// React Native uses ErrorUtils for global error handling
if (typeof (global as any).ErrorUtils !== 'undefined') {
  const ErrorUtils = (global as any).ErrorUtils;
  const originalHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
    // Log error for debugging
    console.error('[Global Error Handler]', error, { isFatal });
    
    // Only show user-facing error if it's a fatal error
    // Non-fatal errors are handled by ErrorBoundary
    if (originalHandler) {
      originalHandler(error, isFatal);
    }
  });
}

// Handle unhandled promise rejections (React Native Web/Expo)
if (typeof global !== 'undefined') {
  const originalUnhandledRejection = (global as any).onunhandledrejection;
  (global as any).onunhandledrejection = (event: any) => {
    console.error('[Unhandled Promise Rejection]', event?.reason || event);
    // Call original handler if it exists
    if (originalUnhandledRejection) {
      originalUnhandledRejection(event);
    }
    // Prevent default error display - let ErrorBoundary handle it
    if (event?.preventDefault) {
      event.preventDefault();
    }
  };
}

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync().catch((error) => {
  console.warn('SplashScreen.preventAutoHideAsync error:', error);
});

export default function App() {
  const [appIsReady, setAppIsReady] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    NotoSansJP_400Regular,
    NotoSansJP_500Medium,
    NotoSansJP_600SemiBold,
    NotoSansJP_700Bold,
  });

  useEffect(() => {
    async function prepare() {
      try {
        // Wait for fonts to load
        if (fontsLoaded || fontError) {
          if (fontError) {
            console.error('Font loading error:', fontError);
          }

          // Initialize Facebook SDK and request ATT permission
          // This should be called early to capture install attribution
          try {
            await initializeFacebookSDK();
          } catch (fbError) {
            // Don't block app launch if Facebook SDK fails
            console.warn('Facebook SDK initialization warning:', fbError);
          }

          // Initialize Firebase Analytics (no ATT required)
          try {
            await initializeFirebaseAnalytics();
          } catch (firebaseError) {
            console.warn('Firebase Analytics initialization warning:', firebaseError);
          }

          // Artificial delay to ensure app is ready (optional, helps with slower devices)
          await new Promise(resolve => setTimeout(resolve, 100));

          setAppIsReady(true);
        }
      } catch (e) {
        console.error('Error preparing app:', e);
        // Set app as ready anyway to prevent infinite splash screen
        setAppIsReady(true);
      }
    }

    prepare();
  }, [fontsLoaded, fontError]);

  const onLayoutRootView = useCallback(async () => {
    if (appIsReady) {
      // This tells the splash screen to hide immediately after the root view layout
      try {
        await SplashScreen.hideAsync();
      } catch (error) {
        console.warn('SplashScreen.hideAsync error:', error);
      }
    }
  }, [appIsReady]);

  // Add timeout fallback to prevent infinite splash screen (10 seconds max)
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!appIsReady) {
        console.warn('App taking too long to load, forcing splash screen to hide');
        setAppIsReady(true);
        SplashScreen.hideAsync().catch(console.warn);
      }
    }, 10000);

    return () => clearTimeout(timeout);
  }, [appIsReady]);

  if (!appIsReady) {
    return null; // Keep splash screen visible while loading
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <EnvironmentBanner />
        <ErrorBoundary>
          <AppNavigator onReady={onLayoutRootView} />
        </ErrorBoundary>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
