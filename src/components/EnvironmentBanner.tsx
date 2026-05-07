import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Constants from 'expo-constants';

const PRODUCTION_PROJECT_ID = 'rriwpoqhbgvprbhomckk';
const DEVELOPMENT_PROJECT_ID = 'vpbsievccbtyycsfsflh';

export function EnvironmentBanner(): React.ReactElement | null {
  const supabaseUrl = Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_URL ||
                      process.env.EXPO_PUBLIC_SUPABASE_URL;

  if (supabaseUrl?.includes(PRODUCTION_PROJECT_ID)) {
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
