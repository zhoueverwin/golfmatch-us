import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Constants from 'expo-constants';

// Recognised Supabase project IDs. URLs containing any of these are treated
// as a known production target and no banner is shown.
const PRODUCTION_PROJECT_IDS = [
  'rriwpoqhbgvprbhomckk', // GolfMatch JP production
  'tylrhszuzpebehzlahfq', // GolfMatch US production (legacy free-tier; pre-migration)
  'bvnwjrxdrbvctesfmedn', // GolfMatch US production (Pro; post-migration)
];

// JP dev branch identifier (long deleted); kept to label the banner clearly
// if the URL ever points here again.
const DEVELOPMENT_PROJECT_ID = 'vpbsievccbtyycsfsflh';

export function EnvironmentBanner(): React.ReactElement | null {
  const supabaseUrl = Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_URL ||
                      process.env.EXPO_PUBLIC_SUPABASE_URL;

  if (PRODUCTION_PROJECT_IDS.some((id) => supabaseUrl?.includes(id))) {
    return null;
  }

  if (supabaseUrl?.includes(DEVELOPMENT_PROJECT_ID)) {
    return (
      <View style={styles.banner}>
        <Text style={styles.text}>DEVELOPMENT MODE</Text>
      </View>
    );
  }

  return (
    <View style={[styles.banner, styles.unknownBanner]}>
      <Text style={styles.text}>UNKNOWN ENVIRONMENT</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#FF6B6B',
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unknownBanner: {
    backgroundColor: '#FFA500',
  },
  text: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
});
