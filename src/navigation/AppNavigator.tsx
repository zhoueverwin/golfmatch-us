import React, { useEffect, useRef, useCallback, useState } from "react";
import { NavigationContainer, NavigationContainerRef } from "@react-navigation/native";
import { createStackNavigator, CardStyleInterpolators } from "@react-navigation/stack";
import { createBottomTabNavigator, BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { TouchableOpacity, View, Image, Text, Linking, Platform } from "react-native";
import { LinkingOptions } from "@react-navigation/native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { Colors } from "../constants/colors";
import { RootStackParamList, MainTabParamList } from "../types";
import ErrorBoundary from "../components/ErrorBoundary";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import { NotificationProvider, useNotifications } from "../contexts/NotificationContext";
import { MatchProvider } from "../contexts/MatchContext";
import { RevenueCatProvider, useRevenueCat } from "../contexts/RevenueCatContext";
import { DataProvider } from "../services";
import { UserProfile } from "../types/dataModels";
import { logScreenView } from "../services/firebaseAnalytics";
import UpdatePromptModal from "../components/UpdatePromptModal";
import AnnouncementModal from "../components/AnnouncementModal";
import { useAppUpdate } from "../hooks/useAppUpdate";
import { useAnnouncements } from "../hooks/useAnnouncements";

// Import screens
import AuthScreen from "../screens/AuthScreen";
import HomeScreen from "../screens/HomeScreen";
import SearchScreen from "../screens/SearchScreen";
import ConnectionsScreen from "../screens/ConnectionsScreen";
import MessagesScreen from "../screens/MessagesScreen";
import MyPageScreen from "../screens/MyPageScreen";
import ChatScreen from "../screens/ChatScreen";
import UserProfileScreen from "../screens/UserProfileScreen";
import EditProfileScreen from "../screens/EditProfileScreen";
import OnboardingNameScreen from "../screens/onboarding/OnboardingNameScreen";
import OnboardingGenderScreen from "../screens/onboarding/OnboardingGenderScreen";
import OnboardingBirthdateScreen from "../screens/onboarding/OnboardingBirthdateScreen";
import OnboardingStateScreen from "../screens/onboarding/OnboardingStateScreen";
import OnboardingPhotoScreen from "../screens/onboarding/OnboardingPhotoScreen";
import OnboardingKycScreen from "../screens/onboarding/OnboardingKycScreen";
import OnboardingPaywallScreen from "../screens/onboarding/OnboardingPaywallScreen";
import SettingsScreen from "../screens/SettingsScreen";
import NotificationSettingsScreen from "../screens/NotificationSettingsScreen";
import NotificationHistoryScreen from "../screens/NotificationHistoryScreen";
import CalendarEditScreen from "../screens/CalendarEditScreen";
import TestAccountSetupScreen from "../screens/TestAccountSetupScreen";
import UserPostsScreen from "../screens/UserPostsScreen";
import FootprintsScreen from "../screens/FootprintsScreen";
import PastLikesScreen from "../screens/PastLikesScreen";
import ContactReplyScreen from "../screens/ContactReplyScreen";
import StoreScreen from "../screens/StoreScreen";
import HelpScreen from "../screens/HelpScreen";
import HelpDetailScreen from "../screens/HelpDetailScreen";
import KycVerificationScreen from "../screens/KycVerificationScreen";
import DeleteAccountScreen from "../screens/DeleteAccountScreen";
import AccountLinkingScreen from "../screens/AccountLinkingScreen";
import WelcomeScreen from "../screens/WelcomeScreen";
import ReportScreen from "../screens/ReportScreen";
import BlockedUsersScreen from "../screens/BlockedUsersScreen";
import HiddenPostsScreen from "../screens/HiddenPostsScreen";
import SwipeCardScreen from "../screens/SwipeCardScreen";
import MembershipStatusScreen from "../screens/MembershipStatusScreen";

const Stack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// ---------- Animated bottom tab bar ("bounce-lift") ----------
// Layout stays classic (icon on top, label always visible below). On every
// activation the icon does a one-shot kick: jumps up + scales up briefly, then
// settles at a small permanent lift so the active tab is still distinct at
// rest. Inspired by Instagram/Threads/ensports — motion lives on the icon, not
// in the layout.

type TabItemProps = {
  isFocused: boolean;
  iconSource: number;
  label: string;
  showBadge: boolean;
  onPress: () => void;
  onLongPress: () => void;
  accessibilityLabel?: string;
};

const TabItem = ({
  isFocused,
  iconSource,
  label,
  showBadge,
  onPress,
  onLongPress,
  accessibilityLabel,
}: TabItemProps) => {
  // Steady-state focus value (0 = unfocused, 1 = focused). Springs smoothly.
  const focus = useSharedValue(isFocused ? 1 : 0);
  // One-shot kick value (0 → 1 → 0). Pulses only when becoming focused.
  const kick = useSharedValue(0);
  const prevFocused = useRef(isFocused);

  useEffect(() => {
    focus.value = withSpring(isFocused ? 1 : 0, {
      damping: 16,
      stiffness: 200,
      mass: 1,
    });
    // Trigger the bounce only on the unfocused → focused transition so re-
    // renders (e.g., badge updates) don't make every active tab re-jump.
    if (isFocused && !prevFocused.current) {
      kick.value = withSequence(
        withTiming(1, { duration: 140 }),
        withSpring(0, { damping: 9, stiffness: 180 }),
      );
    }
    prevFocused.current = isFocused;
  }, [isFocused, focus, kick]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      // Steady lift -2pt when active + transient -6pt during the kick.
      { translateY: -2 * focus.value + -6 * kick.value },
      // Steady scale 1.06 when active + transient pop of +0.14 during kick.
      { scale: 1 + 0.06 * focus.value + 0.14 * kick.value },
    ],
  }));

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.75}
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingTop: 20,
        paddingBottom: 14,
      }}
    >
      <Animated.View style={[iconStyle, { position: "relative" }]}>
        <Image
          source={iconSource}
          style={{
            width: 22,
            height: 22,
            marginTop: -2,
            marginBottom: 4,
          }}
          resizeMode="contain"
          fadeDuration={0}
        />
        {showBadge && (
          <View
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: Colors.primary,
            }}
          />
        )}
      </Animated.View>
      <Text
        style={{
          fontSize: 10,
          fontWeight: "600",
          marginTop: 0,
          color: isFocused ? Colors.primary : Colors.gray[500],
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
};

const CustomTabBar = (props: BottomTabBarProps) => {
  const { insets } = props;
  const tabBarHeight = 65;
  const { hasNewConnections, hasNewMyPageNotification, hasNewMessages } = useNotifications();

  return (
    <View
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        paddingBottom: Math.max(insets.bottom * 0.5, 4),
        backgroundColor: "rgba(255,255,255,1)",
        borderTopWidth: 0,
        height: tabBarHeight + Math.max(insets.bottom * 0.5, 4),
        justifyContent: "center",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-around",
          height: tabBarHeight,
        }}
      >
        {props.state.routes.map((route, index) => {
          const { options } = props.descriptors[route.key];
          const isFocused = props.state.index === index;

          const onPress = () => {
            const event = props.navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              props.navigation.navigate(route.name);
            }
          };

          const onLongPress = () => {
            props.navigation.emit({
              type: "tabLongPress",
              target: route.key,
            });
          };

          let iconSource: number;
          let label: string;
          let showBadge = false;
          switch (route.name) {
            case "Home":
              iconSource = isFocused
                ? require("../../assets/images/Icons/Home-Fill.png")
                : require("../../assets/images/Icons/Home-Outline.png");
              label = "Feed";
              break;
            case "Search":
              iconSource = isFocused
                ? require("../../assets/images/Icons/Search-Fill.png")
                : require("../../assets/images/Icons/Search-Outline.png");
              label = "Discover";
              break;
            case "Connections":
              iconSource = isFocused
                ? require("../../assets/images/Icons/Users-Fill.png")
                : require("../../assets/images/Icons/Users-Outline.png");
              label = "Connections";
              showBadge = hasNewConnections;
              break;
            case "Messages":
              iconSource = isFocused
                ? require("../../assets/images/Icons/Message-Fill.png")
                : require("../../assets/images/Icons/Message-Outline.png");
              label = "Messages";
              showBadge = hasNewMessages;
              break;
            case "MyPage":
              iconSource = isFocused
                ? require("../../assets/images/Icons/Profile-Fill.png")
                : require("../../assets/images/Icons/Profile-Outline.png");
              label = "My Page";
              showBadge = hasNewMyPageNotification;
              break;
            default:
              return null;
          }

          return (
            <TabItem
              key={route.key}
              isFocused={isFocused}
              iconSource={iconSource}
              label={label}
              showBadge={showBadge}
              onPress={onPress}
              onLongPress={onLongPress}
              accessibilityLabel={options.tabBarAccessibilityLabel}
            />
          );
        })}
      </View>
    </View>
  );
};

const MainTabNavigator = () => {
  return (
    <Tab.Navigator
      initialRouteName="Search"
      tabBar={(props: BottomTabBarProps) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: "transparent",
          borderTopWidth: 0,
          elevation: 0,
          height: 0,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarLabel: "Feed" }}
      />
      <Tab.Screen
        name="Connections"
        component={ConnectionsScreen}
        options={{ tabBarLabel: "Connections" }}
      />
      <Tab.Screen
        name="Search"
        component={SearchScreen}
        options={{ tabBarLabel: "Discover" }}
      />
      <Tab.Screen
        name="Messages"
        component={MessagesScreen}
        options={{ tabBarLabel: "Messages" }}
      />
      <Tab.Screen
        name="MyPage"
        component={MyPageScreen}
        options={{ tabBarLabel: "My Page" }}
      />
    </Tab.Navigator>
  );
};

// Deep linking configuration — maps URLs to screens
// URL scheme: Golfmatch://  (configured in app.config.js)
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ["Golfmatch://", "golfmatch://"],
  config: {
    screens: {
      Main: {
        screens: {
          Home: "home",
          Search: "search",
          Connections: "connections",
          Messages: "messages",
          MyPage: "mypage",
        },
      },
      Chat: "chat/:chatId",
      Profile: "profile/:userId",
      Settings: "settings",
      NotificationHistory: "notifications",
      Store: "store",
    },
  },
};

const AppNavigatorContent = () => {
  const { user, loading, profileId, userProfile: cachedProfile } = useAuth();
  const { isProMember, isEntitlementResolved } = useRevenueCat();

  // Universal KYC gate: returning users who never completed Didit verification
  // are pushed through it before reaching Main. Without this, accounts created
  // before KYC was wired in (or any account where the verdict never landed) can
  // bypass the anti-bypass mechanism entirely.
  const needsKycGate = !!(cachedProfile && !cachedProfile.is_verified);

  // Gendered hard paywall (fail-secure): only an explicit "female" plus
  // verified KYC skips the paywall. Anything else — "male", "U" (Didit's
  // value for IDs without a sex field), null, "other" — gets gated until
  // a subscription is active. Females and premium males reach Main directly.
  const needsPaywallGate = !!(
    cachedProfile && cachedProfile.gender !== "female" && !isProMember
  );

  // Check for app updates when user is authenticated
  const {
    updateInfo,
    showPrompt,
    dismissPrompt,
    openStore,
  } = useAppUpdate({ enabled: !!user });

  // Fetch active announcements for authenticated users
  const { announcement, dismiss: dismissAnnouncement } = useAnnouncements({
    enabled: !!user,
  });

  const handleAnnouncementAction = useCallback(() => {
    if (announcement?.cta_screen) {
      navigationRef.current?.navigate(announcement.cta_screen as any);
    } else if (announcement?.cta_url) {
      Linking.openURL(announcement.cta_url);
    }
    dismissAnnouncement();
  }, [announcement, dismissAnnouncement]);

  const hasCheckedNewUser = useRef(false);
  const profileCheckPassed = useRef(false);
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList>>(null);
  const routeNameRef = useRef<string | undefined>(undefined);
  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isNewUser, setIsNewUser] = useState<boolean | null>(null); // null = checking, true = new, false = existing

  // Calculate profile completion percentage
  const calculateProfileCompletion = (profile: UserProfile | null): number => {
    if (!profile) return 0;
    
    // Placeholder values that should be treated as unfilled
    const PLACEHOLDER_VALUES = ['Not set', '未設定', '0', 0, '', null, undefined];
    
    const isFieldFilled = (field: any): boolean => {
      if (typeof field === 'boolean') return field;
      if (field === null || field === undefined) return false;
      
      const stringValue = field.toString().trim();
      
      // Check if it's a placeholder value
      if (PLACEHOLDER_VALUES.includes(stringValue) || PLACEHOLDER_VALUES.includes(field)) {
        return false;
      }
      
      // Check if it's an empty string
      if (stringValue === '') return false;
      
      // For numbers, check if it's 0 (which means not set)
      if (typeof field === 'number' && field === 0) return false;
      
      return true;
    };
    
    const fields = [
      // Basic info
      profile.basic?.name,
      profile.basic?.age,
      profile.basic?.gender,
      profile.basic?.prefecture,
      profile.basic?.blood_type,
      profile.basic?.height,
      profile.basic?.body_type,
      profile.basic?.smoking,
      
      // Golf info
      profile.golf?.skill_level,
      profile.golf?.experience,
      profile.golf?.average_score,
      profile.golf?.transportation,
      profile.golf?.available_days,
      
      // Bio and photos
      profile.bio,
      profile.profile_pictures?.length > 0,
    ];
    
    const filledFields = fields.filter(isFieldFilled).length;
    
    return Math.round((filledFields / fields.length) * 100);
  };

  // Check if cached profile is missing essential fields required for onboarding
  const isCachedProfileIncomplete = useCallback((): boolean => {
    if (!cachedProfile) return true;
    const hasGender = !!cachedProfile.gender;
    const hasPrefecture = !!cachedProfile.prefecture && cachedProfile.prefecture !== 'Not set' && cachedProfile.prefecture !== '未設定';
    const hasAge = !!cachedProfile.age && cachedProfile.age > 0;
    const hasPhoto = cachedProfile.profile_pictures && cachedProfile.profile_pictures.length > 0;
    return !hasGender || !hasPrefecture || !hasAge || !hasPhoto;
  }, [cachedProfile]);

  // Check if user is new and redirect to EditProfile
  const checkNewUserAndRedirect = useCallback(async () => {
    // Only check once when user becomes authenticated
    if (!user || hasCheckedNewUser.current || loading) {
      return;
    }

    // If user exists but profileId is null after retries, wait for it
    // Don't immediately assume new user - could be network issue
    if (user && !profileId) {
      // Clear any existing timeout
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
      }
      // Wait longer for profile fetch on slow connections
      // AuthContext already retries 3 times with delays, so profile should be available
      // If still null after extended wait, check cached profile before assuming existing user
      redirectTimeoutRef.current = setTimeout(() => {
        // Don't redirect if profile check has already passed
        if (profileCheckPassed.current) {
          return;
        }
        console.log('[AppNavigator] ProfileId still null after timeout, checking cached profile');
        hasCheckedNewUser.current = true;
        // If we have a cached profile with missing essential fields, treat as new user
        if (cachedProfile && isCachedProfileIncomplete()) {
          console.log('[AppNavigator] Cached profile incomplete, redirecting to EditProfile');
          setIsNewUser(true);
        } else {
          profileCheckPassed.current = true;
          setIsNewUser(false);
        }
      }, 5000); // Wait 5 seconds (AuthContext retries take up to 6 seconds total)
      return;
    }

    // profileId is now available - cancel any pending redirect timeout
    if (redirectTimeoutRef.current) {
      clearTimeout(redirectTimeoutRef.current);
      redirectTimeoutRef.current = null;
    }

    // If profileId is still null, don't proceed (shouldn't reach here after retries)
    if (!profileId) {
      return;
    }

    // Mark as checked to prevent multiple redirects
    hasCheckedNewUser.current = true;

    try {
      // Use cached profile from AuthContext if available, otherwise fetch
      let profile: UserProfile | null = null;
      if (cachedProfile) {
        // Convert User to UserProfile shape for compatibility
        profile = {
          basic: {
            name: cachedProfile.name,
            age: String(cachedProfile.age),
            gender: cachedProfile.gender,
            prefecture: cachedProfile.prefecture,
            blood_type: cachedProfile.blood_type || '',
            height: cachedProfile.height || '',
            body_type: cachedProfile.body_type || '',
            smoking: cachedProfile.smoking || '',
          },
          golf: {
            skill_level: cachedProfile.golf_skill_level || '',
            experience: cachedProfile.golf_experience || '',
            average_score: String(cachedProfile.average_score || ''),
            transportation: cachedProfile.transportation || '',
            available_days: cachedProfile.available_days || '',
          },
          bio: cachedProfile.bio || '',
          profile_pictures: cachedProfile.profile_pictures || [],
        } as UserProfile;
      } else {
        const response = await DataProvider.getUserProfile(profileId);
        if (response.success && response.data) {
          profile = response.data;
        } else if (!response.success) {
          // Check if it's a network error vs profile not found
          const errorMessage = response.error?.toLowerCase() || '';
          const isNetworkError = errorMessage.includes('network') ||
                                errorMessage.includes('timeout') ||
                                errorMessage.includes('fetch') ||
                                errorMessage.includes('connection');

          if (isNetworkError) {
            // Network error: check cached profile instead of blindly assuming existing user
            if (cachedProfile && isCachedProfileIncomplete()) {
              console.log('[AppNavigator] Network error but cached profile incomplete, redirecting to EditProfile');
              setIsNewUser(true);
            } else {
              console.log('[AppNavigator] Network error, assuming existing user');
              profileCheckPassed.current = true;
              setIsNewUser(false);
            }
          } else {
            setIsNewUser(true);
          }
          return;
        }
      }

      if (profile) {
        // Check if user has filled essential fields required for profile visibility
        // Essential fields: gender, birth_date/age, prefecture, and at least 1 profile picture
        const hasGender = !!profile.basic?.gender;
        const hasAge = !!profile.basic?.age && parseInt(profile.basic.age.toString()) > 0;
        const hasPrefecture = !!profile.basic?.prefecture && profile.basic.prefecture !== 'Not set' && profile.basic.prefecture !== '未設定';
        const hasPhoto = profile.profile_pictures && profile.profile_pictures.length > 0;

        const hasEssentialFields = hasGender && hasAge && hasPrefecture && hasPhoto;

        // Redirect to EditProfile if essential fields are missing
        // This ensures users always complete onboarding even if previous checks failed
        if (!hasEssentialFields) {
          setIsNewUser(true);
        } else {
          // Mark profile check as passed to prevent other redirects
          profileCheckPassed.current = true;
          setIsNewUser(false);
        }
      }
    } catch (error) {
      console.error("Error checking new user profile:", error);
      // On error, check cached profile instead of blindly assuming existing user
      if (cachedProfile && isCachedProfileIncomplete()) {
        console.log('[AppNavigator] Error but cached profile incomplete, redirecting to EditProfile');
        setIsNewUser(true);
      } else {
        profileCheckPassed.current = true;
        setIsNewUser(false);
      }
    }
  }, [user, profileId, loading, cachedProfile, isCachedProfileIncomplete]);

  useEffect(() => {
    checkNewUserAndRedirect();
  }, [checkNewUserAndRedirect]);

  // Reset check flags when user logs out
  useEffect(() => {
    if (!user) {
      hasCheckedNewUser.current = false;
      profileCheckPassed.current = false;
      setIsNewUser(null); // Reset to checking state
      // Clear any pending redirect timeout
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
        redirectTimeoutRef.current = null;
      }
    }
  }, [user]);

  // Handle navigation ready event - check profile when navigation is ready
  const handleNavigationReady = useCallback(() => {
    // Capture the initial route for Firebase screen tracking
    routeNameRef.current = navigationRef.current?.getCurrentRoute()?.name;
    checkNewUserAndRedirect();
  }, [checkNewUserAndRedirect]);

  // Firebase screen tracking on navigation state change
  const handleNavigationStateChange = useCallback(() => {
    const previousRouteName = routeNameRef.current;
    const currentRouteName = navigationRef.current?.getCurrentRoute()?.name;

    if (currentRouteName && previousRouteName !== currentRouteName) {
      logScreenView(currentRouteName);
    }
    routeNameRef.current = currentRouteName;
  }, []);

  if (loading) {
    return null; // Will show loading screen from AuthProvider
  }

  // Show loading while checking if user is new (only for authenticated users)
  if (user && isNewUser === null) {
    return null; // Will show loading screen while checking profile
  }

  // Wait for RevenueCat to resolve entitlement before deciding which gated
  // stack to render. isProMember defaults to false until updateCustomerState
  // runs; without this gate, non-female returning users see a one-frame
  // paywall before the navigator swaps to Main.
  if (user && !isEntitlementResolved) {
    return null;
  }

  // Wait for cachedProfile before letting the navigator decide which gated
  // stack to render. The gates below (needsKycGate, needsPaywallGate) read
  // cachedProfile.is_verified and cachedProfile.gender — if we render
  // while cachedProfile is null, BOTH gates evaluate to false and the
  // navigator briefly mounts the Main stack. When cachedProfile arrives
  // a beat later, gates re-evaluate and the navigator swaps stacks (e.g.
  // a non-premium male sees Main flash then gets redirected to the
  // OnboardingPaywall stack). Holding render until cachedProfile is
  // loaded eliminates that double-mount. If profile fetch fails terminally,
  // AuthContext signs the user out (see AuthContext.tsx fetchProfileWithRetry),
  // so this guard can't deadlock.
  if (user && profileId && !cachedProfile) {
    return null;
  }

  return (
    <NavigationContainer ref={navigationRef} linking={linking} onReady={handleNavigationReady} onStateChange={handleNavigationStateChange}>
      <NotificationProvider>
          <MatchProvider>
            <Stack.Navigator screenOptions={{
              headerShown: false,
              gestureEnabled: true,
              gestureDirection: "horizontal",
              cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
              cardStyle: { backgroundColor: Colors.background },
            }}>
            {user ? (
            <>
              {/* New users start in the onboarding wizard; existing users land on Main. */}
              {isNewUser ? (
                <>
                  {/*
                    Onboarding flow with Didit KYC (gender + birth_date come
                    from the verified government ID, so the Gender + Birthdate
                    self-entry screens are skipped). Order:
                      Name → State → Photo → KYC → (males) Paywall → Done
                                                  (females) → Done
                  */}
                  <Stack.Screen name="OnboardingName" component={OnboardingNameScreen} options={{ headerShown: false, gestureEnabled: false }} />
                  <Stack.Screen name="OnboardingState" component={OnboardingStateScreen} options={{ headerShown: false }} />
                  <Stack.Screen name="OnboardingPhoto" component={OnboardingPhotoScreen} options={{ headerShown: false }} />
                  <Stack.Screen name="OnboardingKyc" component={OnboardingKycScreen} options={{ headerShown: false, gestureEnabled: false }} />
                  <Stack.Screen name="OnboardingPaywall" component={OnboardingPaywallScreen} options={{ headerShown: false, gestureEnabled: false }} />
                  {/* Gender + Birthdate screens still registered for backwards-compat /
                      deep links; not on the linear onboarding path. */}
                  <Stack.Screen name="OnboardingGender" component={OnboardingGenderScreen} options={{ headerShown: false }} />
                  <Stack.Screen name="OnboardingBirthdate" component={OnboardingBirthdateScreen} options={{ headerShown: false }} />
                  <Stack.Screen name="Main" component={MainTabNavigator} />
                  <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ headerShown: false }} />
                </>
              ) : needsKycGate ? (
                <>
                  {/* Returning user who never completed KYC — push them
                      through it before they can reach Main / Paywall.
                      OnboardingKycScreen routes onward based on the verified
                      gender, so paywall gating still applies for males. */}
                  <Stack.Screen name="OnboardingKyc" component={OnboardingKycScreen} options={{ headerShown: false, gestureEnabled: false }} />
                  <Stack.Screen name="OnboardingPaywall" component={OnboardingPaywallScreen} options={{ headerShown: false, gestureEnabled: false }} />
                  <Stack.Screen name="Main" component={MainTabNavigator} />
                  <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ headerShown: false }} />
                </>
              ) : needsPaywallGate ? (
                <>
                  {/* Returning male user without an active subscription —
                      gated by RevenueCat's prebuilt Paywall (configured in
                      RC dashboard) before reaching Main. */}
                  <Stack.Screen name="OnboardingPaywall" component={OnboardingPaywallScreen} options={{ headerShown: false, gestureEnabled: false }} />
                  <Stack.Screen name="Main" component={MainTabNavigator} />
                  <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ headerShown: false }} />
                </>
              ) : (
                <>
                  <Stack.Screen name="Main" component={MainTabNavigator} />
                  <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ headerShown: false }} />
                </>
              )}
            <Stack.Screen
              name="Chat"
              component={ChatScreen}
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="Profile"
              component={UserProfileScreen}
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="Settings"
              component={SettingsScreen}
              options={{
                headerShown: false, // Custom header in component
              }}
            />
            <Stack.Screen
              name="NotificationSettings"
              component={NotificationSettingsScreen}
              options={{
                headerShown: false, // Custom header in component
              }}
            />
            <Stack.Screen
              name="NotificationHistory"
              component={NotificationHistoryScreen}
              options={{
                headerShown: false, // Custom header in component
              }}
            />
            <Stack.Screen
              name="CalendarEdit"
              component={CalendarEditScreen}
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="KycVerification"
              component={KycVerificationScreen}
              options={{
                headerShown: false, // Custom header in component
              }}
            />
            <Stack.Screen
              name="TestAccountSetup"
              component={TestAccountSetupScreen}
              options={{
                headerShown: true,
                headerTitle: "Test Account Setup",
                headerStyle: { backgroundColor: Colors.primary },
                headerTintColor: Colors.white,
              }}
            />
            <Stack.Screen
              name="UserPosts"
              component={UserPostsScreen}
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="Footprints"
              component={FootprintsScreen}
              options={{
                headerShown: false, // Custom header in component
              }}
            />
            <Stack.Screen
              name="PastLikes"
              component={PastLikesScreen}
              options={{
                headerShown: false, // Custom header in component
              }}
            />
            <Stack.Screen
              name="ContactReply"
              component={ContactReplyScreen}
              options={{
                headerShown: false, // Custom header in component
              }}
            />
            <Stack.Screen
              name="Store"
              component={StoreScreen}
              options={{
                headerShown: false, // Custom header in component
              }}
            />
            <Stack.Screen
              name="MembershipStatus"
              component={MembershipStatusScreen}
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="Help"
              component={HelpScreen}
              options={{
                headerShown: false, // Custom header in component
              }}
            />
            <Stack.Screen
              name="HelpDetail"
              component={HelpDetailScreen}
              options={{
                headerShown: false, // Custom header in component
              }}
            />
            <Stack.Screen
              name="DeleteAccount"
              component={DeleteAccountScreen}
              options={{
                headerShown: false, // Custom header in component
              }}
            />
            <Stack.Screen
              name="AccountLinking"
              component={AccountLinkingScreen}
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="Report"
              component={ReportScreen}
              options={{
                headerShown: false, // Custom header in component
                gestureEnabled: true,
                gestureDirection: "vertical",
              }}
            />
            <Stack.Screen
              name="BlockedUsers"
              component={BlockedUsersScreen}
              options={{
                headerShown: false, // Custom header in component
              }}
            />
            <Stack.Screen
              name="HiddenPosts"
              component={HiddenPostsScreen}
              options={{
                headerShown: false, // Custom header in component
              }}
            />
            <Stack.Screen
              name="SwipeCard"
              component={SwipeCardScreen}
              options={{
                headerShown: false,
                gestureEnabled: false, // Prevent back swipe conflicting with card swipe
              }}
            />
          </>
          ) : (
            <>
              <Stack.Screen
                name="Welcome"
                component={WelcomeScreen}
                options={{
                  headerShown: false,
                }}
              />
              <Stack.Screen
                name="Auth"
                component={AuthScreen}
                options={{
                  headerShown: false,
                  gestureEnabled: true,
                  gestureDirection: "horizontal",
                  cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
                }}
              />
            </>
          )}
        </Stack.Navigator>
          </MatchProvider>

          {/* Update Prompt Modal */}
          {updateInfo && (
            <UpdatePromptModal
              visible={showPrompt}
              title={updateInfo.message.title}
              body={updateInfo.message.body}
              buttonText={updateInfo.message.button_text}
              dismissText={updateInfo.message.dismiss_text}
              currentVersion={updateInfo.currentVersion}
              latestVersion={updateInfo.latestVersion}
              isForced={updateInfo.isForced}
              onUpdate={openStore}
              onDismiss={dismissPrompt}
            />
          )}

          {/* Announcement Modal — hidden while update modal is active */}
          {announcement && !showPrompt && (
            <AnnouncementModal
              visible={!!announcement}
              announcement={announcement}
              onAction={handleAnnouncementAction}
              onDismiss={dismissAnnouncement}
            />
          )}
        </NotificationProvider>
    </NavigationContainer>
  );
};

const AppNavigator = ({ onReady }: { onReady?: () => void }) => {
  const [isNavigationReady, setIsNavigationReady] = React.useState(false);

  const handleNavigationReady = useCallback(() => {
    setIsNavigationReady(true);
    onReady?.();
  }, [onReady]);

  return (
    <ErrorBoundary>
      <AuthProvider>
        <RevenueCatProvider>
          <View style={{ flex: 1 }} onLayout={isNavigationReady ? undefined : handleNavigationReady}>
            <AppNavigatorContent />
          </View>
        </RevenueCatProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
};

export default AppNavigator;
