import React, { useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Colors } from "../constants/colors";
import { Spacing, BorderRadius, Shadows } from "../constants/spacing";
import { Typography } from "../constants/typography";
import { SearchFilters } from "../types";
import AgeDecadeSelector from "./AgeDecadeSelector";
import PrefectureSelector from "./PrefectureSelector";
import SkillLevelSelector from "./SkillLevelSelector";
import ScoreSelector from "./ScoreSelector";
import LastLoginSelector from "./LastLoginSelector";
import DistanceSelector from "./DistanceSelector";
import {
  getPrefectureLabel,
  getSkillLevelLabel,
  getAgeDecadesLabel,
  getScoreLabel,
  getLastLoginLabel,
  getDistanceLabel,
} from "../constants/filterOptions";
import { logDistanceFilterChanged } from "../services/firebaseAnalytics";

interface FilterModalProps {
  visible: boolean;
  onClose: () => void;
  onApply: (filters: SearchFilters) => void;
  initialFilters?: SearchFilters;
}

/**
 * Filter rows toggle between two visual states based on whether the user has
 * picked a value. Outline icon + muted text = "Any" (default); filled icon +
 * primary text = active value. Lets the user scan the list and immediately
 * see what's been set without reading every right-aligned value.
 */
const ICON_PAIR: Record<string, { outline: keyof typeof Ionicons.glyphMap; filled: keyof typeof Ionicons.glyphMap }> = {
  age: { outline: "calendar-outline", filled: "calendar" },
  state: { outline: "location-outline", filled: "location" },
  distance: { outline: "navigate-outline", filled: "navigate" },
  skill: { outline: "golf-outline", filled: "golf" },
  score: { outline: "stats-chart-outline", filled: "stats-chart" },
  lastLogin: { outline: "time-outline", filled: "time" },
};

const FilterModal: React.FC<FilterModalProps> = ({
  visible,
  onClose,
  onApply,
  initialFilters = {},
}) => {
  // Strip any persisted `gender` field — the user-facing gender filter has
  // been removed (opposite-gender matching is enforced automatically in
  // supabaseDataProvider.searchUsers). Drop stale values from AsyncStorage
  // so they can't keep silently filtering results.
  const sanitize = (f: SearchFilters): SearchFilters => {
    const { gender: _gender, ...rest } = f;
    return rest;
  };
  const [filters, setFilters] = useState<SearchFilters>(sanitize(initialFilters));

  const [showAgeSelector, setShowAgeSelector] = useState(false);
  const [showPrefectureSelector, setShowPrefectureSelector] = useState(false);
  const [showDistanceSelector, setShowDistanceSelector] = useState(false);
  const [showSkillLevelSelector, setShowSkillLevelSelector] = useState(false);
  const [showScoreSelector, setShowScoreSelector] = useState(false);
  const [showLastLoginSelector, setShowLastLoginSelector] = useState(false);

  React.useEffect(() => {
    setFilters(sanitize(initialFilters));
  }, [initialFilters]);

  const handleClear = () => setFilters({});
  const handleApply = () => onApply(filters);

  const handleAgeDecadeChange = (decades: number[]) =>
    setFilters({ ...filters, age_decades: decades });
  const handlePrefectureChange = (prefecture: string | undefined) =>
    setFilters({ ...filters, prefecture });
  const handleDistanceChange = (miles: number | null) => {
    // Fire-and-forget telemetry — never await on the UI thread.
    logDistanceFilterChanged({
      fromMiles: filters.distance_miles ?? null,
      toMiles: miles,
    });
    setFilters({ ...filters, distance_miles: miles });
  };
  const handleSkillLevelChange = (skillLevel: string | undefined) =>
    setFilters({ ...filters, golf_skill_level: skillLevel });
  const handleScoreChange = (score: number | undefined) =>
    setFilters({ ...filters, average_score_max: score });
  const handleLastLoginChange = (days: number | null | undefined) =>
    setFilters({ ...filters, last_login_days: days });

  // Per-row active state — drives the icon/title/value color split. Each
  // computed locally so the rendering logic stays close to the data shape.
  const ageActive = !!filters.age_decades && filters.age_decades.length > 0;
  const stateActive = !!filters.prefecture;
  const distanceActive = filters.distance_miles != null;
  const skillActive = !!filters.golf_skill_level;
  const scoreActive = !!filters.average_score_max && filters.average_score_max !== 999;
  const lastLoginActive = filters.last_login_days != null;

  const activeFilterCount = [
    ageActive,
    stateActive,
    distanceActive,
    skillActive,
    scoreActive,
    lastLoginActive,
  ].filter(Boolean).length;

  const FilterRow = ({
    iconKey,
    title,
    value,
    isActive,
    onPress,
    isLast = false,
  }: {
    iconKey: keyof typeof ICON_PAIR;
    title: string;
    value: string;
    isActive: boolean;
    onPress: () => void;
    isLast?: boolean;
  }) => {
    const iconName = isActive ? ICON_PAIR[iconKey].filled : ICON_PAIR[iconKey].outline;
    return (
      <TouchableOpacity
        style={[styles.row, !isLast && styles.rowBorder]}
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${title}, current value ${value}`}
      >
        <View style={styles.rowLeft}>
          <View
            style={[
              styles.iconContainer,
              isActive && styles.iconContainerActive,
            ]}
          >
            <Ionicons
              name={iconName}
              size={18}
              color={isActive ? Colors.primary : Colors.gray[500]}
            />
          </View>
          <Text
            style={[
              styles.rowTitle,
              isActive && styles.rowTitleActive,
            ]}
          >
            {title}
          </Text>
        </View>
        <View style={styles.rowRight}>
          <Text
            style={[
              styles.rowValue,
              isActive ? styles.rowValueActive : styles.rowValueMuted,
            ]}
            numberOfLines={1}
          >
            {value}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.gray[300]} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Header: X close (left) + centered title + Clear (right, disabled when empty) */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.headerSideButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Close filters"
          >
            <Ionicons name="close" size={26} color={Colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.title}>Filters</Text>
          <TouchableOpacity
            onPress={handleClear}
            disabled={activeFilterCount === 0}
            style={styles.headerSideButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Clear all filters"
            accessibilityState={{ disabled: activeFilterCount === 0 }}
          >
            <Text
              style={[
                styles.clearButton,
                activeFilterCount === 0 && styles.clearButtonDisabled,
              ]}
            >
              Clear
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sectionLabel}>REFINE YOUR SEARCH</Text>
          <View style={styles.card}>
            <FilterRow
              iconKey="age"
              title="Age"
              value={getAgeDecadesLabel(filters.age_decades)}
              isActive={ageActive}
              onPress={() => setShowAgeSelector(true)}
            />
            <FilterRow
              iconKey="state"
              title="State"
              value={getPrefectureLabel(filters.prefecture)}
              isActive={stateActive}
              onPress={() => setShowPrefectureSelector(true)}
            />
            <FilterRow
              iconKey="distance"
              title="Distance"
              value={getDistanceLabel(filters.distance_miles)}
              isActive={distanceActive}
              onPress={() => setShowDistanceSelector(true)}
            />
            <FilterRow
              iconKey="skill"
              title="Skill Level"
              value={getSkillLevelLabel(filters.golf_skill_level)}
              isActive={skillActive}
              onPress={() => setShowSkillLevelSelector(true)}
            />
            <FilterRow
              iconKey="score"
              title="Average Score"
              value={getScoreLabel(filters.average_score_max)}
              isActive={scoreActive}
              onPress={() => setShowScoreSelector(true)}
            />
            <FilterRow
              iconKey="lastLogin"
              title="Last Login"
              value={getLastLoginLabel(filters.last_login_days)}
              isActive={lastLoginActive}
              onPress={() => setShowLastLoginSelector(true)}
              isLast
            />
          </View>

          {activeFilterCount > 0 ? (
            <Text style={styles.footerHelper}>
              Tap a row to change. Tap Clear to reset all filters.
            </Text>
          ) : (
            <Text style={styles.footerHelper}>
              Add filters to narrow your search. Leave them at &quot;Any&quot; to see everyone.
            </Text>
          )}
        </ScrollView>

        {/* Footer: single primary action */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.applyButton}
            onPress={handleApply}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={
              activeFilterCount > 0
                ? `Apply ${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"}`
                : "Apply filters"
            }
          >
            <Text style={styles.applyButtonText}>
              {activeFilterCount > 0
                ? `Apply ${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"}`
                : "Apply filters"}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Filter selector sub-modals */}
      <AgeDecadeSelector
        visible={showAgeSelector}
        selectedDecades={filters.age_decades || []}
        onClose={() => setShowAgeSelector(false)}
        onApply={handleAgeDecadeChange}
      />
      <PrefectureSelector
        visible={showPrefectureSelector}
        selectedPrefecture={filters.prefecture}
        onClose={() => setShowPrefectureSelector(false)}
        onApply={handlePrefectureChange}
      />
      <DistanceSelector
        visible={showDistanceSelector}
        selectedMiles={filters.distance_miles}
        onClose={() => setShowDistanceSelector(false)}
        onApply={handleDistanceChange}
      />
      <SkillLevelSelector
        visible={showSkillLevelSelector}
        selectedSkillLevel={filters.golf_skill_level}
        onClose={() => setShowSkillLevelSelector(false)}
        onApply={handleSkillLevelChange}
      />
      <ScoreSelector
        visible={showScoreSelector}
        selectedScore={filters.average_score_max}
        onClose={() => setShowScoreSelector(false)}
        onApply={handleScoreChange}
      />
      <LastLoginSelector
        visible={showLastLoginSelector}
        selectedDays={filters.last_login_days}
        onClose={() => setShowLastLoginSelector(false)}
        onApply={handleLastLoginChange}
      />
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerSideButton: {
    minWidth: 60,
  },
  title: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
    textAlign: "center",
    flex: 1,
  },
  clearButton: {
    fontSize: Typography.fontSize.base,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
    textAlign: "right",
  },
  clearButtonDisabled: {
    color: Colors.gray[300],
  },

  // Body
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  sectionLabel: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.secondary,
    letterSpacing: 0.6,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    ...Shadows.small,
  },
  footerHelper: {
    fontSize: Typography.fontSize.xs,
    color: Colors.text.secondary,
    fontFamily: Typography.fontFamily.regular,
    marginTop: Spacing.md,
    marginHorizontal: Spacing.xs,
    lineHeight: 18,
  },

  // Filter row
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    minHeight: 56,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.gray[200],
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.gray[100],
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.sm + 2,
  },
  iconContainerActive: {
    backgroundColor: Colors.primary + "15",
  },
  rowTitle: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.primary,
  },
  rowTitleActive: {
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    maxWidth: "55%",
  },
  rowValue: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    marginRight: 4,
  },
  rowValueActive: {
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
  },
  rowValueMuted: {
    color: Colors.gray[400],
  },

  // Footer
  footer: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  applyButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  applyButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.white,
  },
});

export default FilterModal;
