import React from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
} from "react-native";
import { Colors } from "../constants/colors";
import { Typography } from "../constants/typography";
import { Spacing, BorderRadius } from "../constants/spacing";

export type StatsTooltipKey =
  | "matches"
  | "likes"
  | "profileViews"
  | "impressions"
  | "postViews";

interface StatsTooltipProps {
  visible: boolean;
  onClose: () => void;
  tooltipKey: StatsTooltipKey;
}

const TOOLTIP_CONTENT: Record<
  StatsTooltipKey,
  { title: string; description: string; tip: string }
> = {
  matches: {
    title: "Matches",
    description: "The number of people who liked you back. Once you match, you can start messaging each other.",
    tip: "Reply to incoming likes quickly to boost your match rate!",
  },
  likes: {
    title: "Likes",
    description: "The total number of likes you've received. This many people are interested in your profile.",
    tip: "Adding photos from your rounds tends to drive a big jump in likes!",
  },
  profileViews: {
    title: "Views",
    description: "The number of unique users who visited your profile. Repeat views by the same person count as one.",
    tip: "Posting regularly and updating your calendar helps you rank higher in search results!",
  },
  impressions: {
    title: "Impressions",
    description: "The number of times you appeared in search results and recommendations. The more often you show up, the more chances others have to see you.",
    tip: "Premium members get priority placement in recommendations and search. Filling out your state, skill level, and score also boosts impressions!",
  },
  postViews: {
    title: "Post views",
    description: "The total number of times your posts have been viewed in the feed. Posting brings more traffic to your profile. Active posters average 2-3x more likes, views, and matches.",
    tip: "Haven't posted yet? Just share a recent round photo or your favorite course. Posting once a week meaningfully boosts profile views.",
  },
};

const StatsTooltip: React.FC<StatsTooltipProps> = ({
  visible,
  onClose,
  tooltipKey,
}) => {
  const content = TOOLTIP_CONTENT[tooltipKey];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.card} onStartShouldSetResponder={() => true}>
          <Text style={styles.title}>{content.title}</Text>
          <Text style={styles.description}>{content.description}</Text>
          <Text style={styles.tip}>{content.tip}</Text>
        </View>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    width: "100%",
    maxWidth: 320,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
    marginBottom: Spacing.sm,
  },
  description: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.secondary,
    lineHeight: 22,
    marginBottom: Spacing.md,
  },
  tip: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.primary,
    lineHeight: 20,
  },
});

export default StatsTooltip;
