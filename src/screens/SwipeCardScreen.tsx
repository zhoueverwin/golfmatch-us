import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { Ionicons } from "@expo/vector-icons";

import { Colors } from "../constants/colors";
import { Spacing, BorderRadius } from "../constants/spacing";
import { Typography } from "../constants/typography";
import { User } from "../types/dataModels";
import { RootStackParamList } from "../types";
import { SwipeCardWithRef, SwipeCardRef } from "../components/SwipeCard";
import { getSwipeCardData } from "../services/swipeCardData";
import { useAuth } from "../contexts/AuthContext";
import { userInteractionService } from "../services/userInteractionService";
import { useRequireVerification } from "../hooks/useRequireVerification";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

type SwipeCardScreenNavigationProp = StackNavigationProp<RootStackParamList>;

const SwipeCardScreen: React.FC = () => {
  const navigation = useNavigation<SwipeCardScreenNavigationProp>();
  const { profileId } = useAuth();
  const requireVerification = useRequireVerification();
  const [users, setUsers] = useState<User[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [cardAreaHeight, setCardAreaHeight] = useState(SCREEN_HEIGHT * 0.70);
  const swipeCardRef = useRef<SwipeCardRef>(null);

  useEffect(() => {
    const data = getSwipeCardData();
    if (data) {
      setUsers(data.users);
      setCurrentIndex(data.startIndex);
    }
  }, []);

  const handleSwipeRight = useCallback(
    (user: User) => {
      if (!profileId) return;
      // For unverified females the gate fires a CTA Alert; the gesture has
      // already animated the card off-screen, so we spring it back to
      // center via the SwipeCard ref and DON'T advance the index. The user
      // can swipe again after verifying, on the same card.
      let allowed = false;
      requireVerification("swipe", () => {
        allowed = true;
      });
      if (allowed) {
        userInteractionService.likeUser(profileId, user.id);
        setCurrentIndex((prev) => prev + 1);
      } else {
        swipeCardRef.current?.resetPosition();
      }
    },
    [profileId, requireVerification],
  );

  const handleSwipeLeft = useCallback(
    (user: User) => {
      if (!profileId) return;
      userInteractionService.passUser(profileId, user.id);
      setCurrentIndex((prev) => prev + 1);
    },
    [profileId],
  );

  const handleTapProfile = useCallback(
    (user: User) => {
      navigation.navigate("Profile", { userId: user.id });
    },
    [navigation],
  );

  const isExhausted = currentIndex >= users.length;

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color={Colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={styles.headerSpacer} />
        </View>

        {isExhausted ? (
          <View style={styles.emptyContainer}>
            <Ionicons
              name="checkmark-circle-outline"
              size={64}
              color={Colors.gray[300]}
            />
            <Text style={styles.emptyTitle}>You're all caught up</Text>
            <Text style={styles.emptySubtitle}>
              Head back to Search to find more golfers
            </Text>
            <TouchableOpacity
              style={styles.backToSearchButton}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.backToSearchButtonText}>
                Find New People
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
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
      </SafeAreaView>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
  },
  headerSpacer: {
    width: 40,
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
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
    marginTop: Spacing.sm,
  },
  emptySubtitle: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text.secondary,
    textAlign: "center",
  },
  backToSearchButton: {
    marginTop: Spacing.md,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.full,
  },
  backToSearchButtonText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.white,
  },
});

export default SwipeCardScreen;
