import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { Colors } from "../constants/colors";
import { Spacing, BorderRadius } from "../constants/spacing";
import { Typography } from "../constants/typography";
import { RootStackParamList } from "../types";
import { useAuth } from "../contexts/AuthContext";
import StandardHeader from "../components/StandardHeader";

type SettingsScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  "Settings"
>;

type IconName = keyof typeof Ionicons.glyphMap;

interface SettingItem {
  id: string;
  title: string;
  subtitle: string;
  icon: IconName;
  onPress: () => void;
  danger?: boolean;
}

function SettingsScreen(): React.ReactElement {
  const navigation = useNavigation<SettingsScreenNavigationProp>();
  const { signOut } = useAuth();

  async function handleSignOut(): Promise<void> {
    const result = await signOut();
    if (!result.success) {
      console.error("Sign out error:", result.error);
    }
  }

  const settingsItems: SettingItem[] = [
    {
      id: "accountLinking",
      title: "Linked Accounts",
      subtitle: "Manage email and social sign-in connections",
      icon: "link",
      onPress: () => navigation.navigate("AccountLinking"),
    },
    {
      id: "notifications",
      title: "Notification Settings",
      subtitle: "Manage push notifications",
      icon: "notifications",
      onPress: () => navigation.navigate("NotificationSettings"),
    },
    {
      // Apple Guideline 3.1.2 requires a discoverable way to manage / cancel
      // an auto-renewing subscription. Routes to MembershipStatusScreen which
      // opens Apple's manage-subscription URL.
      id: "subscription",
      title: "Manage Subscription",
      subtitle: "View, restore, or cancel your subscription",
      icon: "card",
      onPress: () => navigation.navigate("MembershipStatus"),
    },
    {
      id: "blocked",
      title: "Blocked Users",
      subtitle: "Manage users you've blocked",
      icon: "ban",
      onPress: () => navigation.navigate("BlockedUsers"),
    },
    {
      id: "hidden",
      title: "Hidden Posts",
      subtitle: "Manage posts you've hidden",
      icon: "eye-off",
      onPress: () => navigation.navigate("HiddenPosts"),
    },
    {
      id: "about",
      title: "About",
      subtitle: "https://dating.golfmatch.info/",
      icon: "information-circle",
      onPress: () => Linking.openURL("https://dating.golfmatch.info/"),
    },
    {
      id: "delete",
      title: "Delete Account",
      subtitle: "Permanently delete your account and data",
      icon: "trash",
      onPress: () => navigation.navigate("DeleteAccount"),
      danger: true,
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StandardHeader
        title="Settings"
        showBackButton={true}
        onBackPress={() => navigation.goBack()}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >

        <View style={styles.section}>
          {settingsItems.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.settingItem,
                item.danger && styles.settingItemDanger,
              ]}
              onPress={item.onPress}
            >
              <View style={styles.settingItemLeft}>
                <View style={[
                  styles.iconContainer,
                  item.danger && styles.iconContainerDanger,
                ]}>
                  <Ionicons
                    name={item.icon}
                    size={24}
                    color={item.danger ? Colors.error : Colors.primary}
                  />
                </View>
                <View style={styles.settingItemText}>
                  <Text style={[
                    styles.settingItemTitle,
                    item.danger && styles.settingItemTitleDanger,
                  ]}>{item.title}</Text>
                  <Text style={styles.settingItemSubtitle}>
                    {item.subtitle}
                  </Text>
                </View>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={item.danger ? Colors.error : Colors.gray[400]}
              />
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.section}>
          <TouchableOpacity
            style={styles.signOutButton}
            onPress={handleSignOut}
          >
            <Ionicons name="log-out" size={24} color={Colors.error} />
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  settingItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary + "10",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  settingItemText: {
    flex: 1,
  },
  settingItemTitle: {
    fontSize: 16,
    fontWeight: "600",
    fontFamily: Typography.getFontFamily("600"),
    color: Colors.text.primary,
    marginBottom: 2,
  },
  settingItemSubtitle: {
    fontSize: 14,
    color: Colors.text.secondary,
  },
  settingItemDanger: {
    borderColor: Colors.error + "30",
  },
  settingItemTitleDanger: {
    color: Colors.error,
  },
  iconContainerDanger: {
    backgroundColor: Colors.error + "15",
  },
  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.error,
    gap: Spacing.sm,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: "600",
    fontFamily: Typography.getFontFamily("600"),
    color: Colors.error,
  },
});

export default SettingsScreen;
