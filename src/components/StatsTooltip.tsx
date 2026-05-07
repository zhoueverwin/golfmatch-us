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
    title: "つながり",
    description: "お互いにいいねを送り合った人数です。つながると、メッセージのやり取りができるようになります。",
    tip: "「いいね」が届いたらなるべく早く返すと、つながり率がアップします！",
  },
  likes: {
    title: "いいね",
    description: "他のユーザーから受け取ったいいねの合計数です。あなたのプロフィールに興味を持っている人がこれだけいます。",
    tip: "ゴルフ中の写真やラウンド風景を追加すると、いいね数が大きく伸びる傾向があります！",
  },
  profileViews: {
    title: "閲覧",
    description: "あなたのプロフィールページを訪れたユニークユーザー数です。同じ人が何度見ても1回としてカウントされます。",
    tip: "定期的に投稿したり、カレンダーを更新すると検索上位に表示されやすくなります！",
  },
  impressions: {
    title: "印象",
    description: "検索結果やおすすめ一覧にあなたが表示された回数です。多いほど、他のユーザーの目に触れる機会が増えています。",
    tip: "有料会員はおすすめや検索結果で優先表示されます。都道府県・スキルレベル・スコアの入力も表示回数アップに効果的です！",
  },
  postViews: {
    title: "投稿閲覧",
    description: "あなたの投稿がフィード上で閲覧された合計回数です。投稿するとフィードに表示され、あなたのプロフィールへの流入が増えます。投稿が多いユーザーほど、いいね・閲覧・つながりの数が平均2〜3倍高い傾向があります。",
    tip: "まだ投稿していない方は、最近のラウンド写真やお気に入りのコースを1枚シェアするだけでOK！週1回の投稿でプロフィール閲覧数が大きく伸びます。",
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
