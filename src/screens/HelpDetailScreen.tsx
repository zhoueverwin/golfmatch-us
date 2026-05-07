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
      "Find a profile in the Search or Home tab",
      "Tap their profile to open it",
      "Tap the heart icon to send a Like",
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
      "You'll get a notification when you Match. A Premium membership is required to send messages.",
  },
  "like-history": {
    id: "like-history",
    title: "Review Your Past Likes",
    description:
      "You can review every Like you've sent.",
    steps: [
      "Tap My Page at the bottom",
      "Tap Past Likes",
      "Browse all the Likes you've sent",
    ],
  },

  // Posts
  "post-create": {
    id: "post-create",
    title: "Create a Post",
    description:
      "Create posts from the Home screen. You'll need to complete identity verification (KYC) first.",
    steps: [
      "Tap the + button at the bottom right of Home",
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
      "Message anyone you've Matched with. A Premium membership is required to message.",
    steps: [
      "Tap the Messages tab at the bottom",
      "Choose the person you want to chat with",
      "Type your message",
      "Tap Send",
    ],
    additionalInfo: "You can also send images and videos.",
  },
  "message-read": {
    id: "message-read",
    title: "Read New Messages",
    description:
      "You'll see new messages via push notifications and inside the app.",
    steps: [
      "Tap the Messages tab at the bottom",
      "Unread conversations show a badge",
      "Tap a conversation to read",
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
      "Recommended tab: shows your most compatible matches (recommended)",
      "Newest tab: shows newly registered users",
      "Tap a profile to see details",
      "Send a Like if you're interested",
    ],
    additionalInfo:
      "How the Recommended tab works\nThe Recommended tab ranks users using six factors:\n\n1. Calendar overlap (30 pts)\nUsers whose available days line up with yours over the next 30 days. Higher score means you're more likely to actually play together.\n\n2. Skill compatibility (25 pts)\nUsers at a similar skill level (Beginner, Intermediate, Advanced, Pro). Closer levels make for a better round.\n\n3. Score similarity (20 pts)\nSimilar average scores rank highest, especially within 5 strokes.\n\n4. Location (15 pts)\nUsers in the same or nearby states.\n\n5. Activity (10 pts)\nRecently active users rank higher, with the highest scores for those active in the last 24 hours.\n\n6. Profile completeness (10 pts)\nUsers with 3+ photos, a thoughtful bio, and verified status rank higher.\n\nTotal scores determine the order.\n\nGet better matches\nSet your available days in the Calendar to match with more compatible people. Tap Set Available Days from the calendar on your profile.\n\nFilters\nUse filters to narrow down who you see:\n- Age range\n- State\n- Skill level\n- Average score\n- Last active",
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
      "Premium members can send unlimited messages.",
    steps: [
      "Unlimited messaging with anyone you've matched with",
      "Build deeper connections faster",
      "Cancel anytime, no extra fees",
    ],
    additionalInfo: "Premium is $30/month.",
  },
  "membership-purchase": {
    id: "membership-purchase",
    title: "Subscribe to Premium",
    description:
      "Buy a Premium membership from the Store screen.",
    steps: [
      "Tap Store from My Page",
      "Review what's included",
      "Tap Subscribe",
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
      "Tap Store from My Page",
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
      "Once verified, a verified badge will appear on your profile.",
    steps: [
      "Tap Settings from My Page",
      "Tap Identity Verification",
      "Choose your ID document type",
      "Take photos of the front and back of your ID",
      "Take a selfie",
      "Take a photo holding your ID next to your face",
      "Take a photo of yourself playing golf",
      "Submit and wait for review",
    ],
  },
  "kyc-documents": {
    id: "kyc-documents",
    title: "Accepted ID Documents",
    description:
      "You can verify your identity with any of the following.",
    steps: [
      "State ID Card",
      "Driver's License",
      "Passport",
      "Health Insurance Card",
    ],
    additionalInfo: "Make sure your document is not expired.",
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
      "If your verification didn't go through, check the following.",
    steps: [
      "Make sure your document photo is sharp and in focus",
      "All four corners of the document must be visible",
      "Make sure your document is not expired",
      "Your selfie should be bright and clear",
      "If you still need help, contact support",
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
      "Can't sign in → double-check your email and try again",
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
    link: "https://www.golfmatch.info/?page=privacypolicy-jp",
  },
  "terms-of-service": {
    id: "terms-of-service",
    title: "Terms of Service",
    description:
      "Read our Terms of Service on the web. Tap the link below to open it.",
    link: "https://www.golfmatch.info/?page=termsofuse-jp",
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
          title="Help"
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
        title="Help & Support"
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








