/**
 * RecruitmentFiltersModal Component
 *
 * Modal for filtering recruitment listings.
 * Features:
 * - Prefecture filter (grouped by region)
 * - Course type filter (IN/OUT/THROUGH)
 * - Date range filter
 * - Available slots only toggle
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Spacing, BorderRadius } from '../constants/spacing';
import { Typography } from '../constants/typography';
import {
  RecruitmentFilters,
  GenderPreference,
  SkillLevel,
  PREFECTURE_REGIONS,
  getGenderPreferenceLabel,
} from '../types/recruitment';

interface RecruitmentFiltersModalProps {
  visible: boolean;
  filters: RecruitmentFilters;
  onClose: () => void;
  onApply: (filters: RecruitmentFilters) => void;
}

const GENDER_OPTIONS: { value: GenderPreference; label: string }[] = [
  { value: 'any', label: '指定なし' },
  { value: 'male', label: '男性のみ' },
  { value: 'female', label: '女性のみ' },
];

const SKILL_OPTIONS: { value: SkillLevel; label: string }[] = [
  { value: 'ビギナー', label: 'ビギナー' },
  { value: '中級者', label: '中級者' },
  { value: '上級者', label: '上級者' },
  { value: 'プロ', label: 'プロ' },
];

// Generate month options (current month + next 3 months)
const generateMonthOptions = () => {
  const months: { value: string; label: string; dateFrom: string; dateTo: string }[] = [];
  const now = new Date();

  for (let i = 0; i < 4; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    // First day of month
    const dateFrom = `${year}-${String(month).padStart(2, '0')}-01`;

    // Last day of month
    const lastDay = new Date(year, month, 0).getDate();
    const dateTo = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    months.push({
      value: `${year}-${String(month).padStart(2, '0')}`,
      label: `${month}月`,
      dateFrom,
      dateTo,
    });
  }

  return months;
};

const MONTH_OPTIONS = generateMonthOptions();

const RecruitmentFiltersModal: React.FC<RecruitmentFiltersModalProps> = ({
  visible,
  filters,
  onClose,
  onApply,
}) => {
  const [tempFilters, setTempFilters] = useState<RecruitmentFilters>(filters);
  const [expandedRegion, setExpandedRegion] = useState<string | null>(null);

  // Reset temp filters when modal opens
  useEffect(() => {
    if (visible) {
      setTempFilters(filters);
    }
  }, [visible, filters]);

  const handleApply = () => {
    onApply(tempFilters);
    onClose();
  };

  const handleClear = () => {
    setTempFilters({});
  };

  const updateFilter = <K extends keyof RecruitmentFilters>(
    key: K,
    value: RecruitmentFilters[K]
  ) => {
    setTempFilters(prev => ({ ...prev, [key]: value }));
  };

  const toggleRegion = (region: string) => {
    setExpandedRegion(prev => (prev === region ? null : region));
  };

  // Handle month selection - sets play_date_from and play_date_to
  const handleMonthSelect = (monthOption: typeof MONTH_OPTIONS[0] | null) => {
    if (monthOption) {
      setTempFilters(prev => ({
        ...prev,
        play_date_from: monthOption.dateFrom,
        play_date_to: monthOption.dateTo,
      }));
    } else {
      setTempFilters(prev => ({
        ...prev,
        play_date_from: undefined,
        play_date_to: undefined,
      }));
    }
  };

  // Get currently selected month value
  const selectedMonth = tempFilters.play_date_from
    ? tempFilters.play_date_from.substring(0, 7) // Extract YYYY-MM
    : null;

  const hasActiveFilters =
    tempFilters.prefecture ||
    tempFilters.gender_preference ||
    tempFilters.min_skill_level ||
    tempFilters.play_date_from ||
    tempFilters.has_slots;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={Colors.gray[600]} />
          </TouchableOpacity>
          <Text style={styles.title}>絞り込み</Text>
          <TouchableOpacity onPress={handleClear}>
            <Text style={[
              styles.clearButton,
              !hasActiveFilters && styles.clearButtonDisabled,
            ]}>
              クリア
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Available slots toggle */}
          <View style={styles.section}>
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Ionicons name="people" size={20} color={Colors.primary} />
                <Text style={styles.toggleLabel}>空きがある募集のみ</Text>
              </View>
              <Switch
                value={tempFilters.has_slots || false}
                onValueChange={(value) => updateFilter('has_slots', value)}
                trackColor={{ false: Colors.gray[300], true: Colors.primaryLight }}
                thumbColor={tempFilters.has_slots ? Colors.primary : Colors.gray[100]}
              />
            </View>
          </View>

          {/* Month filter */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>プレー月</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.monthScrollContent}
            >
              {MONTH_OPTIONS.map((option) => {
                const isSelected = selectedMonth === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.monthChip,
                      isSelected && styles.monthChipSelected,
                    ]}
                    onPress={() =>
                      handleMonthSelect(isSelected ? null : option)
                    }
                  >
                    <Text style={[
                      styles.monthChipText,
                      isSelected && styles.monthChipTextSelected,
                    ]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Gender filter */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>性別</Text>
            <View style={styles.optionsContainer}>
              {GENDER_OPTIONS.map((option) => {
                const isSelected = tempFilters.gender_preference === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.optionButton,
                      isSelected && styles.optionButtonSelected,
                    ]}
                    onPress={() =>
                      updateFilter('gender_preference', isSelected ? undefined : option.value)
                    }
                  >
                    <Text style={[
                      styles.optionText,
                      isSelected && styles.optionTextSelected,
                    ]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Skill level filter */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>レベル</Text>
            <View style={styles.optionsContainer}>
              {SKILL_OPTIONS.map((option) => {
                const isSelected = tempFilters.min_skill_level === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.optionButton,
                      isSelected && styles.optionButtonSelected,
                    ]}
                    onPress={() =>
                      updateFilter('min_skill_level', isSelected ? undefined : option.value)
                    }
                  >
                    <Text style={[
                      styles.optionText,
                      isSelected && styles.optionTextSelected,
                    ]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Prefecture filter */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>地域</Text>
              {tempFilters.prefecture && (
                <TouchableOpacity
                  style={styles.clearFilterButton}
                  onPress={() => {
                    updateFilter('prefecture', undefined);
                    setExpandedRegion(null);
                  }}
                >
                  <Text style={styles.clearFilterText}>クリア</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Region chips */}
            <View style={styles.regionChipsContainer}>
              {PREFECTURE_REGIONS.map((regionData) => {
                const isExpanded = expandedRegion === regionData.region;
                const hasSelectedPrefecture = regionData.prefectures.includes(tempFilters.prefecture || '');
                return (
                  <TouchableOpacity
                    key={regionData.region}
                    style={[
                      styles.regionChip,
                      (isExpanded || hasSelectedPrefecture) && styles.regionChipActive,
                    ]}
                    onPress={() => toggleRegion(regionData.region)}
                  >
                    <Text style={[
                      styles.regionChipText,
                      (isExpanded || hasSelectedPrefecture) && styles.regionChipTextActive,
                    ]}>
                      {regionData.region}
                    </Text>
                    {hasSelectedPrefecture && !isExpanded && (
                      <View style={styles.selectedDot} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Expanded prefecture selection */}
            {expandedRegion && (
              <View style={styles.prefectureExpandedContainer}>
                <Text style={styles.prefectureExpandedTitle}>
                  {expandedRegion}の都道府県を選択
                </Text>
                <View style={styles.prefectureGrid}>
                  {PREFECTURE_REGIONS.find(r => r.region === expandedRegion)?.prefectures.map((pref) => {
                    const isSelected = tempFilters.prefecture === pref;
                    return (
                      <TouchableOpacity
                        key={pref}
                        style={[
                          styles.prefectureChip,
                          isSelected && styles.prefectureChipSelected,
                        ]}
                        onPress={() =>
                          updateFilter('prefecture', isSelected ? undefined : pref)
                        }
                      >
                        <Text style={[
                          styles.prefectureChipText,
                          isSelected && styles.prefectureChipTextSelected,
                        ]}>
                          {pref}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        </ScrollView>

        {/* Apply button */}
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.applyButton} onPress={handleApply}>
            <Text style={styles.applyButtonText}>適用する</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
  },
  clearButton: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.primary,
  },
  clearButtonDisabled: {
    color: Colors.gray[400],
  },
  content: {
    flex: 1,
  },
  section: {
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    marginBottom: Spacing.md,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  toggleLabel: {
    fontSize: Typography.fontSize.base,
    color: Colors.text.primary,
  },
  monthScrollContent: {
    paddingRight: Spacing.md,
    gap: Spacing.sm,
  },
  monthChip: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.full,
    marginRight: Spacing.xs,
  },
  monthChipSelected: {
    backgroundColor: Colors.primary,
  },
  monthChipText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.gray[600],
  },
  monthChipTextSelected: {
    color: Colors.white,
  },
  optionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  optionButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionButtonSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  optionText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.gray[600],
  },
  optionTextSelected: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.semibold,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  clearFilterButton: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  clearFilterText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
  },
  regionChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  regionChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  regionChipActive: {
    backgroundColor: Colors.primary,
  },
  regionChipText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.gray[600],
  },
  regionChipTextActive: {
    color: Colors.white,
  },
  selectedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.white,
  },
  prefectureExpandedContainer: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  prefectureExpandedTitle: {
    fontSize: Typography.fontSize.sm,
    color: Colors.gray[500],
    marginBottom: Spacing.sm,
  },
  prefectureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  prefectureChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.md,
  },
  prefectureChipSelected: {
    backgroundColor: Colors.primary,
  },
  prefectureChipText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.gray[600],
  },
  prefectureChipTextSelected: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.medium,
  },
  actionButtons: {
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  applyButton: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
  },
  applyButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.white,
  },
});

export default RecruitmentFiltersModal;
