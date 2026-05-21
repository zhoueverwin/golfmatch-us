import React, { useState, useCallback, useRef, memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { RootStackParamList } from "../types";
import { UserProfile } from "../types/dataModels";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../contexts/AuthContext";
import { useRevenueCat } from "../contexts/RevenueCatContext";

import { Colors } from "../constants/colors";
import { Spacing, BorderRadius } from "../constants/spacing";
import { Typography } from "../constants/typography";
import { DataProvider } from "../services";
import { UserActivityService } from "../services/userActivityService";
import { useNotifications } from "../contexts/NotificationContext";
import StatsTooltip, { StatsTooltipKey } from "../components/StatsTooltip";

/** Compact number formatter: 999 → "999", 1200 → "1.2k", 1500000 → "1.5M", 1000000000 → "1B" */
const formatStat = (n: number): string => {
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const k = n / 1000;
    return k % 1 === 0 ? `${k}k` : `${k.toFixed(1)}k`;
  }
  if (n < 1_000_000_000) {
    const m = n / 1_000_000;
    return m % 1 === 0 ? `${m}M` : `${m.toFixed(1)}M`;
  }
  const b = n / 1_000_000_000;
  return b % 1 === 0 ? `${b}B` : `${b.toFixed(1)}B`;
};
import GolfCalendar from "../components/GolfCalendar";

type MyPageScreenNavigationProp = StackNavigationProp<RootStackParamList>;

/** Memoized profile avatar — prevents image flicker from parent re-renders */
const ProfileAvatar = memo(({ uri }: { uri: string | null }) => {
  if (uri) {
    return <Image source={{ uri }} style={styles.profileImage} />;
  }
  return (
    <View style={[styles.profileImage, styles.placeholderImage]}>
      <Ionicons name="person" size={72} color={Colors.text.secondary} />
    </View>
  );
});

const MyPageScreen: React.FC = () => {
  const navigation = useNavigation<MyPageScreenNavigationProp>();
  const { profileId } = useAuth(); // Get profileId from AuthContext
  const { unreadCount, unreadFootprintCount } = useNotifications(); // Get unread notification count from NotificationContext
  const { isProMember } = useRevenueCat();
  // Tracks both the % filled and the first unfilled field's label so
  // the completion CTA can show a specific next-action hint
  // ("Add your bio") instead of a generic slogan.
  const [completion, setCompletion] = useState<{
    percent: number;
    nextHint: string | null;
  }>({ percent: 0, nextHint: null });
  const [userName, setUserName] = useState<string | null>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  // Dashboard stats
  const [dashboardStats, setDashboardStats] = useState({
    matches: 0, likes: 0, profileViews: 0, impressions: 0, postViews: 0,
  });
  const [dailyStats, setDailyStats] = useState({
    todayProfileViews: 0, todayLikes: 0, todayImpressions: 0, todayPostViews: 0, yesterdayProfileViews: 0,
  });
  const [tooltipKey, setTooltipKey] = useState<StatsTooltipKey | null>(null);
  const [activeTab, setActiveTab] = useState<'mypage' | 'activity'>('mypage');

  // Scroll position preservation — prevents reset when useFocusEffect reloads data
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);


  // Activity data states (for menu badges)
  const [pastLikesCount, setPastLikesCount] = useState(0);

  /**
   * Returns the profile completion percentage AND the user-facing label
   * of the first unfilled (or partly filled) field.
   *
   * Tracks the SAME field set and ORDER as EditProfileScreen's
   * `computeCompleteness` so the two screens always show the same
   * number. If you add/remove a field here, mirror the change there.
   * Both should eventually share one helper, but until the User /
   * UserProfile shapes are unified that helper would need two
   * variants — keeping them in parallel for now.
   *
   * Photos weighted fractionally (1/6 per slot), play_prefecture and
   * languages as arrays (filled if non-empty). Deprecated fields
   * (blood_type, favorite_club, personality_type) are NOT tracked.
   */
  const calculateProfileCompletion = (
    profile: UserProfile | null,
  ): { percent: number; nextHint: string | null } => {
    if (!profile) return { percent: 0, nextHint: "first photo" };

    const isStr = (v: unknown): boolean => {
      if (v === null || v === undefined) return false;
      const s = String(v).trim();
      return s !== "" && s !== "0";
    };
    const isArr = (v: unknown): boolean =>
      Array.isArray(v) && v.length > 0;

    const photoCount = (profile.profile_pictures ?? []).filter(
      (p) => typeof p === "string" && p !== "",
    ).length;
    const photoFill = Math.min(1, photoCount / 6);
    const photoLabel = photoCount === 0 ? "first photo" : "more photos";

    const checks: { label: string; fill: number }[] = [
      // High-impact fields first — drive the "next field" hint.
      { label: photoLabel, fill: photoFill },
      { label: "name", fill: isStr(profile.basic?.name) ? 1 : 0 },
      { label: "bio", fill: isStr(profile.bio) ? 1 : 0 },
      { label: "what you're looking for", fill: isStr(profile.relationship?.looking_for) ? 1 : 0 },
      // Golf identity
      { label: "handicap", fill: isStr(profile.golf?.handicap) ? 1 : 0 },
      { label: "home course", fill: isStr(profile.golf?.home_course) ? 1 : 0 },
      { label: "skill level", fill: isStr(profile.golf?.skill_level) ? 1 : 0 },
      { label: "years playing", fill: isStr(profile.golf?.experience) ? 1 : 0 },
      { label: "playing frequency", fill: isStr(profile.golf?.playing_frequency) ? 1 : 0 },
      { label: "average score", fill: isStr(profile.golf?.average_score) ? 1 : 0 },
      { label: "best score", fill: isStr(profile.golf?.best_score) ? 1 : 0 },
      { label: "walking vs riding", fill: isStr(profile.golf?.walking_or_riding) ? 1 : 0 },
      { label: "dominant hand", fill: isStr(profile.golf?.dominant_hand) ? 1 : 0 },
      { label: "transportation preference", fill: isStr(profile.golf?.transportation) ? 1 : 0 },
      { label: "available days", fill: isStr(profile.golf?.available_days) ? 1 : 0 },
      { label: "states where you play", fill: isArr(profile.play_prefecture) ? 1 : 0 },
      // Lifestyle
      { label: "drinking preference", fill: isStr(profile.lifestyle?.drinking) ? 1 : 0 },
      { label: "kids status", fill: isStr(profile.relationship?.has_kids) ? 1 : 0 },
      { label: "wants kids", fill: isStr(profile.relationship?.wants_kids) ? 1 : 0 },
      { label: "occupation", fill: isStr(profile.lifestyle?.occupation) ? 1 : 0 },
      { label: "education", fill: isStr(profile.lifestyle?.education) ? 1 : 0 },
      { label: "pets", fill: isStr(profile.lifestyle?.pets) ? 1 : 0 },
      { label: "languages", fill: isArr(profile.lifestyle?.languages) ? 1 : 0 },
      // Required basics — last so they're not the first hint a user sees.
      { label: "birthday", fill: isStr(profile.basic?.age) ? 1 : 0 },
      { label: "gender", fill: isStr(profile.basic?.gender) ? 1 : 0 },
      { label: "state", fill: isStr(profile.basic?.prefecture) ? 1 : 0 },
      { label: "height", fill: isStr(profile.basic?.height) ? 1 : 0 },
      { label: "body type", fill: isStr(profile.basic?.body_type) ? 1 : 0 },
      { label: "smoking preference", fill: isStr(profile.basic?.smoking) ? 1 : 0 },
      // Lowest-priority optionals
      { label: "religion", fill: isStr(profile.lifestyle?.religion) ? 1 : 0 },
      { label: "political leaning", fill: isStr(profile.lifestyle?.politics) ? 1 : 0 },
    ];

    const filledSum = checks.reduce((sum, c) => sum + c.fill, 0);
    const next = checks.find((c) => c.fill < 1);
    return {
      percent: Math.round((filledSum / checks.length) * 100),
      nextHint: next ? next.label : null,
    };
  };

  // Load user profile data. Shows spinner only on initial load;
  // subsequent refetches update silently so the page doesn't flash.
  const loadUserProfile = async () => {
    try {
      if (!userProfile) setIsLoadingProfile(true);
      const currentUserId = profileId || process.env.EXPO_PUBLIC_TEST_USER_ID;
      if (!currentUserId) {
        console.log('No user ID available');
        setIsLoadingProfile(false);
        return;
      }

      const response = await DataProvider.getUserProfile(currentUserId);
      if (response.data) {
        // Only set userProfile on initial load (used solely for loading-gate check).
        // Skipping on refetch avoids a full re-render that causes image flicker.
        if (!userProfile) setUserProfile(response.data);
        // Only update derived states when values actually change to avoid
        // unnecessary re-renders that cause image/content flicker.
        const newName = response.data.basic.name;
        const newImage = response.data.profile_pictures.length > 0 ? response.data.profile_pictures[0] : null;
        const newCompletion = calculateProfileCompletion(response.data);
        setUserName(prev => prev === newName ? prev : newName);
        setProfileImage(prev => prev === newImage ? prev : newImage);
        // Compare both fields so we only re-render when something actually changed.
        setCompletion(prev =>
          prev.percent === newCompletion.percent && prev.nextHint === newCompletion.nextHint
            ? prev
            : newCompletion,
        );
      }
    } catch (_error) {
      console.error("Error loading user profile:", _error);
    } finally {
      setIsLoadingProfile(false);
    }
  };

  // Load activity data
  const loadActivityData = async () => {
    try {
      const currentUserId = profileId || process.env.EXPO_PUBLIC_TEST_USER_ID;
      if (!currentUserId) {
        console.log('No user ID available');
        return;
      }

      const [
        pastLikesCountResult,
        stats,
        daily,
      ] = await Promise.all([
        UserActivityService.getPastLikesCount(currentUserId),
        UserActivityService.getDashboardStats(currentUserId),
        UserActivityService.getDailyStats(currentUserId),
      ]);

      setPastLikesCount(prev => prev === pastLikesCountResult ? prev : pastLikesCountResult);
      setDashboardStats(prev => JSON.stringify(prev) === JSON.stringify(stats) ? prev : stats);
      setDailyStats(prev => JSON.stringify(prev) === JSON.stringify(daily) ? prev : daily);
    } catch (_error) {
      console.error("Error loading activity data:", _error);
    }
  };

  // Throttle refetches — skip if we loaded less than 10 seconds ago.
  // Quick back-navigation (Visitors → Back) won't trigger any data reload,
  // eliminating all re-render flashing. Longer absences (EditProfile) still refresh.
  const lastFetchRef = useRef(0);

  useFocusEffect(
    useCallback(() => {
      if (!profileId) return;
      const now = Date.now();
      const elapsed = now - lastFetchRef.current;
      // Skip refetch if less than 10 seconds since last load
      if (lastFetchRef.current > 0 && elapsed < 10_000) return;
      lastFetchRef.current = now;
      loadUserProfile();
      loadActivityData();
    }, [profileId]),
  );

  // Scroll-position restoration.
  //
  // The existing scrollOffsetRef captured the user's last scroll Y on every
  // onScroll, but nothing ever wrote it back. Returning from a child screen
  // (Settings, EditProfile, Help, etc.) caused the visible scroll to jump
  // back to top — a side effect of either a brief unmount or a layout pass
  // that resets the native scroll view's internal offset.
  //
  // Restoring on focus, deferred by one animation frame to let the
  // ScrollView complete its layout, brings the user back to exactly where
  // they were. `animated: false` so the restoration is invisible — feels
  // like the scroll never moved at all.
  useFocusEffect(
    useCallback(() => {
      const target = scrollOffsetRef.current;
      if (target <= 0) return;
      const raf = requestAnimationFrame(() => {
        scrollViewRef.current?.scrollTo({ y: target, animated: false });
      });
      return () => cancelAnimationFrame(raf);
    }, []),
  );

  // Handlers
  const handleFootprintPress = () => {
    navigation.navigate("Footprints");
  };

  const handlePastLikesPress = () => {
    navigation.navigate("PastLikes");
  };

  const handleCalendarPress = () => {
    navigation.navigate("CalendarEdit");
  };

  // Remove handleUserPress as it's no longer needed

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />

      {isLoadingProfile ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading your profile...</Text>
        </View>
      ) : (
        <ScrollView
          ref={scrollViewRef}
          style={styles.content}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(e) => { scrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
        >
          {/* Header with View Profile */}
          <View style={styles.headerContainer}>
            <TouchableOpacity
              onPress={() =>
                navigation.navigate("Profile", { userId: profileId || process.env.EXPO_PUBLIC_TEST_USER_ID || "default" })
              }
              style={styles.headerLeftContainer}
            >
              <Image 
                source={require("../../assets/images/Icons/Profile-Outline.png")} 
                style={styles.headerProfileIcon}
              />
              <Text style={styles.headerTitle}>View Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigation.navigate("EditProfile")}
              style={styles.editIconButton}
            >
              <Image 
                source={require("../../assets/images/Icons/Edit.png")} 
                style={styles.editIcon}
              />
            </TouchableOpacity>
          </View>

          {/* Profile Section with Gradient Background */}
          <LinearGradient
            colors={['#21B2AA54', '#21B2AA00', '#21B2AA00']}
            locations={[0, 0.33, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.profileSection}
          >
            <TouchableOpacity
              onPress={() =>
                navigation.navigate("Profile", { userId: profileId || process.env.EXPO_PUBLIC_TEST_USER_ID || "default" })
              }
              style={styles.profileImageContainer}
            >
              <ProfileAvatar uri={profileImage} />
            </TouchableOpacity>

            <Text style={styles.profileName}>{userName || "User"}</Text>

            {/* Profile completion CTA — entire card is tappable and goes
                to EditProfile. Below 100% it shows a specific next-step
                ("Add your bio") so the encouragement is actionable, not
                a slogan. At 100% it collapses to a small celebratory
                badge so the screen doesn't pester users who are done. */}
            {completion.percent < 100 ? (
              <TouchableOpacity
                style={styles.completionCard}
                onPress={() => navigation.navigate("EditProfile")}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Profile ${completion.percent} percent complete. Tap to edit.`}
              >
                <View style={styles.completionTopRow}>
                  <Text style={styles.completionPercent}>
                    Profile {completion.percent}% complete
                  </Text>
                  <View style={styles.completionEditPill}>
                    <Text style={styles.completionEditPillText}>Edit</Text>
                    <Ionicons
                      name="chevron-forward"
                      size={14}
                      color={Colors.primary}
                    />
                  </View>
                </View>
                <View style={styles.completionTrack}>
                  <View
                    style={[
                      styles.completionFill,
                      { width: `${completion.percent}%` },
                    ]}
                  />
                </View>
                {completion.nextHint ? (
                  <Text style={styles.completionHint}>
                    Add your {completion.nextHint} →
                  </Text>
                ) : null}
              </TouchableOpacity>
            ) : (
              <View style={styles.completionDoneBadge}>
                <Ionicons
                  name="checkmark-circle"
                  size={16}
                  color={Colors.success}
                />
                <Text style={styles.completionDoneText}>Profile complete</Text>
              </View>
            )}
          </LinearGradient>

          {/* Tab Bar */}
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={styles.tabItem}
              onPress={() => setActiveTab('mypage')}
            >
              <Text style={[styles.tabLabel, activeTab === 'mypage' && styles.tabLabelActive]}>
                Activity
              </Text>
              {activeTab === 'mypage' && <View style={styles.tabIndicator} />}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.tabItem}
              onPress={() => setActiveTab('activity')}
            >
              <Text style={[styles.tabLabel, activeTab === 'activity' && styles.tabLabelActive]}>
                Details
              </Text>
              {activeTab === 'activity' && <View style={styles.tabIndicator} />}
            </TouchableOpacity>
          </View>

          {/* ── Tab 1: My Page ─────────────────────── */}
          <View style={activeTab !== 'mypage' ? { display: 'none' } : undefined}>
              {/* Daily Activity Strip — teaser */}
              {(dailyStats.todayProfileViews > 0 || dailyStats.todayLikes > 0 || dailyStats.todayImpressions > 0 || dailyStats.todayPostViews > 0) && (
                <Pressable style={styles.dailyStrip} onPress={() => setActiveTab('activity')}>
                  <View style={styles.dailyStripContent}>
                    <View style={styles.dailyStripItems}>
                      {dailyStats.todayProfileViews > 0 && (
                        <View style={styles.dailyStripItem}>
                          <Ionicons name="eye-outline" size={13} color={Colors.primary} />
                          <Text style={styles.dailyStripLabel}>
                            <Text style={styles.dailyStripValue}>{dailyStats.todayProfileViews}</Text> views
                          </Text>
                        </View>
                      )}
                      {dailyStats.todayLikes > 0 && (
                        <View style={styles.dailyStripItem}>
                          <Ionicons name="heart-outline" size={13} color={Colors.primary} />
                          <Text style={styles.dailyStripLabel}>
                            <Text style={styles.dailyStripValue}>{dailyStats.todayLikes}</Text> likes
                          </Text>
                        </View>
                      )}
                      {dailyStats.todayImpressions > 0 && (
                        <View style={styles.dailyStripItem}>
                          <Ionicons name="search-outline" size={13} color={Colors.primary} />
                          <Text style={styles.dailyStripLabel}>
                            <Text style={styles.dailyStripValue}>{dailyStats.todayImpressions}</Text> impressions
                          </Text>
                        </View>
                      )}
                      {dailyStats.todayPostViews > 0 && (
                        <View style={styles.dailyStripItem}>
                          <Ionicons name="document-text-outline" size={13} color={Colors.primary} />
                          <Text style={styles.dailyStripLabel}>
                            <Text style={styles.dailyStripValue}>{dailyStats.todayPostViews}</Text> post views
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={Colors.gray[300]} style={{ alignSelf: 'center', marginRight: Spacing.sm }} />
                </Pressable>
              )}

              {/* Quick Stats Summary */}
              <View style={styles.quickStats}>
                <View style={styles.quickStatsTop}>
                  <View style={styles.quickStatItem}>
                    <Text style={styles.quickStatNumber}>{formatStat(dashboardStats.matches)}</Text>
                    <Text style={styles.quickStatLabel}>Connections</Text>
                  </View>
                  <View style={styles.quickStatDivider} />
                  <View style={styles.quickStatItem}>
                    <Text style={styles.quickStatNumber}>{formatStat(dashboardStats.likes)}</Text>
                    <Text style={styles.quickStatLabel}>Likes</Text>
                  </View>
                  <View style={styles.quickStatDivider} />
                  <View style={styles.quickStatItem}>
                    <Text style={styles.quickStatNumber}>{formatStat(dashboardStats.profileViews)}</Text>
                    <Text style={styles.quickStatLabel}>Views</Text>
                  </View>
                </View>
                {(dailyStats.todayProfileViews > 0 || dailyStats.yesterdayProfileViews > 0) && (
                  <View style={styles.quickStatsDelta}>
                    <Ionicons name="trending-up-outline" size={13} color={Colors.primary} />
                    <Text style={styles.quickStatsDeltaText}>
                      {dailyStats.todayProfileViews > 0
                        ? `${dailyStats.todayProfileViews} views today`
                        : ''
                      }
                      {dailyStats.todayProfileViews > 0 && dailyStats.yesterdayProfileViews > 0 ? ' · ' : ''}
                      {dailyStats.yesterdayProfileViews > 0
                        ? dailyStats.todayProfileViews >= dailyStats.yesterdayProfileViews
                          ? `+${dailyStats.todayProfileViews - dailyStats.yesterdayProfileViews} vs yesterday`
                          : `Yesterday: ${dailyStats.yesterdayProfileViews}`
                        : ''
                      }
                    </Text>
                  </View>
                )}
              </View>

              {/* Membership tier row removed — with the gendered hard paywall
                  at entry, every user reaching this screen is on the correct
                  tier and the badge ("Premium" / "Free") doesn't add user
                  value. Apple's required "Manage subscription" affordance now
                  lives in Settings → Manage subscription. */}

              {/* Menu Items */}
              <View style={styles.menuContainer}>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={handleFootprintPress}
          >
            <View style={styles.menuItemLeft}>
              <Image 
                source={require("../../assets/images/Icons/Footprint.png")} 
                style={styles.menuIcon}
                resizeMode="contain"
              />
              <Text style={styles.menuItemText}>Visitors</Text>
            </View>
            <View style={styles.menuItemRight}>
              {unreadFootprintCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unreadFootprintCount > 99 ? 99 : unreadFootprintCount}</Text>
                </View>
              )}
              <Ionicons
                name="chevron-forward"
                size={18}
                color={Colors.gray[400]}
              />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={handlePastLikesPress}
          >
            <View style={styles.menuItemLeft}>
              <Image 
                source={require("../../assets/images/Icons/Like.png")} 
                style={styles.menuIcon}
                resizeMode="contain"
              />
              <Text style={styles.menuItemText}>Likes Sent</Text>
            </View>
            <View style={styles.menuItemRight}>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={Colors.gray[400]}
              />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={handleCalendarPress}
          >
            <View style={styles.menuItemLeft}>
              <Image 
                source={require("../../assets/images/Icons/Calendar.png")} 
                style={styles.menuIcon}
                resizeMode="contain"
              />
              <Text style={styles.menuItemText}>Calendar</Text>
            </View>
            <View style={styles.menuItemRight}>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={Colors.gray[400]}
              />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation.navigate("NotificationHistory")}
          >
            <View style={styles.menuItemLeft}>
              <Image 
                source={require("../../assets/images/Icons/Notifications.png")} 
                style={styles.menuIcon}
                resizeMode="contain"
              />
              <Text style={styles.menuItemText}>Notifications</Text>
            </View>
            <View style={styles.menuItemRight}>
              {unreadCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unreadCount > 99 ? 99 : unreadCount}</Text>
                </View>
              )}
              <Ionicons
                name="chevron-forward"
                size={18}
                color={Colors.gray[400]}
              />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation.navigate("ContactReply")}
          >
            <View style={styles.menuItemLeft}>
              <Image 
                source={require("../../assets/images/Icons/Contact.png")} 
                style={styles.menuIcon}
                resizeMode="contain"
              />
              <Text style={styles.menuItemText}>Contact</Text>
            </View>
            <View style={styles.menuItemRight}>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={Colors.gray[400]}
              />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation.navigate("Help")}
          >
            <View style={styles.menuItemLeft}>
              <Image
                source={require("../../assets/images/Icons/Help.png")}
                style={styles.menuIcon}
                resizeMode="contain"
              />
              <Text style={styles.menuItemText}>Help</Text>
            </View>
            <View style={styles.menuItemRight}>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={Colors.gray[400]}
              />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation.navigate("LocationSettings")}
          >
            <View style={styles.menuItemLeft}>
              {/* Pin-Outline shares the menuIcon style with every other
                  row — that style sets tintColor: Colors.primary so the
                  PNG renders in the brand green, matching Help, Settings,
                  and the rest of the menu. */}
              <Image
                source={require("../../assets/images/Icons/Pin-Outline.png")}
                style={styles.menuIcon}
                resizeMode="contain"
              />
              <Text style={styles.menuItemText}>Location</Text>
            </View>
            <View style={styles.menuItemRight}>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={Colors.gray[400]}
              />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation.navigate("Settings")}
          >
            <View style={styles.menuItemLeft}>
              <Image
                source={require("../../assets/images/Icons/Settings.png")}
                style={styles.menuIcon}
                resizeMode="contain"
              />
              <Text style={styles.menuItemText}>Settings</Text>
            </View>
            <View style={styles.menuItemRight}>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={Colors.gray[400]}
              />
            </View>
          </TouchableOpacity>
              </View>
          </View>

          {/* ── Tab 2: Activity ──────────────────── */}
          <View style={activeTab !== 'activity' ? { display: 'none' } : undefined}>
              {/* Daily Activity Strip — full */}
              {(dailyStats.todayProfileViews > 0 || dailyStats.todayLikes > 0 || dailyStats.todayImpressions > 0 || dailyStats.todayPostViews > 0) && (
                <View style={styles.dailyStrip}>
                  <View style={styles.dailyStripContent}>
                    <View style={styles.dailyStripItems}>
                      {dailyStats.todayProfileViews > 0 && (
                        <View style={styles.dailyStripItem}>
                          <Ionicons name="eye-outline" size={13} color={Colors.primary} />
                          <Text style={styles.dailyStripLabel}>
                            <Text style={styles.dailyStripValue}>{dailyStats.todayProfileViews}</Text> views
                          </Text>
                        </View>
                      )}
                      {dailyStats.todayLikes > 0 && (
                        <View style={styles.dailyStripItem}>
                          <Ionicons name="heart-outline" size={13} color={Colors.primary} />
                          <Text style={styles.dailyStripLabel}>
                            <Text style={styles.dailyStripValue}>{dailyStats.todayLikes}</Text> likes
                          </Text>
                        </View>
                      )}
                      {dailyStats.todayImpressions > 0 && (
                        <View style={styles.dailyStripItem}>
                          <Ionicons name="search-outline" size={13} color={Colors.primary} />
                          <Text style={styles.dailyStripLabel}>
                            <Text style={styles.dailyStripValue}>{dailyStats.todayImpressions}</Text> impressions
                          </Text>
                        </View>
                      )}
                      {dailyStats.todayPostViews > 0 && (
                        <View style={styles.dailyStripItem}>
                          <Ionicons name="document-text-outline" size={13} color={Colors.primary} />
                          <Text style={styles.dailyStripLabel}>
                            <Text style={styles.dailyStripValue}>{dailyStats.todayPostViews}</Text> post views
                          </Text>
                        </View>
                      )}
                    </View>
                    {dailyStats.yesterdayProfileViews > 0 && (
                      <Text style={styles.dailyStripDelta}>
                        {dailyStats.todayProfileViews >= dailyStats.yesterdayProfileViews
                          ? `+${dailyStats.todayProfileViews - dailyStats.yesterdayProfileViews} vs yesterday`
                          : `Yesterday: ${dailyStats.yesterdayProfileViews}`
                        }
                      </Text>
                    )}
                  </View>
                </View>
              )}

              {/* Stats Dashboard Card */}
              <View style={styles.dashboardCard}>
                {/* Hero Row */}
                <View style={styles.dashHeroRow}>
                  <Pressable
                    style={styles.dashCell}
                    onPress={() => setTooltipKey("matches")}
                  >
                    <View style={styles.dashCellHeader}>
                      <Text style={styles.dashLabel}>Connections</Text>
                      <Ionicons name="information-circle-outline" size={14} color={Colors.gray[300]} />
                    </View>
                    <Text style={styles.dashHeroNumber}>{formatStat(dashboardStats.matches)}</Text>
                  </Pressable>

                  <View style={styles.dashDividerV} />

                  <Pressable
                    style={styles.dashCell}
                    onPress={() => setTooltipKey("likes")}
                  >
                    <View style={styles.dashCellHeader}>
                      <Text style={styles.dashLabel}>Likes</Text>
                      <Ionicons name="information-circle-outline" size={14} color={Colors.gray[300]} />
                    </View>
                    <Text style={styles.dashHeroNumber} testID="MYPAGE_SCREEN.LIKES_COUNT">
                      {formatStat(dashboardStats.likes)}
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.dashDividerH} />

                {/* Secondary Row */}
                <View style={styles.dashSecondaryRow}>
                  {([
                    { key: "profileViews" as StatsTooltipKey, label: "Views", value: dashboardStats.profileViews },
                    { key: "impressions" as StatsTooltipKey, label: "Impressions", value: dashboardStats.impressions },
                    { key: "postViews" as StatsTooltipKey, label: "Posts", value: dashboardStats.postViews },
                  ]).map((item, index) => (
                    <React.Fragment key={item.key}>
                      {index > 0 && <View style={styles.dashDividerV} />}
                      <Pressable
                        style={styles.dashCell}
                        onPress={() => setTooltipKey(item.key)}
                      >
                        <View style={styles.dashCellHeader}>
                          <Text style={styles.dashLabelSm}>{item.label}</Text>
                          <Ionicons name="information-circle-outline" size={12} color={Colors.gray[300]} />
                        </View>
                        <Text style={styles.dashSecondaryNumber}>
                          {formatStat(item.value)}
                        </Text>
                      </Pressable>
                    </React.Fragment>
                  ))}
                </View>

              </View>

              {/* Foot/Past Likes — also accessible here */}
              <View style={[styles.menuContainer, { marginBottom: 100 }]}>
                <TouchableOpacity style={styles.menuItem} onPress={handleFootprintPress}>
                  <View style={styles.menuItemLeft}>
                    <Image source={require("../../assets/images/Icons/Footprint.png")} style={styles.menuIcon} resizeMode="contain" />
                    <Text style={styles.menuItemText}>Visitors</Text>
                  </View>
                  <View style={styles.menuItemRight}>
                    {unreadFootprintCount > 0 && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{unreadFootprintCount > 99 ? 99 : unreadFootprintCount}</Text>
                      </View>
                    )}
                    <Ionicons name="chevron-forward" size={18} color={Colors.gray[400]} />
                  </View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={handlePastLikesPress}>
                  <View style={styles.menuItemLeft}>
                    <Image source={require("../../assets/images/Icons/Like.png")} style={styles.menuIcon} resizeMode="contain" />
                    <Text style={styles.menuItemText}>Likes Sent</Text>
                  </View>
                  <View style={styles.menuItemRight}>
                    <Ionicons name="chevron-forward" size={18} color={Colors.gray[400]} />
                  </View>
                </TouchableOpacity>
              </View>
          </View>
      </ScrollView>
      )}

      {/* Stats Tooltip */}
      {tooltipKey && (
        <StatsTooltip
          visible={!!tooltipKey}
          onClose={() => setTooltipKey(null)}
          tooltipKey={tooltipKey}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.background,
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
  },
  content: {
    flex: 1,
  },
  headerContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.white,
  },
  headerLeftContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerProfileIcon: {
    width: 24,
    height: 24,
    tintColor: Colors.primary,
  },
  headerTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.primary,
  },
  editIconButton: {
    padding: 4,
  },
  editIcon: {
    width: 24,
    height: 24,
    tintColor: Colors.text.secondary,
  },
  profileSection: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    alignItems: "center",
  },
  // ── Tab Bar ─────────────────────────────────
  tabBar: {
    flexDirection: "row",
    backgroundColor: Colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.gray[200],
    marginBottom: Spacing.sm,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    position: "relative",
  },
  tabLabel: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
    color: Colors.gray[400],
  },
  tabLabelActive: {
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
  },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    left: "25%",
    right: "25%",
    height: 3,
    backgroundColor: Colors.primary,
    borderRadius: 1.5,
  },
  profileImageContainer: {
    marginBottom: 8,
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  placeholderImage: {
    backgroundColor: Colors.gray[200],
    justifyContent: "center",
    alignItems: "center",
  },
  profileName: {
    fontSize: 18,
    fontWeight: "500",
    fontFamily: Typography.getFontFamily("500"),
    color: "#131313",
    marginBottom: 6,
  },
  // New completion CTA — card-style, tappable, specific next-action hint.
  completionCard: {
    width: "88%",
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    // Soft elevation so the CTA reads as a distinct, tappable card
    // sitting on top of the gradient profile section.
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  completionTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  completionPercent: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
  },
  completionEditPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: Colors.primary + "15",
    borderRadius: BorderRadius.full,
    gap: 2,
  },
  completionEditPillText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.primary,
  },
  completionTrack: {
    height: 6,
    backgroundColor: Colors.gray[100],
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 8,
  },
  completionFill: {
    height: "100%",
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  completionHint: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
  },
  completionDoneBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: Spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: Colors.success + "15",
    borderRadius: BorderRadius.full,
  },
  completionDoneText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.success,
  },
  // ── Quick Stats (Tab 1) ──────────────────────
  quickStats: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  quickStatsTop: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  quickStatsDelta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
    backgroundColor: "#F0FAF9",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(32, 178, 170, 0.15)",
  },
  quickStatsDeltaText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
  },
  quickStatItem: {
    flex: 1,
    alignItems: "center",
  },
  quickStatNumber: {
    fontSize: 22,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.primary,
    marginBottom: 2,
  },
  quickStatLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.text.secondary,
  },
  quickStatDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
    backgroundColor: Colors.gray[200],
  },
  quickStatStoreIcon: {
    width: 70,
    height: 70,
    marginBottom: 2,
  },
  quickStatMore: {
    paddingHorizontal: Spacing.md,
    alignItems: "center",
    gap: 2,
  },
  quickStatMoreText: {
    fontSize: 10,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
  },
  // ── Daily Activity Strip ─────────────────────
  dailyStrip: {
    flexDirection: "row",
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  dailyStripContent: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
  },
  dailyStripItems: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  dailyStripItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  dailyStripLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.text.secondary,
  },
  dailyStripValue: {
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.primary,
  },
  dailyStripDelta: {
    fontSize: Typography.fontSize.xs,
    color: Colors.text.tertiary,
    marginTop: 4,
  },
  // ── Dashboard Card ──────────────────────────
  dashboardCard: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  dashHeroRow: {
    flexDirection: "row",
  },
  dashCell: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    alignItems: "center",
  },
  dashCellHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  dashLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.text.secondary,
  },
  dashHeroNumber: {
    fontSize: 28,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.primary,
  },
  dashDividerV: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: Colors.gray[200],
    marginVertical: Spacing.sm,
  },
  dashDividerH: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.gray[200],
    marginHorizontal: Spacing.sm,
  },
  dashSecondaryRow: {
    flexDirection: "row",
  },
  dashLabelSm: {
    fontSize: 11,
    color: Colors.text.secondary,
  },
  dashSecondaryNumber: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.primary,
  },
  membershipRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    marginBottom: Spacing.xs,
  },
  membershipRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  membershipRowLabel: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
  },
  membershipRowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  membershipRowStatus: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.normal,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
  },
  membershipCtaBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: Spacing.md,
    paddingVertical: 14,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
  },
  membershipCtaText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.white,
  },
  menuContainer: {
    backgroundColor: Colors.white,
    marginHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: 100,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    minHeight: 48,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.gray[100],
  },
  menuItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minHeight: 24,
  },
  menuIcon: {
    width: 18,
    height: 18,
    tintColor: Colors.primary,
    marginRight: 12,
  },
  menuItemText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.normal,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.normal),
    color: Colors.text.primary,
  },
  menuItemRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  badge: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: Spacing.xs,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.white,
  },
});

export default MyPageScreen;
