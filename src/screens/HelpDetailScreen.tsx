import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { RouteProp } from "@react-navigation/native";
import { RootStackParamList } from "../types";
import StandardHeader from "../components/StandardHeader";
import { Colors } from "../constants/colors";
import { Spacing, BorderRadius } from "../constants/spacing";
import { Typography } from "../constants/typography";

type HelpDetailScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  "HelpDetail"
>;
type HelpDetailScreenRouteProp = RouteProp<RootStackParamList, "HelpDetail">;

interface HelpDetail {
  id: string;
  title: string;
  description: string;
  steps?: string[];
  additionalInfo?: string;
  link?: string;
}

const helpDetails: Record<string, HelpDetail> = {
  // Profile
  "profile-setup": {
    id: "profile-setup",
    title: "Set Up or Edit Your Profile",
    description:
      "Your GolfMatch profile is visible to everyone in the community. The more complete your profile, the better your match rate.",
    steps: [
      "Tap My Page in the bottom menu",
      "Tap the edit icon in the top right",
      "Fill in your basic info (name, age, gender, state, etc.)",
      "Add your golf info (skill level, average score, years playing, etc.)",
      "Write a short bio and save",
    ],
    additionalInfo: "Your profile completion percentage is shown on screen and goes up as you fill in more fields.",
  },
  "main-photo": {
    id: "main-photo",
    title: "Set or Change Your Main Photo",
    description:
      "Your main photo is the first thing other users see. Pick a clear, bright photo of your face.",
    steps: [
      "Tap the edit icon on My Page",
      "Open the profile editor",
      "Tap the main photo area",
      "Choose Take Photo or Choose from Library",
      "Review and save",
    ],
    additionalInfo:
      "We recommend a photo where your face is clearly visible.",
  },
  "sub-photo": {
    id: "sub-photo",
    title: "Add or Change Sub Photos",
    description:
      "Add more photos to show off who you are. Golf shots, hobbies, and lifestyle photos all work great.",
    steps: [
      "Open the profile editor",
      "Tap the + in the sub-photos section",
      "Take a photo or choose one from your library",
      "Save",
    ],
  },
  "photo-permission": {
    id: "photo-permission",
    title: "Photo Library Access",
    description:
      "We need access to your device's photo library to set photos.",
    steps: [
      "Open the Settings app on your device",
      "Go to Privacy > Photos",
      "Find GolfMatch",
      "Allow access to All Photos",
    ],
    additionalInfo:
      "If you previously denied access, you can change it from your device's settings.",
  },

  // Likes & Matching
  "like-send": {
    id: "like-send",
    title: "Send a Like",
    description:
      "Send a Like to anyone who catches your eye to start a potential match.",
    steps: [
      "Tap the Search tab at the bottom",
      "Go to the Swipe tab for card-style discovery — swipe right to Like, left to Pass",
      "Or go to the Search tab, tap any profile to open it, and tap the heart icon",
    ],
    additionalInfo: "When they Like you back, you've got a Match.",
  },
  "like-receive": {
    id: "like-receive",
    title: "See Who Liked You",
    description:
      "Likes you've received show up in the Connections tab.",
    steps: [
      "Tap the Connections tab at the bottom",
      "Switch to the Likes tab",
      "Browse the list of people who liked you",
      "Like them back to create a Match",
    ],
  },
  "like-match": {
    id: "like-match",
    title: "What is a Match?",
    description:
      "A Match happens when two users Like each other. Once you've matched, you can start messaging.",
    steps: [
      "You send a Like to someone",
      "They send a Like back",
      "It's a Match!",
      "Open Messages to start a conversation",
    ],
    additionalInfo:
      "You'll get a notification when you Match. Male users need a Premium membership to send messages.",
  },
  "like-history": {
    id: "like-history",
    title: "View Likes You've Sent",
    description:
      "You can review every Like you've sent.",
    steps: [
      "Tap My Page at the bottom",
      "Tap Likes Sent",
      "Browse all the Likes you've sent",
    ],
  },

  // Posts
  "post-create": {
    id: "post-create",
    title: "Create a Post",
    description:
      "Create posts from the Home screen. You'll need to complete identity verification first.",
    steps: [
      "Tap the + button in the top right of Home",
      "Write your post text",
      "Optionally add photos or video",
      "Tap Post",
    ],
    additionalInfo: "You need to finish identity verification before you can post.",
  },
  "post-media": {
    id: "post-media",
    title: "Add Photos or Video",
    description:
      "Bring your posts to life with photos and video from your golf life.",
    steps: [
      "Tap the photo/video icon in the post composer",
      "Pick a photo or video from your library",
      "For photos: choose an aspect ratio and crop",
      "For video: trim if needed (max 60 seconds)",
      "Publish your post",
    ],
    additionalInfo: "You can attach multiple photos. Videos are limited to one per post.",
  },
  "post-react": {
    id: "post-react",
    title: "React to a Post",
    description:
      "Send a reaction (Like) on other users' posts.",
    steps: [
      "Find the post on your Home feed",
      "Tap the reaction button (👍)",
      "Your reaction is sent",
    ],
    additionalInfo: "The post's author will get a notification.",
  },
  "post-delete": {
    id: "post-delete",
    title: "Delete Your Post",
    description:
      "You can delete your own posts. Deleted posts cannot be recovered.",
    steps: [
      "Open the post you want to delete",
      "Tap the menu (...) in the top right",
      "Choose Delete Post",
      "Confirm to delete",
    ],
  },

  // Messages
  "message-send": {
    id: "message-send",
    title: "Send a Message",
    description:
      "Message anyone you've Matched with. Male users need a Premium membership to send messages.",
    steps: [
      "Tap the Messages tab at the bottom",
      "Choose the person you want to chat with",
      "Type your message and tap Send",
      "You can also send images, videos, and emoji",
    ],
    additionalInfo: "Videos are auto-compressed before sending. Quick emoji reactions and pre-filled opening messages are available to help break the ice.",
  },
  "message-read": {
    id: "message-read",
    title: "Read New Messages",
    description:
      "You'll see new messages via push notifications and inside the app.",
    steps: [
      "Tap the Messages tab at the bottom",
      "Conversations with unread messages show an 'Unreplied' badge",
      "Tap a conversation to read",
      "Read receipts show when the other person has seen your message",
    ],
  },
  "message-notification": {
    id: "message-notification",
    title: "Message Notification Settings",
    description:
      "You can turn message notifications on or off in Settings.",
    steps: [
      "Open Settings from My Page",
      "Tap Notifications",
      "Toggle Messages on or off",
    ],
  },
  "message-block": {
    id: "message-block",
    title: "Block a User",
    description:
      "Block users to stop seeing their content and prevent them from contacting you.",
    steps: [
      "Open the user's profile",
      "Tap the menu (...) in the top right",
      "Choose Block",
      "Confirm",
    ],
    additionalInfo:
      "Manage your blocked users from Settings > Blocked List.",
  },

  // Features
  "search-feature": {
    id: "search-feature",
    title: "Using Search",
    description:
      "Find your ideal golf partner from the Search screen. GolfMatch uses an intelligent matching algorithm to surface the people most compatible with you.",
    steps: [
      "Tap the Search tab at the bottom",
      "Swipe tab: card-style discovery — swipe right to Like, swipe left to Pass",
      "Search tab: browse a grid of profiles; use Sort and Filter to narrow results",
      "Tap a profile to see details",
      "Send a Like if you're interested",
    ],
    additionalInfo:
      "How the Recommended sort works\nIn the Search tab, sorting by Recommended ranks users using six factors:\n\n1. Calendar overlap (30 pts)\nUsers whose available days line up with yours over the next 30 days. Higher score means you're more likely to actually play together.\n\n2. Skill compatibility (25 pts)\nUsers at a similar skill level (Beginner, Intermediate, Advanced, Pro). Closer levels make for a better round.\n\n3. Score similarity (20 pts)\nSimilar average scores rank highest, especially within 5 strokes.\n\n4. Location (15 pts)\nUsers in the same or nearby states.\n\n5. Activity (10 pts)\nRecently active users rank higher, with the highest scores for those active in the last 24 hours.\n\n6. Profile completeness (10 pts)\nUsers with 3+ photos, a thoughtful bio, and verified status rank higher.\n\nTotal scores determine the order.\n\nGet better matches\nSet your available days in the Calendar to match with more compatible people. Tap Calendar from My Page.\n\nFilters\nUse filters to narrow down who you see:\n- Age range\n- State\n- Skill level\n- Average score\n- Last active",
  },
  "filter-feature": {
    id: "filter-feature",
    title: "Using Filters",
    description:
      "Set detailed filters to find people who fit what you're looking for.",
    steps: [
      "Tap the filter icon on the Search screen",
      "Set conditions like age, location, and skill level",
      "Tap Apply",
    ],
    additionalInfo: "Your filters are saved between sessions.",
  },
  "calendar-feature": {
    id: "calendar-feature",
    title: "Using the Calendar",
    description:
      "Use the calendar to share when you can play golf. Setting your availability helps you match with more compatible people.",
    steps: [
      "Tap Calendar from My Page",
      "Tap a date to cycle through statuses",
      "Green (○): available for golf",
      "Red (×): unavailable",
      "Gray (−): not set",
      "Tap Save in the top right",
    ],
    additionalInfo: "Each tap cycles a date through Available → Unavailable → Not Set. Swipe left or right to change months.",
  },
  "connections-feature": {
    id: "connections-feature",
    title: "Connections",
    description:
      "The Connections tab shows everyone who liked you and everyone you've matched with.",
    steps: [
      "Tap the Connections tab at the bottom",
      "Likes tab: people who Liked you",
      "Matches tab: people you've matched with",
    ],
  },
  "footprints-feature": {
    id: "footprints-feature",
    title: "Profile Visitors",
    description:
      "See who has viewed your profile.",
    steps: [
      "Tap Visitors from My Page",
      "Browse the list of people who viewed your profile",
      "Tap any of them to see their profile",
    ],
  },

  // Membership
  "membership-benefits": {
    id: "membership-benefits",
    title: "Premium Benefits",
    description:
      "Your monthly subscription includes the features below.",
    steps: [
      "Featured placement — your profile is featured in daily recommendations and search results across the app",
      "Direct messaging — send messages to anyone you've matched with",
      "Daily curated picks — a fresh batch of hand-picked compatible golfers delivered every day",
    ],
    additionalInfo:
      "Subscriptions are billed through the App Store or Google Play and auto-renew monthly. Cancel anytime from your device's subscription settings.",
  },
  "membership-purchase": {
    id: "membership-purchase",
    title: "Subscribe to Premium",
    description:
      "Start a subscription from the Manage Subscription page in Settings.",
    steps: [
      "Tap Settings from My Page",
      "Tap Manage Subscription",
      "Tap Become a Premium Member",
      "Review what's included",
      "Complete payment via the App Store or Google Play",
    ],
  },
  "membership-cancel": {
    id: "membership-cancel",
    title: "Cancel Premium",
    description:
      "Cancel your Premium membership from your device's settings.",
    steps: [
      "iOS: Settings > Apple ID > Subscriptions",
      "Android: Google Play > Menu > Subscriptions",
      "Find GolfMatch",
      "Tap Cancel Subscription",
    ],
    additionalInfo: "After cancelling, you'll keep Premium features until your current billing period ends.",
  },
  "membership-restore": {
    id: "membership-restore",
    title: "Restore a Purchase",
    description:
      "If you switched devices and your subscription isn't showing up, restore your purchase.",
    steps: [
      "Tap Settings from My Page",
      "Tap Manage Subscription",
      "Tap Become a Premium Member to open the Store",
      "Tap Restore Purchases at the bottom",
      "Sign in with your Apple ID or Google account",
      "Your purchase will be restored",
    ],
  },

  // Identity Verification
  "kyc-process": {
    id: "kyc-process",
    title: "Identity Verification Steps",
    description:
      "Identity verification is part of signing up. You can't use GolfMatch until verification is complete — we'll guide you through it automatically.",
    steps: [
      "After you finish entering your basic profile during signup, you'll be taken to the verification step",
      "Tap Start Verification — a secure verification page opens",
      "Scan a government-issued ID when prompted",
      "Take a short selfie video for a liveness check",
      "Return to GolfMatch and wait for the result",
    ],
    additionalInfo:
      "Most results come back within a few minutes. Complex cases can take up to 24 hours. If your status ever needs to be refreshed, you can re-verify from Settings → Manage Subscription → Identity Verification.",
  },
  "kyc-documents": {
    id: "kyc-documents",
    title: "Accepted ID Documents",
    description:
      "Verification accepts most government-issued photo IDs.",
    steps: [
      "Driver's License",
      "State ID Card",
      "Passport",
    ],
    additionalInfo:
      "Your document must be unexpired and show clear, glare-free photos of both sides where applicable.",
  },
  "kyc-required": {
    id: "kyc-required",
    title: "Why We Require Verification",
    description:
      "We verify identities to keep the community safe. Verified users earn more trust and tend to get more matches.",
  },
  "kyc-failed": {
    id: "kyc-failed",
    title: "If Verification Fails",
    description:
      "If your verification was rejected, you can retry. Most failures are fixed with a clearer scan in better lighting.",
    steps: [
      "Use a well-lit area when scanning your ID and recording the selfie",
      "Make sure all corners of your ID are visible and free of glare",
      "Use an unexpired government-issued ID",
      "Hold the ID steady and follow the on-screen prompts carefully",
      "After two failed attempts, a manual review option becomes available",
      "If issues continue, contact support and we'll help you through it",
    ],
  },

  // Reports & Blocks
  "report-user": {
    id: "report-user",
    title: "Report a User",
    description:
      "Report users behaving inappropriately.",
    steps: [
      "Open the user's profile",
      "Tap the menu (...) in the top right",
      "Choose Report",
      "Select a reason",
      "Add details and submit (10 characters minimum)",
    ],
  },
  "report-reason": {
    id: "report-reason",
    title: "How to Choose a Report Reason",
    description:
      "When reporting, please select the most appropriate reason.",
    steps: [
      "Inappropriate content: violent or sexual material",
      "Spam: unwanted ads or repetitive posts",
      "Harassment: bullying or threats",
      "Fraud: scams or impersonation",
      "Inappropriate images/videos: explicit media",
      "Misinformation: spreading false information",
      "Other: anything else",
    ],
  },
  "block-user": {
    id: "block-user",
    title: "Block a User",
    description:
      "Blocking a user hides each other's profiles and messages.",
    steps: [
      "Open the user's profile",
      "Tap the menu (...) in the top right",
      "Choose Block",
      "Confirm",
    ],
    additionalInfo:
      "You can unblock users from Settings > Blocked List.",
  },
  "hidden-posts": {
    id: "hidden-posts",
    title: "Hide a Post",
    description:
      "Hide posts you don't want to see.",
    steps: [
      "Tap the menu (...) on the post",
      "Choose Hide Post",
      "Done",
    ],
    additionalInfo:
      "Manage hidden posts from Settings > Hidden List, where you can also unhide them.",
  },
  "report-safety": {
    id: "report-safety",
    title: "Stay Safe",
    description:
      "Use GolfMatch safely by following these guidelines.",
    steps: [
      "Don't share personal info (address, phone number) in messages",
      "Don't send money to anyone",
      "When meeting in person for the first time, choose a public place",
      "Report any suspicious behavior right away",
    ],
  },

  // Safety & Moderation
  "moderation-overview": {
    id: "moderation-overview",
    title: "Content Moderation",
    description:
      "GolfMatch has dedicated moderation in place to keep the community safe for everyone.",
    steps: [
      "Human review: trained staff review reports and watch for inappropriate content (violence, sexual content, spam, etc.)",
      "24/7 coverage: moderation runs 24 hours a day, 365 days a year",
      "Fast response: violating content is removed promptly once identified",
    ],
    additionalInfo:
      "Reports from users are essential to our moderation. If you see something inappropriate, please use the Report option in the post menu. We take every report seriously.",
  },
  "moderation-guidelines": {
    id: "moderation-guidelines",
    title: "Community Guidelines",
    description:
      "GolfMatch is a place to meet new people through golf. Help us keep it a great community by following these guidelines.",
    steps: [
      "Prohibited content: violent or sexual content, hate speech, sharing personal info without consent",
      "Prohibited behavior: spam, scams, solicitation, impersonation, harassment",
      "Encouraged behavior: be respectful, post about golf, complete identity verification",
      "Photo guidelines: use photos of yourself, no inappropriate images, respect copyright",
    ],
    additionalInfo:
      "Violations may result in warnings, post removal, or account suspension. See our Terms of Service for details.",
  },
  "moderation-action": {
    id: "moderation-action",
    title: "How We Handle Violations",
    description:
      "When we identify content that violates the community guidelines, we take the following actions.",
    steps: [
      "Minor violations: removing the content and warning the user",
      "Serious violations: immediate removal and temporary account suspension",
      "Repeat violations: permanent account ban",
      "Legal matters: cooperation with relevant authorities when required",
    ],
    additionalInfo:
      "If you have questions about a moderation action, please contact support. Note that we may not be able to share details about specific cases.",
  },

  // Account Deletion
  "withdrawal-process": {
    id: "withdrawal-process",
    title: "How to Delete Your Account",
    description:
      "Deleting your account erases all of your data. Please consider carefully before doing so.",
    steps: [
      "Tap Settings from My Page",
      "Tap Delete Account",
      "Read the warnings",
      "Type \"delete\" to confirm",
      "Tap Delete Account",
    ],
    additionalInfo: "Deleted data cannot be recovered.",
  },
  "withdrawal-data": {
    id: "withdrawal-data",
    title: "What Happens to Your Data",
    description:
      "After you delete your account, the following data is removed.",
    steps: [
      "Profile information",
      "Photos and videos you posted",
      "Message history",
      "Match and Like history",
      "Calendar settings",
    ],
    additionalInfo:
      "Data cannot be restored after deletion. Back up anything you need beforehand.",
  },

  // Bugs
  "bug-report": {
    id: "bug-report",
    title: "Report a Bug",
    description:
      "If you find a bug, please report it through Contact Support.",
    steps: [
      "Tap Contact Support from My Page",
      "Describe the bug in detail",
      "Include the steps you took when it happened",
      "Submit",
    ],
  },
  "bug-common": {
    id: "bug-common",
    title: "Common Issues and Fixes",
    description:
      "Quick fixes for common issues.",
    steps: [
      "App won't start → fully close the app and reopen",
      "Photos not loading → check your internet connection",
      "Not getting notifications → check your device and app notification settings",
      "Can't sign in → make sure you're using the same Google or Apple account you originally signed up with",
    ],
  },
  "bug-app-update": {
    id: "bug-app-update",
    title: "Update the App",
    description:
      "Keeping the app up to date often fixes bugs.",
    steps: [
      "Open the App Store or Google Play",
      "Search for GolfMatch",
      "Tap Update if it's available",
      "Wait for the update to finish",
    ],
  },

  // Other
  "privacy-policy": {
    id: "privacy-policy",
    title: "Privacy Policy",
    description:
      "Read our Privacy Policy on the web. Tap the link below to open it.",
    link: "https://dating.golfmatch.info/privacy.html",
  },
  "terms-of-service": {
    id: "terms-of-service",
    title: "Terms of Service",
    description:
      "Read our Terms of Service on the web. Tap the link below to open it.",
    link: "https://dating.golfmatch.info/terms.html",
  },
  "contact-support": {
    id: "contact-support",
    title: "Contact Support",
    description:
      "If this Help Center didn't answer your question, please reach out.",
    steps: [
      "Tap Contact Support from My Page",
      "Write your message",
      "Submit",
    ],
    additionalInfo: "Replies appear in the Replies tab on the Contact Support screen.",
  },
};

const HelpDetailScreen: React.FC = () => {
  const navigation = useNavigation<HelpDetailScreenNavigationProp>();
  const route = useRoute<HelpDetailScreenRouteProp>();
  const { itemId } = route.params;

  const detail = helpDetails[itemId];

  if (!detail) {
    return (
      <SafeAreaView style={styles.container}>
        <StandardHeader
          title=""
          showBackButton
          onBackPress={() => navigation.goBack()}
        />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Help article not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleContactPress = () => {
    navigation.navigate("ContactReply");
  };

  return (
    <SafeAreaView style={styles.container}>
      <StandardHeader
        title=""
        showBackButton
        onBackPress={() => navigation.goBack()}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <Text style={styles.title}>{detail.title}</Text>

          <Text style={styles.description}>{detail.description}</Text>

          {detail.steps && detail.steps.length > 0 && (
            <View style={styles.stepsContainer}>
              <Text style={styles.stepsTitle}>Steps</Text>
              {detail.steps.map((step, index) => (
                <View key={index} style={styles.stepItem}>
                  <Text style={styles.stepNumber}>{index + 1}:</Text>
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
            </View>
          )}

          {detail.additionalInfo && (
            <Text style={styles.additionalInfo}>{detail.additionalInfo}</Text>
          )}

          {detail.link && (
            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => Linking.openURL(detail.link!)}
              activeOpacity={0.8}
            >
              <Text style={styles.linkButtonText}>
                {detail.id === "privacy-policy" ? "Open Privacy Policy" :
                 detail.id === "terms-of-service" ? "Open Terms of Service" : "Open Link"}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.contactSection}>
          <Text style={styles.contactText}>Still need help?</Text>
          <TouchableOpacity
            style={styles.contactButton}
            onPress={handleContactPress}
            activeOpacity={0.8}
          >
            <Text style={styles.contactButtonText}>Contact Support</Text>
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
  content: {
    padding: Spacing.lg,
  },
  title: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
    marginBottom: Spacing.md,
  },
  description: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    lineHeight: 24,
    marginBottom: Spacing.lg,
  },
  stepsContainer: {
    marginBottom: Spacing.lg,
  },
  stepsTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
    marginBottom: Spacing.md,
  },
  stepItem: {
    flexDirection: "row",
    marginBottom: Spacing.sm,
    paddingLeft: Spacing.sm,
  },
  stepNumber: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.primary,
    marginRight: Spacing.xs,
    minWidth: 24,
  },
  stepText: {
    flex: 1,
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    lineHeight: 24,
  },
  additionalInfo: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    lineHeight: 24,
    marginTop: Spacing.md,
  },
  linkButton: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.lg,
  },
  linkButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.white,
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
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  errorText: {
    fontSize: Typography.fontSize.base,
    color: Colors.text.secondary,
    textAlign: "center",
  },
});

export default HelpDetailScreen;








