import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { Typography } from '../constants/typography';

interface StandardHeaderProps {
  title: string;
  showBackButton?: boolean;
  onBackPress?: () => void;
  rightComponent?: React.ReactNode;
  backgroundColor?: string;
  titleColor?: string;
  backButtonColor?: string;
}

const StandardHeader: React.FC<StandardHeaderProps> = ({
  title,
  showBackButton = false,
  onBackPress,
  rightComponent,
  backgroundColor = Colors.white,
  titleColor = Colors.text.primary,
  backButtonColor = Colors.text.primary,
}) => {
  return (
    <View style={[styles.header, { backgroundColor }]}>
      <View style={styles.leftSection}>
        {showBackButton ? (
          <TouchableOpacity
            onPress={onBackPress}
            style={styles.backButton}
            activeOpacity={0.7}
            accessible
            accessibilityRole="button"
            accessibilityLabel="戻る"
          >
            <View style={styles.backContent}>
              <Image
                source={require('../../assets/images/Icons/Arrow-LeftGrey.png')}
                style={[styles.backIconImage, { tintColor: backButtonColor }]}
                resizeMode="contain"
                fadeDuration={0}
              />
              <Text style={[styles.backLabel, { color: backButtonColor }]}>
                戻る
              </Text>
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.placeholder} />
        )}
      </View>

      <View style={styles.centerSection}>
        <Text style={[styles.headerTitle, { color: titleColor }]} numberOfLines={1}>
          {title}
        </Text>
      </View>

      <View style={styles.rightSection}>
        {rightComponent || <View style={styles.placeholder} />}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    minHeight: 56,
  },
  leftSection: {
    width: 100,
    alignItems: 'flex-start',
  },
  centerSection: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
  },
  rightSection: {
    width: 100,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  backButton: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  backContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backIconImage: {
    width: 18,
    height: 18,
  },
  backLabel: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    marginLeft: Spacing.xs,
  },
  headerTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    textAlign: 'center',
  },
  placeholder: {
    width: 24,
    height: 24,
  },
});

export default StandardHeader;
