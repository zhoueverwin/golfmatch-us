// Load environment variables from .env so tests use real Supabase URL/key
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require('path');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const dotenv = require('dotenv');
  dotenv.config({ path: path.resolve(__dirname, '.env') });
} catch {}

import '@testing-library/jest-native/extend-expect';

// Mock native modules that can break tests (no-op if module not available)
try {
  jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');
} catch {}
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn().mockResolvedValue({ canceled: true }),
  launchCameraAsync: jest.fn().mockResolvedValue({ canceled: true }),
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted', granted: true }),
  requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted', granted: true }),
}));

// Mock vector icons and safe area for tests
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const Mock = (props: any) => React.createElement('Icon', props, props.children);
  return { Ionicons: Mock };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: View,
    SafeAreaProvider: ({ children }: any) => React.createElement(View, null, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

// Mock expo-av to avoid native module requirements
jest.mock('expo-av', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Video = (props: any) => React.createElement(View, props, props.children);
  return { Video, ResizeMode: { CONTAIN: 'contain', COVER: 'cover', STRETCH: 'stretch' } };
});

// Polyfill clearImmediate for StatusBar
// @ts-ignore
if (typeof global.clearImmediate === 'undefined') {
  // @ts-ignore
  global.clearImmediate = (handle: any) => clearTimeout(handle);
}
// @ts-ignore
if (typeof global.setImmediate === 'undefined') {
  // @ts-ignore
  global.setImmediate = (fn: any, ...args: any[]) => setTimeout(fn, 0, ...args);
}

// Use real AuthContext; tests will require env-authenticated user

// Provide Supabase envs for tests if not set
process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key';
process.env.EXPO_PUBLIC_TEST_USER_ID = process.env.EXPO_PUBLIC_TEST_USER_ID || '00000000-0000-0000-0000-000000000001';

// Mock react-native-url-polyfill auto import to no-op for Jest
jest.mock('react-native-url-polyfill/auto', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    setItem: async (k: string, v: string) => { store[k] = v; },
    getItem: async (k: string) => store[k] ?? null,
    removeItem: async (k: string) => { delete store[k]; },
    clear: async () => { store = {}; },
    getAllKeys: async () => Object.keys(store),
  };
});

// Mock React Native Google Sign-In
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn().mockResolvedValue(true),
    signIn: jest.fn().mockResolvedValue({
      type: 'success',
      data: {
        idToken: 'mock-id-token',
        user: {
          id: 'mock-user-id',
          name: 'Mock User',
          email: 'mock@example.com',
          photo: null,
          familyName: 'User',
          givenName: 'Mock',
        },
      },
    }),
    signInSilently: jest.fn().mockResolvedValue({
      type: 'success',
      data: {
        idToken: 'mock-id-token',
        user: {
          id: 'mock-user-id',
          name: 'Mock User',
          email: 'mock@example.com',
        },
      },
    }),
    signOut: jest.fn().mockResolvedValue(null),
    revokeAccess: jest.fn().mockResolvedValue(null),
    hasPreviousSignIn: jest.fn().mockReturnValue(false),
    getCurrentUser: jest.fn().mockReturnValue(null),
    clearCachedAccessToken: jest.fn().mockResolvedValue(null),
    getTokens: jest.fn().mockResolvedValue({
      idToken: 'mock-id-token',
      accessToken: 'mock-access-token',
    }),
  },
  GoogleSigninButton: jest.fn().mockImplementation(() => 'GoogleSigninButton'),
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    IN_PROGRESS: 'IN_PROGRESS',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  },
  isErrorWithCode: jest.fn().mockReturnValue(false),
  isSuccessResponse: jest.fn((response: any) => response?.type === 'success'),
  isNoSavedCredentialFoundResponse: jest.fn((response: any) => response?.type === 'noSavedCredentialFound'),
  isCancelledResponse: jest.fn((response: any) => response?.type === 'cancelled'),
}));


