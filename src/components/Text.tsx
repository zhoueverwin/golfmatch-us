import React from 'react';
import { Text as RNText, TextProps as RNTextProps, StyleSheet, TextStyle } from 'react-native';
import { Typography } from '../constants/typography';

/**
 * Custom Text component that applies Noto Sans JP font by default
 * Automatically maps font weights to the correct Noto Sans JP font variant
 * 
 * Usage:
 * <Text>Regular text</Text>
 * <Text fontWeight="bold">Bold text</Text>
 * <Text fontWeight="semibold">Semi-bold text</Text>
 */
interface TextProps extends RNTextProps {
  fontWeight?: 'normal' | 'medium' | 'semibold' | 'bold';
}

export const Text: React.FC<TextProps> = ({ style, fontWeight = 'normal', ...props }) => {
  const getFontFamily = (): string => {
    switch (fontWeight) {
      case 'normal':
        return Typography.fontFamily.regular;
      case 'medium':
        return Typography.fontFamily.medium;
      case 'semibold':
        return Typography.fontFamily.semibold;
      case 'bold':
        return Typography.fontFamily.bold;
      default:
        return Typography.fontFamily.regular;
    }
  };

  const textStyle: TextStyle = {
    fontFamily: getFontFamily(),
  };

  return (
    <RNText
      style={[
        styles.defaultText,
        textStyle,
        style,
      ]}
      {...props}
    />
  );
};

const styles = StyleSheet.create({
  defaultText: {
    fontFamily: Typography.fontFamily.regular,
  },
});

export default Text;


