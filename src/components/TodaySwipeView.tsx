import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { Colors } from "../constants/colors";
import { Spacing, BorderRadius } from "../constants/spacing";
import { Typography } from "../constants/typography";
import { User } from "../types/dataModels";
import { SwipeCardWithRef, SwipeCardRef } from "./SwipeCard";
import { DataProvider } from "../services";
import { useAuth } from "../contexts/AuthContext";
import { userInteractionService } from "../services/userInteractionService";
import { useRequireVerification } from "../hooks/useRequireVerification";
import { UserActivityService } from "../services/userActivityService";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const TAB_BAR_BASE_HEIGHT = 65;

interface TodaySwipeViewProps {
  onViewProfile: (userId: string) => void;
}

const TodaySwipeView: React.FC<TodaySwipeViewProps> = ({ onViewProfile }) => {
  const { profileId, userProfile } = useAuth();
  const requireVerification = useRequireVerification();
  const insets = useSafeAreaInsets();
  const [users, setUsers] = useState<User[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [cardAreaHeight, setCardAreaHeight] = useState(SCREEN_HEIGHT * 0.70);
  const [nextPicksCountdown, setNextPicksCountdown] = useState<string>("");
  const swipeCardRef = useRef<SwipeCardRef>(null);

  const tabBarHeight = TAB_BAR_BASE_HEIGHT + Math.max(insets.bottom * 0.5, 4);
  const streakDays = userProfile?.current_streak_days ?? null;

  // Countdown to the next UTC midnight, when get_daily_recommendations rolls
  // its window and a fresh batch becomes available. Updates every second when
  // visible.
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const nextMidnight = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() + 1,
          0,
          0,
          0,
        ),
      );
      const msLeft = nextMidnight.getTime() - now.getTime();
      const h = Math.floor(msLeft / 3_600_000);
      const m = Math.floor((msLeft % 3_600_000) / 60_000);
      setNextPicksCountdown(`${h}h ${m}m`);
    };
    tick();
    const id = setInterval(tick, 30_000); // refresh twice a minute
    return () => clearInterval(id);
  }, []);

  const loadUsers = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    try {
      // Server returns only unswiped recommendations — always start at index 0
      const response = await DataProvider.getDailyRecommendations(profileId);
      const data = response.data || [];
      setUsers(data);
      setCurrentIndex(0);

      // Fire-and-forget: track search impressions for today's recommendations
      if (profileId && data.length > 0) {
        UserActivityService.trackSearchImpressions(profileId, data.map((u) => u.id), 'today');
      }
    } catch (error) {
      console.error("TodaySwipeView: Error loading users:", error);
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const advanceIndex = useCallback(() => {
    setCurrentIndex((prev) => prev + 1);
  }, []);

  const handleSwipeRight = useCallback(
    (user: User) => {
      if (!profileId) return;
      // Unverified females: spring the card back and DON'T record the like.
      // After they verify they can swipe the same card again.
      let allowed = false;
      requireVerification("swipe", () => {
        allowed = true;
      });
      if (allowed) {
        userInteractionService.likeUser(profileId, user.id);
        DataProvider.markRecommendationSwiped(profileId, user.id);
        advanceIndex();
      } else {
        swipeCardRef.current?.resetPosition();
      }
    },
    [profileId, advanceIndex, requireVerification],
  );

  const handleSwipeLeft = useCallback(
    (user: User) => {
      if (!profileId) return;
      userInteractionService.passUser(profileId, user.id);
      // Mark as swiped server-side (fire-and-forget — don't block animation)
      DataProvider.markRecommendationSwiped(profileId, user.id);
      advanceIndex();
    },
    [profileId, advanceIndex],
  );

  const handleTapProfile = useCallback(
    (user: User) => {
      onViewProfile(user.id);
    },
    [onViewProfile],
  );

  const isExhausted = currentIndex >= users.length && !loading;

  return (
    <GestureHandlerRootView style={styles.root}>
      {/* Unified container — Pairs-style card */}
      <View
        style={[
          styles.outerContainer,
          { marginBottom: tabBarHeight + Spacing.xs },
        ]}
      >
        {/* Header gradient — integrated with the card */}
        <LinearGradient
          colors={[Colors.primary, Colors.primaryDark]}
          style={styles.headerBar}
        >
          <Text style={styles.headerTitle}>Today's picks</Text>
          <View style={styles.likeCountBadge}>
            <Ionicons name="heart" size={14} color={Colors.primary} />
            <Text style={styles.likeCountText}>{Math.max(users.length - currentIndex, 0)} left</Text>
          </View>
        </LinearGradient>

        {/* Content area */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Loading recommendations...</Text>
          </View>
        ) : isExhausted ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconWrapper}>
              <View style={styles.emptyIconCard}>
                <Ionicons name="person" size={48} color={Colors.gray[300]} />
              </View>
              <View style={styles.emptyIconShadow} />
            </View>
            <Text
              style={styles.emptyTitle}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              All caught up for today
            </Text>
            <Text style={styles.emptySubtitle}>
              Come back tomorrow for a fresh batch.
            </Text>

            {/* Streak block — header + subtitle so the streak concept is
                self-explanatory to first-time viewers. Header is the badge,
                subtitle explains what it means and what to do. */}
            {streakDays != null && streakDays > 0 ? (
              <View style={styles.streakBlock}>
                <View style={styles.streakChip}>
                  <Text style={styles.streakEmoji}>🔥</Text>
                  <Text style={styles.streakText}>
                    {streakDays === 1
                      ? "1 day in a row"
                      : `${streakDays} days in a row`}
                  </Text>
                </View>
                <Text style={styles.streakSubtitle}>
                  {streakDays === 1
                    ? "You opened the app today. Come back tomorrow to start a streak — long streaks unlock better recommendations."
                    : `You've opened the app ${streakDays} days in a row. Miss a day and your streak resets.`}
                </Text>
              </View>
            ) : null}

            {/* Countdown — anchors the wait in concrete time. */}
            {nextPicksCountdown ? (
              <View style={styles.countdownRow}>
                <Ionicons
                  name="time-outline"
                  size={16}
                  color={Colors.text.secondary}
                />
                <Text style={styles.countdownText}>
                  Next picks in {nextPicksCountdown}
                </Text>
              </View>
            ) : null}
          </View>
        ) : (
          /* Card + floating bottom bar */
          <View
            style={styles.cardArea}
            onLayout={(e) => setCardAreaHeight(e.nativeEvent.layout.height)}
          >
            <SwipeCardWithRef
              ref={swipeCardRef}
              users={users}
              currentIndex={currentIndex}
              onSwipeRight={handleSwipeRight}
              onSwipeLeft={handleSwipeLeft}
              onTapProfile={handleTapProfile}
              cardHeight={cardAreaHeight}
              overlayPaddingBottom={88}
            />

            {/* Floating action buttons — overlaid on card bottom */}
            <View style={styles.bottomOverlay} pointerEvents="box-none">
              <TouchableOpacity
                style={styles.skipButton}
                onPress={() => swipeCardRef.current?.triggerSwipe("left")}
                activeOpacity={0.7}
              >
                <Ionicons name="arrow-undo" size={22} color={Colors.gray[500]} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.likeButton}
                onPress={() => swipeCardRef.current?.triggerSwipe("right")}
                activeOpacity={0.7}
              >
                <Ionicons name="thumbs-up" size={26} color={Colors.white} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  outerContainer: {
    flex: 1,
    marginHorizontal: 12,
    marginTop: Spacing.xs,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: Colors.gray[100],
    borderWidth: 1,
    borderColor: "rgba(32, 178, 170, 0.12)",
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
  headerTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.white,
  },
  likeCountBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  likeCountText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.primary,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text.secondary,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  emptyIconWrapper: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  emptyIconCard: {
    width: 88,
    height: 88,
    borderRadius: 16,
    backgroundColor: Colors.gray[200],
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIconShadow: {
    width: 60,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.gray[200],
    marginTop: 6,
  },
  emptyTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
    textAlign: "center",
    lineHeight: 24,
  },
  emptySubtitle: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text.secondary,
    textAlign: "center",
    marginTop: Spacing.xs,
  },
  streakBlock: {
    alignItems: "center",
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  streakChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: "#FFF4E0",
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: "#FFCD7A",
  },
  streakEmoji: {
    fontSize: 18,
  },
  streakText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: "#B25800",
  },
  streakSubtitle: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text.secondary,
    textAlign: "center",
    marginTop: Spacing.sm,
    lineHeight: 20,
  },
  countdownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: Spacing.md,
  },
  countdownText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text.secondary,
  },
  cardArea: {
    flex: 1,
  },
  bottomOverlay: {
    position: "absolute",
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.lg,
  },
  skipButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  likeButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
});

export default TodaySwipeView;
