import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Alert,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";

import { Colors } from "../constants/colors";
import { Spacing } from "../constants/spacing";
import { getRegionPrefectures } from "../constants/filterOptions";
import { User, SearchFilters } from "../types/dataModels";
import { RootStackParamList } from "../types";
import CarouselSection from "./CarouselSection";
import { DataProvider } from "../services";
import { useAuth } from "../contexts/AuthContext";
import { useRevenueCat } from "../contexts/RevenueCatContext";
import { useCurrentUserProfile } from "../hooks/queries/useProfile";
import { userInteractionService } from "../services/userInteractionService";
import { UserActivityService } from "../services/userActivityService";
import { CacheService } from "../services/cacheService";
import { setSwipeCardData } from "../services/swipeCardData";
import EmptyState from "./EmptyState";
import Loading from "./Loading";

// For filtered mode, reuse the grid display
import { FlashList, ListRenderItemInfo } from "@shopify/flash-list";
import ProfileCard from "./ProfileCard";

const { width: screenWidth } = require("react-native").Dimensions.get("window");
const HORIZONTAL_PADDING = Spacing.md * 2;
const INTER_ITEM_SPACING = Spacing.xs;
const COLUMNS = 2;
const CARD_WIDTH =
  (screenWidth - HORIZONTAL_PADDING - INTER_ITEM_SPACING) / COLUMNS;
const CARD_HEIGHT = CARD_WIDTH * 1.3;
const ITEM_HEIGHT = CARD_HEIGHT + Spacing.xs;

type NavigationProp = StackNavigationProp<RootStackParamList>;

interface RecommendedCarouselViewProps {
  hasActiveFilters: boolean;
  filters: SearchFilters;
  onViewProfile: (userId: string) => void;
  onResetFilters: () => void;
}

const RecommendedCarouselView: React.FC<RecommendedCarouselViewProps> = ({
  hasActiveFilters,
  filters,
  onViewProfile,
  onResetFilters,
}) => {
  const navigation = useNavigation<NavigationProp>();
  const { profileId } = useAuth();
  const { profile: currentUser } = useCurrentUserProfile();
  const { isProMember } = useRevenueCat();

  const isMale = currentUser?.gender === "male";
  const isNewUsersLocked = isMale && !isProMember;

  // Carousel sections state
  const [recommendedUsers, setRecommendedUsers] = useState<User[]>([]);
  const [newUsers, setNewUsers] = useState<User[]>([]);
  const [nearbyUsers, setNearbyUsers] = useState<User[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filtered grid state
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [filteredLoading, setFilteredLoading] = useState(true);
  const filteredPageRef = useRef(1);
  const filteredHasMoreRef = useRef(true);
  const isFetchingRef = useRef(false);

  const loadCarouselSections = useCallback(async () => {
    if (!profileId) return;
    setSectionsLoading(true);
    try {
      // Load viewer prefecture, interaction state, and daily recs in parallel
      const [viewerResp, , dailyRecsResp] = await Promise.all([
        DataProvider.getUser(profileId),
        userInteractionService.loadUserInteractions(profileId),
        DataProvider.getDailyRecommendations(profileId),
      ]);
      const prefecture = viewerResp.success ? (viewerResp.data?.prefecture || null) : null;

      // Exclude: self, liked/passed users, and today's daily recommendation users
      const interactionState = userInteractionService.getState();
      const dailyRecIds = (dailyRecsResp.data || []).map((u) => u.id);
      const excludeIds = [
        profileId,
        ...Array.from(interactionState.likedUsers),
        ...Array.from(interactionState.passedUsers),
        ...dailyRecIds,
      ];

      const filterInteracted = (users: User[]) =>
        users.filter((u) => !excludeIds.includes(u.id));

      // Load all sections in parallel (nearby now has prefecture immediately)
      const [recsResp, newResp, nearbyResp] = await Promise.all([
        // Section 1: Intelligent recommendations
        DataProvider.getIntelligentRecommendations(profileId, 20).then(
          async (resp) => {
            if (resp.data && resp.data.length > 0) return resp;
            // Fallback chain
            const fallback = await DataProvider.getRecommendedUsers(
              profileId,
              20,
            );
            if (fallback.data && fallback.data.length > 0) return fallback;
            return DataProvider.searchUsers(
              {},
              1,
              20,
              "recommended",
              excludeIds,
            );
          },
        ),
        // Section 2: New registrations
        DataProvider.searchUsers({}, 1, 20, "registration"),
        // Section 3: Same-region users (e.g. 関東 for 東京都)
        prefecture
          ? DataProvider.searchUsers(
              { prefectures: getRegionPrefectures(prefecture) },
              1,
              20,
              "recommended",
            )
          : Promise.resolve({ data: [] as User[], error: null }),
      ]);

      // Deduplicate across sections: each section excludes users already claimed by earlier sections
      const recs = filterInteracted(recsResp.data || []);
      const recsIds = new Set(recs.map((u) => u.id));

      const newFiltered = filterInteracted(
        (newResp.data || []).filter(
          (u: User) => u.id !== profileId && u.gender !== currentUser?.gender && !recsIds.has(u.id),
        ),
      );
      const newIds = new Set(newFiltered.map((u) => u.id));

      const nearbyFiltered = filterInteracted(
        (nearbyResp.data || []).filter(
          (u: User) => u.id !== profileId && !recsIds.has(u.id) && !newIds.has(u.id),
        ),
      );

      setRecommendedUsers(recs);
      setNewUsers(newFiltered);
      setNearbyUsers(nearbyFiltered);

      // Fire-and-forget: track search impressions for each section
      if (profileId) {
        UserActivityService.trackSearchImpressions(profileId, recs.map((u) => u.id), 'recommended');
        UserActivityService.trackSearchImpressions(profileId, newFiltered.map((u) => u.id), 'new_users');
        UserActivityService.trackSearchImpressions(profileId, nearbyFiltered.map((u) => u.id), 'nearby');
      }
    } catch (error) {
      console.error("RecommendedCarouselView: Error loading sections:", error);
    } finally {
      setSectionsLoading(false);
    }
  }, [profileId]);

  const loadFilteredUsers = useCallback(
    async (pageNumber = 1) => {
      if (!profileId) return;
      const isFirstPage = pageNumber === 1;
      if (isFirstPage) {
        setFilteredLoading(true);
      } else {
        isFetchingRef.current = true;
      }

      try {
        await userInteractionService.loadUserInteractions(profileId);
        const interactionState = userInteractionService.getState();
        const excludeIds = [
          profileId,
          ...Array.from(interactionState.likedUsers),
          ...Array.from(interactionState.passedUsers),
        ];

        const response = await DataProvider.searchUsers(
          filters,
          pageNumber,
          20,
          "recommended",
        );

        if (response.error) {
          Alert.alert("エラー", "ユーザーの読み込みに失敗しました");
        } else {
          let users = (response.data || []).filter(
            (u) => !excludeIds.includes(u.id),
          );
          users = userInteractionService.applyInteractionState(users);

          filteredHasMoreRef.current =
            response.pagination?.hasMore ?? (response.data?.length === 20);

          if (isFirstPage) {
            setFilteredUsers(users);
          } else {
            setFilteredUsers((prev) => {
              const existingIds = new Set(prev.map((u) => u.id));
              const newItems = users.filter((u) => !existingIds.has(u.id));
              return [...prev, ...newItems];
            });
          }
        }
      } catch (error) {
        console.error("Error loading filtered users:", error);
        if (isFirstPage) setFilteredUsers([]);
      } finally {
        if (isFirstPage) setFilteredLoading(false);
        isFetchingRef.current = false;
      }
    },
    [profileId, filters],
  );

  // Load data based on filter state
  useEffect(() => {
    if (!profileId) return;
    if (hasActiveFilters) {
      filteredPageRef.current = 1;
      filteredHasMoreRef.current = true;
      loadFilteredUsers(1);
    } else {
      loadCarouselSections();
    }
  }, [profileId, hasActiveFilters, filters, loadCarouselSections, loadFilteredUsers]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (profileId) {
        await CacheService.remove(
          `intelligent_recommendations_v2:${profileId}:20`,
        );
      }
      if (hasActiveFilters) {
        filteredPageRef.current = 1;
        filteredHasMoreRef.current = true;
        await loadFilteredUsers(1);
      } else {
        await loadCarouselSections();
      }
    } finally {
      setRefreshing(false);
    }
  }, [
    profileId,
    hasActiveFilters,
    loadFilteredUsers,
    loadCarouselSections,
  ]);

  const handleCardPress = useCallback(
    (sectionUsers: User[], tappedIndex: number) => {
      setSwipeCardData(sectionUsers, tappedIndex);
      navigation.navigate("SwipeCard");
    },
    [navigation],
  );

  const handleNewUsersLockedPress = useCallback(() => {
    Alert.alert(
      "有料会員限定",
      "新しく登録したお相手のプロフィールを見るには有料会員への登録が必要です。\n\n有料会員になると、新規ユーザーへのアプローチやメッセージ送信など、すべての機能が使えます！\n\n素敵な出会いを逃さないために、今すぐアップグレードしましょう！",
      [
        { text: "閉じる", style: "cancel" },
        { text: "詳しく見る", onPress: () => navigation.navigate("Store") },
      ],
    );
  }, [navigation]);

  const handleLoadMore = useCallback(() => {
    if (!filteredLoading && !isFetchingRef.current && filteredHasMoreRef.current) {
      const nextPage = filteredPageRef.current + 1;
      filteredPageRef.current = nextPage;
      loadFilteredUsers(nextPage);
    }
  }, [filteredLoading, loadFilteredUsers]);

  const overrideItemLayout = useCallback(
    (layout: { span?: number; size?: number }) => {
      layout.size = ITEM_HEIGHT;
      layout.span = 1;
    },
    [],
  );

  const renderProfileCard = useCallback(
    ({ item, index }: ListRenderItemInfo<User>) => (
      <ProfileCard
        profile={item}
        onViewProfile={onViewProfile}
        testID={`SEARCH_SCREEN.CARD.${index}.${item.gender || "unknown"}`}
      />
    ),
    [onViewProfile],
  );

  // Filtered mode: show FlashList grid
  if (hasActiveFilters) {
    if (filteredLoading && filteredUsers.length === 0) {
      return <Loading text="プロフィールを読み込み中..." fullScreen />;
    }

    return (
      <FlashList
        data={filteredUsers}
        renderItem={renderProfileCard}
        keyExtractor={(item: User) => item.id}
        numColumns={2}
        overrideItemLayout={overrideItemLayout}
        contentContainerStyle={gridStyles.profileGrid}
        showsVerticalScrollIndicator={false}
        drawDistance={screenWidth * 2}
        ListEmptyComponent={
          <EmptyState
            icon="search-outline"
            title="プロフィールが見つかりません"
            subtitle="フィルターを調整して、もう一度お試しください"
            buttonTitle="フィルターをリセット"
            onButtonPress={onResetFilters}
          />
        }
        refreshing={refreshing}
        onRefresh={handleRefresh}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
      />
    );
  }

  // Carousel mode
  if (sectionsLoading && recommendedUsers.length === 0) {
    return <Loading text="おすすめを読み込み中..." fullScreen />;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={Colors.primary}
        />
      }
    >
      <CarouselSection
        title="あなたへのおすすめ"
        users={recommendedUsers}
        loading={sectionsLoading}
        onCardPress={(user, index) => handleCardPress(recommendedUsers, index)}
      />
      <CarouselSection
        title="新しく登録したお相手"
        users={newUsers}
        loading={sectionsLoading}
        onCardPress={(user, index) => handleCardPress(newUsers, index)}
        locked={isNewUsersLocked}
        onLockedPress={handleNewUsersLockedPress}
      />
      {nearbyUsers.length > 0 && (
        <CarouselSection
          title="あなたの近くの人"
          users={nearbyUsers}
          loading={sectionsLoading}
          onCardPress={(user, index) => handleCardPress(nearbyUsers, index)}
        />
      )}

      {/* Empty state if all sections are empty */}
      {!sectionsLoading &&
        recommendedUsers.length === 0 &&
        newUsers.length === 0 &&
        nearbyUsers.length === 0 && (
          <EmptyState
            icon="search-outline"
            title="おすすめのユーザーが見つかりません"
            subtitle="しばらくしてからもう一度お試しください"
          />
        )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing["2xl"],
  },
});

const gridStyles = StyleSheet.create({
  profileGrid: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing["2xl"],
  },
});

export default RecommendedCarouselView;
