import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';

interface GolfMatchLogoProps {
  width?: number;
  height?: number;
}

const GolfMatchLogo: React.FC<GolfMatchLogoProps> = ({ 
  width = 102, 
  height = 27.728 
}) => {
  // Calculate scale based on width
  const scale = width / 102;
  
  return (
    <View style={[styles.container, { width, height }]}>
      <Ionicons 
        name="golf" 
        size={20 * scale} 
        color={Colors.primary} 
        style={styles.icon}
      />
      <Text style={[styles.text, { fontSize: 18 * scale }]}>
        <Text style={styles.golf}>Golf</Text>
        <Text style={styles.match}>Match</Text>
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 2,
  },
  text: {
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  golf: {
    color: Colors.primary,
  },
  match: {
    color: '#000',
    fontStyle: 'italic',
  },
});

export default GolfMatchLogo;


