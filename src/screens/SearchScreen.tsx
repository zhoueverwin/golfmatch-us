import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Alert,
  Dimensions,
} from "react-native";
import { FlashList, ListRenderItemInfo } from "@shopify/flash-list";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { RootStackParamList } from "../types";
import { Ionicons } from "@expo/vector-icons";

import { Colors } from "../constants/colors";
import { Spacing, BorderRadius } from "../constants/spacing";
import { Typography } from "../constants/typography";
import { User, SearchFilters } from "../types/dataModels";
import ProfileCard from "../components/ProfileCard";
import FilterModal from "../components/FilterModal";
import Loading from "../components/Loading";
import EmptyState from "../components/EmptyState";
import TodaySwipeView from "../components/TodaySwipeView";
import SortModal, { SortOption } from "../components/SortModal";
import { DataProvider } from "../services";
import { useAuth } from "../contexts/AuthContext";
import { userInteractionService } from "../services/userInteractionService";
import { UserActivityService } from "../services/userActivityService";
import AsyncStorage from "@react-native-async-storage/async-storage";

type SearchScreenNavigationProp = StackNavigationProp<RootStackParamList>;

type TabKey = "today" | "search";

const TABS: { key: TabKey; label: string }[] = [
  { key: "today", label: "Swipe" },
  { key: "search", label: "Search" },
];

const { width: screenWidth } = Dimensions.get("window");

// Fixed grid constants (for Search tab)
const HORIZONTAL_PADDING = Spacing.md * 2;
const INTER_ITEM_SPACING = 10;
const COLUMNS = 2;
const CARD_WIDTH =
  (screenWidth - HORIZONTAL_PADDING - INTER_ITEM_SPACING) / COLUMNS;
const CARD_HEIGHT = CARD_WIDTH * 1.3;
const ITEM_HEIGHT = CARD_HEIGHT + INTER_ITEM_SPACING;

const FILTER_STORAGE_KEY = "search_filters";
const TAB_BAR_BASE_HEIGHT = 65;

const SearchScreen: React.FC = () => {
  const navigation = useNavigation<SearchScreenNavigationProp>();
  const { profileId, userProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabKey>("today");
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({});
  const [hasActiveFilters, setHasActiveFilters] = useState(false);
  const [searchSort, setSearchSort] = useState<SortOption>("recommended");
  const viewerGender: User["gender"] | "unknown" = (userProfile?.gender as User["gender"]) || "unknown";

  // Tab bar height for floating elements
  const tabBarHeight = TAB_BAR_BASE_HEIGHT + Math.max(insets.bottom * 0.5, 4);

  // Search tab state
  const [searchProfiles, setSearchProfiles] = useState<User[]>([]);
  const [searchLoading, setSearchLoading] = useState(true);
  const [searchRefreshing, setSearchRefreshing] = useState(false);
  // Page tracking as refs — these are guards only, not UI-driving state.
  // Using refs avoids extra re-renders on every pagination event.
  const searchPageRef = useRef(1);
  const searchHasMoreRef = useRef(true);
  const searchIsFetchingRef = useRef(false);
  // Monotonic request id. Each loadSearchUsers call captures the current
  // value at start; if the latest id has advanced by response time we
  // drop the result. Prevents stale results from rapid filter changes.
  const searchRequestIdRef = useRef(0);

  // Load saved filters on mount
  useEffect(() => {
    loadSavedFilters();
  }, []);

  // Load Search data when that tab is active
  useEffect(() => {
    if (profileId && activeTab === "search") {
      searchPageRef.current = 1;
      searchHasMoreRef.current = true;
      userInteractionService.loadUserInteractions(profileId);
      loadSearchUsers(1);
    }
  }, [profileId, activeTab, filters, searchSort]);

  // Update hasActiveFilters when filters change
  useEffect(() => {
    const filterValues = Object.values(filters).filter((v) => {
      if (Array.isArray(v)) return v.length > 0;
      return v !== undefined && v !== null;
    });
    setHasActiveFilters(filterValues.length > 0);
  }, [filters]);

  const handleViewProfile = useCallback(
    (userId: string) => {
      navigation.navigate("Profile", { userId });
    },
    [navigation],
  );

  const loadSavedFilters = async () => {
    try {
      const savedFilters = await AsyncStorage.getItem(FILTER_STORAGE_KEY);
      if (savedFilters && savedFilters.trim() !== "") {
        try {
          const parsedFilters = JSON.parse(savedFilters);
          setFilters(parsedFilters);
        } catch (parseError) {
          console.error(
            "Error parsing saved filters (corrupted data):",
            parseError,
          );
          await AsyncStorage.removeItem(FILTER_STORAGE_KEY);
        }
      }
    } catch (error) {
      console.error("Error loading saved filters:", error);
    }
  };

  const saveFilters = async (newFilters: SearchFilters) => {
    try {
      await AsyncStorage.setItem(
        FILTER_STORAGE_KEY,
        JSON.stringify(newFilters),
      );
    } catch (error) {
      console.error("Error saving filters:", error);
    }
  };

  // Search data loading
  const loadSearchUsers = async (pageNumber = 1) => {
    const isFirstPage = pageNumber === 1;
    // Capture the request id at start. If a newer call has overtaken us by
    // the time the response lands, we drop everything from this call.
    const requestId = ++searchRequestIdRef.current;
    const isStale = () => searchRequestIdRef.current !== requestId;

    if (isFirstPage) {
      setSearchLoading(true);
    } else {
      searchIsFetchingRef.current = true;
    }

    try {
      if (!profileId) {
        if (isStale()) return;
        setSearchProfiles([]);
        setSearchLoading(false);
        searchIsFetchingRef.current = false;
        return;
      }

      const response = await DataProvider.searchUsers(
        filters,
        pageNumber,
        20,
        searchSort,
      );

      if (isStale()) return;

      if (response.error) {
        Alert.alert(
          "Error",
          `Failed to load users: ${response.error}`,
        );
      } else {
        let users = (response.data || []).filter((u) => u.id !== profileId);
        users = userInteractionService.applyInteractionState(users);

        searchHasMoreRef.current =
          response.pagination?.hasMore ?? (response.data?.length === 20);

        if (isFirstPage) {
          setSearchProfiles(users);
        } else {
          setSearchProfiles((prev) => {
            const existingIds = new Set(prev.map((u) => u.id));
            const newUsers = users.filter((u) => !existingIds.has(u.id));
            return [...prev, ...newUsers];
          });
        }

        // Fire-and-forget: track search impressions
        if (profileId && users.length > 0) {
          UserActivityService.trackSearchImpressions(profileId, users.map((u) => u.id), 'search');
        }
      }
    } catch (error) {
      console.error("Error loading users:", error);
      if (isStale()) return;
      Alert.alert("Error", "Something went wrong while loading users.");
      if (isFirstPage) setSearchProfiles([]);
    } finally {
      if (!isStale()) {
        if (isFirstPage) setSearchLoading(false);
        searchIsFetchingRef.current = false;
      }
    }
  };

  const handleSearchLoadMore = () => {
    if (!searchLoading && !searchIsFetchingRef.current && searchHasMoreRef.current) {
      const nextPage = searchPageRef.current + 1;
      searchPageRef.current = nextPage;
      loadSearchUsers(nextPage);
    }
  };

  const handleApplyFilters = async (newFilters: SearchFilters) => {
    setFilters(newFilters);
    await saveFilters(newFilters);
    setFilterModalVisible(false);
  };

  const handleResetFilters = useCallback(async () => {
    setFilters({});
    await saveFilters({});
  }, []);

  const renderProfileCard = useCallback(
    ({ item, index }: ListRenderItemInfo<User>) => {
      return (
        <ProfileCard
          profile={item}
          onViewProfile={handleViewProfile}
          testID={`SEARCH_SCREEN.CARD.${index}.${item.gender || "unknown"}`}
        />
      );
    },
    [handleViewProfile],
  );

  const keyExtractor = useCallback((item: User) => item.id, []);

  const handleRefresh = useCallback(async () => {
    setSearchRefreshing(true);
    try {
      searchPageRef.current = 1;
      searchHasMoreRef.current = true;
      await loadSearchUsers(1);
    } finally {
      setSearchRefreshing(false);
    }
  }, [searchSort, filters]);

  // Tell FlashList the exact size of every item so it never has to estimate/correct.
  // All grid items share identical dimensions, so this eliminates scroll-position jumps.
  const overrideItemLayout = useCallback(
    (layout: { size?: number; span?: number }) => {
      layout.size = ITEM_HEIGHT;
    },
    [],
  );

  const listEmptyComponent = React.useMemo(
    () => (
      <EmptyState
        icon="search-outline"
        title="No profiles found"
        subtitle="Try adjusting your filters and search again."
        buttonTitle="Reset Filters"
        onButtonPress={handleResetFilters}
      />
    ),
    [handleResetFilters],
  );

  return (
    <SafeAreaView
      style={styles.container}
      testID={`SEARCH_SCREEN.ROOT.${viewerGender || "unknown"}`}
    >
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />

      {/* Header with pill segmented control — matches the patterns used
          by HomeScreen (For You / Following) and ConnectionsScreen
          (Likes / Matches). Two tabs only, so no horizontal scroll needed. */}
      <View style={styles.header}>
        <View style={styles.tabPillContainer}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, isActive && styles.activeTab]}
                onPress={() => setActiveTab(tab.key)}
                accessibilityRole="tab"
                accessibilityLabel={`Show ${tab.label} profiles`}
                accessibilityState={{ selected: isActive }}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.tabText,
                    isActive && styles.activeTabText,
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Tab Content */}
      {activeTab === "today" && (
        <TodaySwipeView onViewProfile={handleViewProfile} />
      )}

      {activeTab === "search" && (
        <View style={styles.searchTabContainer}>
          {searchLoading && searchProfiles.length === 0 ? (
            <Loading text="Loading profiles..." fullScreen />
          ) : (
            <FlashList
              data={searchProfiles}
              renderItem={renderProfileCard}
              keyExtractor={keyExtractor}
              numColumns={2}
              overrideItemLayout={overrideItemLayout}
              contentContainerStyle={styles.profileGrid}
              showsVerticalScrollIndicator={false}
              testID={`SEARCH_SCREEN.RESULT_LIST.${viewerGender || "unknown"}`}
              drawDistance={ITEM_HEIGHT * 6}
              ListEmptyComponent={listEmptyComponent}
              refreshing={searchRefreshing}
              onRefresh={handleRefresh}
              onEndReached={handleSearchLoadMore}
              onEndReachedThreshold={0.5}
            />
          )}

          {/* Floating filter bar — Pairs style */}
          <View style={[styles.floatingBar, { bottom: tabBarHeight + Spacing.sm }]}>
            <TouchableOpacity
              style={styles.floatingBarButton}
              onPress={() => setFilterModalVisible(true)}
              activeOpacity={0.7}
            >
              <Ionicons
                name="options-outline"
                size={20}
                color={hasActiveFilters ? Colors.primary : Colors.gray[500]}
              />
              {hasActiveFilters && (
                <View style={styles.floatingFilterDot} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.floatingBarButton}
              onPress={() => setSortModalVisible(true)}
              activeOpacity={0.7}
            >
              <Ionicons
                name="swap-vertical-outline"
                size={20}
                color={searchSort !== "recommended" ? Colors.primary : Colors.gray[500]}
              />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Filter Modal — gendered hard paywall already gates entry, so all
          users reaching Search have full feature access. The premium /
          locked / yellow-highlight logic that used to live here was
          removed when filters/sorts stopped being premium-gated. */}
      <FilterModal
        visible={filterModalVisible}
        onClose={() => setFilterModalVisible(false)}
        onApply={handleApplyFilters}
        initialFilters={filters}
      />

      <SortModal
        visible={sortModalVisible}
        currentSort={searchSort}
        onSelect={setSearchSort}
        onClose={() => setSortModalVisible(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  // Pill segmented control — same shape used by HomeScreen.tsx:969 and
  // ConnectionsScreen.tsx:477. Gray track with primary-filled active pill.
  tabPillContainer: {
    flexDirection: "row",
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.full,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BorderRadius.full,
  },
  activeTab: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
    color: Colors.gray[500],
    textAlign: "center",
    includeFontPadding: false,
  },
  activeTabText: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
  },
  searchTabContainer: {
    flex: 1,
  },
  profileGrid: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing["2xl"],
  },
  // Floating filter bar (Pairs-style)
  floatingBar: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.xs,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    gap: Spacing.sm,
  },
  floatingBarButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.gray[50],
    alignItems: "center",
    justifyContent: "center",
  },
  floatingFilterDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
});

export default SearchScreen;
