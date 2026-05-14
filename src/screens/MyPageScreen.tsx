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
  const [profileCompletion, setProfileCompletion] = useState(0);
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

  // Calculate profile completion percentage
  const calculateProfileCompletion = (profile: UserProfile | null) => {
    if (!profile) return 0;
    
    const fields = [
      // Basic info (40% weight)
      profile.basic?.name,
      profile.basic?.age,
      profile.basic?.gender,
      profile.basic?.prefecture,
      profile.basic?.blood_type,
      profile.basic?.height,
      profile.basic?.body_type,
      profile.basic?.smoking,
      
      // Golf info (40% weight)
      profile.golf?.skill_level,
      profile.golf?.experience,
      profile.golf?.average_score,
      profile.golf?.transportation,
      profile.golf?.available_days,
      
      // Bio and photos (20% weight)
      profile.bio,
      profile.profile_pictures?.length > 0,
    ];
    
    const filledFields = fields.filter(field => {
      if (typeof field === 'boolean') return field;
      return field && field.toString().trim() !== '' && field !== '0';
    }).length;
    
    return Math.round((filledFields / fields.length) * 100);
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
        setProfileCompletion(prev => prev === newCompletion ? prev : newCompletion);
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

            <Text style={styles.completionText}>
              Profile completion: {profileCompletion}%
            </Text>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${profileCompletion}%` },
                ]}
              />
            </View>

            <Text style={styles.completionMessage}>
              A complete profile gets more matches!
            </Text>
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
  completionText: {
    fontSize: 14,
    color: Colors.gray[500],
    marginBottom: 4,
    fontWeight: Typography.fontWeight.normal,
  },
  progressBar: {
    height: 10,
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.full,
    overflow: "hidden",
    width: "80%",
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.primary,
  },
  completionMessage: {
    fontSize: 14,
    color: Colors.primary,
    textAlign: "center",
    fontWeight: "700",
    marginTop: 8,
    fontFamily: Typography.getFontFamily("700"),
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
