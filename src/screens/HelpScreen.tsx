import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { RootStackParamList } from "../types";
import { Ionicons } from "@expo/vector-icons";
import StandardHeader from "../components/StandardHeader";
import { Colors } from "../constants/colors";
import { Spacing, BorderRadius } from "../constants/spacing";
import { Typography } from "../constants/typography";

type HelpScreenNavigationProp = StackNavigationProp<RootStackParamList, "Help">;

interface HelpCategory {
  id: string;
  title: string;
  items: HelpItem[];
}

interface HelpItem {
  id: string;
  title: string;
}

const helpCategories: HelpCategory[] = [
  {
    id: "profile",
    title: "Profile",
    items: [
      { id: "profile-setup", title: "Set up or edit your profile" },
      { id: "main-photo", title: "Set or change your main photo" },
      { id: "sub-photo", title: "Set or change additional photos" },
      { id: "photo-permission", title: "Photo access permissions" },
    ],
  },
  {
    id: "likes",
    title: "Likes & Matches",
    items: [
      { id: "like-send", title: "How to send a Like" },
      { id: "like-receive", title: "How to view Likes you've received" },
      { id: "like-match", title: "What is a Match?" },
      { id: "like-history", title: "View Likes you've sent" },
    ],
  },
  {
    id: "messages",
    title: "Messages",
    items: [
      { id: "message-send", title: "How to send a message" },
      { id: "message-read", title: "How to read messages" },
      { id: "message-notification", title: "Message notification settings" },
      { id: "message-block", title: "How to block a user" },
    ],
  },
  {
    id: "posts",
    title: "Posts",
    items: [
      { id: "post-create", title: "How to create a post" },
      { id: "post-media", title: "Adding photos and videos" },
      { id: "post-react", title: "Reacting to posts" },
      { id: "post-delete", title: "How to delete a post" },
    ],
  },
  {
    id: "features",
    title: "Features",
    items: [
      { id: "search-feature", title: "Using Search" },
      { id: "filter-feature", title: "About filters" },
      { id: "calendar-feature", title: "Using the calendar" },
      { id: "connections-feature", title: "About Connections" },
      { id: "footprints-feature", title: "About Profile Views" },
    ],
  },
  {
    id: "membership",
    title: "Membership",
    items: [
      { id: "membership-benefits", title: "Membership benefits" },
      { id: "membership-purchase", title: "How to subscribe" },
      { id: "membership-cancel", title: "How to cancel your subscription" },
      { id: "membership-restore", title: "Restore purchases" },
    ],
  },
  {
    id: "kyc-verification",
    title: "Identity Verification",
    items: [
      { id: "kyc-process", title: "How identity verification works" },
      { id: "kyc-documents", title: "Accepted ID documents" },
      { id: "kyc-required", title: "Why we verify identity" },
      { id: "kyc-failed", title: "If verification fails" },
    ],
  },
  {
    id: "safety-moderation",
    title: "Safety & Moderation",
    items: [
      { id: "moderation-overview", title: "How we moderate posts" },
      { id: "moderation-guidelines", title: "Community guidelines" },
      { id: "moderation-action", title: "How we handle violations" },
    ],
  },
  {
    id: "reporting",
    title: "Reporting & Blocking",
    items: [
      { id: "report-user", title: "How to report a user" },
      { id: "report-reason", title: "Choosing a report reason" },
      { id: "block-user", title: "How to block a user" },
      { id: "hidden-posts", title: "How to hide a post" },
      { id: "report-safety", title: "Staying safe on GolfMatch" },
    ],
  },
  {
    id: "withdrawal",
    title: "Delete Account",
    items: [
      { id: "withdrawal-process", title: "How to delete your account" },
      { id: "withdrawal-data", title: "What happens to your data" },
    ],
  },
  {
    id: "bugs",
    title: "Troubleshooting",
    items: [
      { id: "bug-report", title: "Report a bug" },
      { id: "bug-common", title: "Common issues and fixes" },
      { id: "bug-app-update", title: "How to update the app" },
    ],
  },
  {
    id: "other",
    title: "Other",
    items: [
      { id: "privacy-policy", title: "Privacy Policy" },
      { id: "terms-of-service", title: "Terms of Service" },
      { id: "contact-support", title: "Contact Support" },
    ],
  },
];

const HelpScreen: React.FC = () => {
  const navigation = useNavigation<HelpScreenNavigationProp>();
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set()
  );

  const toggleCategory = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
  };

  const handleItemPress = (itemId: string) => {
    navigation.navigate("HelpDetail", { itemId });
  };

  const handleContactPress = () => {
    navigation.navigate("ContactReply");
  };

  return (
    <SafeAreaView style={styles.container}>
      <StandardHeader
        title="Help & Contact"
        showBackButton
        onBackPress={() => navigation.goBack()}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {helpCategories.map((category) => {
          const isExpanded = expandedCategories.has(category.id);

          return (
            <View key={category.id} style={styles.categoryContainer}>
              <TouchableOpacity
                style={styles.categoryHeader}
                onPress={() => toggleCategory(category.id)}
                activeOpacity={0.7}
              >
                <Text style={styles.categoryTitle}>{category.title}</Text>
                <Ionicons
                  name={isExpanded ? "chevron-up" : "chevron-down"}
                  size={20}
                  color={Colors.gray[600]}
                />
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.itemsContainer}>
                  {category.items.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.itemRow}
                      onPress={() => handleItemPress(item.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.itemText}>{item.title}</Text>
                      <Ionicons
                        name="chevron-forward"
                        size={16}
                        color={Colors.primary}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        <View style={styles.contactSection}>
          <Text style={styles.contactText}>Still need help?</Text>
          <TouchableOpacity
            style={styles.contactButton}
            onPress={handleContactPress}
            activeOpacity={0.8}
          >
            <Text style={styles.contactButtonText}>Contact Us</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.xl,
  },
  categoryContainer: {
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  categoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  categoryTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
    color: Colors.text.primary,
  },
  itemsContainer: {
    backgroundColor: Colors.gray[50],
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  itemText: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.primary,
    marginRight: Spacing.sm,
  },
  contactSection: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
    alignItems: "center",
  },
  contactText: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    marginBottom: Spacing.md,
    textAlign: "center",
  },
  contactButton: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  contactButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.white,
  },
});

export default HelpScreen;








