/**
 * PlanDetailsBottomSheet
 *
 * A bottom sheet component that displays golf course plan details
 * with prices, amenities, and reservation buttons.
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Alert,
  Pressable,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '../constants/colors';
import { Spacing, BorderRadius, Shadows } from '../constants/spacing';
import { Typography } from '../constants/typography';
import { PlanDisplayInfo } from '../types';

interface PlanDetailsBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  plans: PlanDisplayInfo[];
  courseName: string;
  playDate: string;
}

const PlanDetailsBottomSheet: React.FC<PlanDetailsBottomSheetProps> = ({
  visible,
  onClose,
  plans,
  courseName,
  playDate,
}) => {
  const insets = useSafeAreaInsets();

  const handleReserve = useCallback(async (reserveUrl?: string) => {
    if (!reserveUrl) {
      Alert.alert('エラー', '予約ページを開けませんでした');
      return;
    }

    try {
      await WebBrowser.openBrowserAsync(reserveUrl, {
        dismissButtonStyle: 'close',
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      });
    } catch (error) {
      console.error('Failed to open reservation URL:', error);
      Alert.alert('エラー', '予約ページを開けませんでした');
    }
  }, []);

  const formatRound = (round: string): string => {
    if (round === '0.5R' || round === '0.5') return 'ハーフ';
    if (round === '1R' || round === '1') return '18H';
    return round;
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const weekday = weekdays[date.getDay()];
    return `${month}/${day}(${weekday})`;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.overlayTouchable} onPress={onClose} />
        <View
          style={[styles.container, { paddingBottom: insets.bottom + Spacing.md }]}
        >
          {/* Handle bar */}
          <View style={styles.handleBar} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleContainer}>
              <Ionicons name="golf" size={20} color={Colors.primary} />
              <Text style={styles.headerTitle}>プラン一覧</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={Colors.gray[500]} />
            </TouchableOpacity>
          </View>

          {/* Course info */}
          <View style={styles.courseInfo}>
            <Text style={styles.courseName} numberOfLines={1}>{courseName}</Text>
            <View style={styles.dateRow}>
              <Ionicons name="calendar-outline" size={14} color={Colors.gray[500]} />
              <Text style={styles.dateText}>{formatDate(playDate)}</Text>
            </View>
          </View>

          {/* Plan list */}
          <ScrollView
            style={styles.planList}
            contentContainerStyle={styles.planListContent}
            showsVerticalScrollIndicator={true}
            bounces={true}
          >
            {plans.map((plan, index) => (
              <View key={plan.planId} style={styles.planCard}>
                {/* Plan name */}
                <Text style={styles.planName} numberOfLines={2}>
                  {plan.planName}
                </Text>

                {/* Amenities row */}
                <View style={styles.amenitiesRow}>
                  <View style={styles.amenityBadge}>
                    <Ionicons name="flag" size={12} color={Colors.gray[600]} />
                    <Text style={styles.amenityText}>{formatRound(plan.round)}</Text>
                  </View>
                  {plan.hasLunch && (
                    <View style={[styles.amenityBadge, styles.lunchBadge]}>
                      <Ionicons name="restaurant" size={12} color={Colors.white} />
                      <Text style={[styles.amenityText, styles.lunchText]}>昼食付</Text>
                    </View>
                  )}
                  {plan.hasCart && (
                    <View style={styles.amenityBadge}>
                      <Ionicons name="car" size={12} color={Colors.gray[600]} />
                      <Text style={styles.amenityText}>カート</Text>
                    </View>
                  )}
                  {plan.hasCaddie && (
                    <View style={styles.amenityBadge}>
                      <Ionicons name="person" size={12} color={Colors.gray[600]} />
                      <Text style={styles.amenityText}>キャディ</Text>
                    </View>
                  )}
                </View>

                {/* Price and reserve button row */}
                <View style={styles.priceRow}>
                  <Text style={styles.price}>¥{plan.price.toLocaleString()}</Text>
                  <TouchableOpacity
                    style={styles.reserveButton}
                    onPress={() => handleReserve(plan.reserveUrl)}
                  >
                    <Text style={styles.reserveButtonText}>予約</Text>
                    <Ionicons name="open-outline" size={14} color={Colors.white} />
                  </TouchableOpacity>
                </View>

                {index === 0 && (
                  <View style={styles.lowestPriceBadge}>
                    <Text style={styles.lowestPriceText}>最安</Text>
                  </View>
                )}
              </View>
            ))}

          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  overlayTouchable: {
    flex: 1,
  },
  container: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '85%',
    minHeight: '50%',
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: Colors.gray[300],
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  headerTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  courseInfo: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.gray[50],
  },
  courseName: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text.primary,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  dateText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.gray[500],
  },
  planList: {
    flex: 1,
  },
  planListContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  planCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    position: 'relative',
  },
  planName: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
    color: Colors.text.primary,
    marginBottom: Spacing.xs,
    paddingRight: 40, // Space for lowest price badge
  },
  amenitiesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  amenityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray[100],
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    gap: 2,
  },
  lunchBadge: {
    backgroundColor: Colors.primary,
  },
  amenityText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.gray[600],
  },
  lunchText: {
    color: Colors.white,
  },
  lunchIcon: {
    color: Colors.white,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  price: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.primary,
  },
  reserveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E60012', // Rakuten red
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: 4,
  },
  reserveButtonText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.white,
  },
  lowestPriceBadge: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: Colors.warning,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  lowestPriceText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.white,
  },
});

export default PlanDetailsBottomSheet;
