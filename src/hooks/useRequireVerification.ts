// Centralized check for "can this user perform a social action?" Used to
// gate likes / sends / posts behind face verification for unverified female
// users.
//
// Product rule (post-App-Review v1.2):
//   - Males: never required to verify. Always passes through. They don't
//     get a verified badge either; verification doesn't exist for them.
//   - Verified females: pass through.
//   - Unverified females: see an Alert offering "Verify now" (→ KycVerification
//     route, which is the existing standalone Didit liveness screen with
//     goBack() on approval) or "Not now" (action aborted).
//
// Apple App Review (5.x) flagged "required face verification at signup" as
// over-collection. Per-action prompts at the moment a female user wants to
// like / message / post fit Apple's "optional with feature gate" pattern and
// match what Bumble / Hinge / Tinder do.

import { useCallback } from "react";
import { Alert } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { useAuth } from "../contexts/AuthContext";
import { RootStackParamList } from "../types";

type Nav = StackNavigationProp<RootStackParamList>;

export type VerificationAction = "like" | "send_message" | "post" | "swipe";

const COPY: Record<VerificationAction, { title: string; body: string }> = {
  like: {
    title: "Verify yourself to like",
    body:
      "To keep Golfmatch safe, verify your identity once before liking other golfers. It only takes a minute.",
  },
  swipe: {
    title: "Verify yourself to swipe",
    body:
      "To keep Golfmatch safe, verify your identity once before sending interest. It only takes a minute.",
  },
  send_message: {
    title: "Verify yourself to send messages",
    body:
      "To keep Golfmatch safe, verify your identity once before messaging other golfers. You can still read messages others send you.",
  },
  post: {
    title: "Verify yourself to post",
    body:
      "To keep Golfmatch safe, verify your identity once before posting to the feed. It only takes a minute.",
  },
};

export function useRequireVerification() {
  const navigation = useNavigation<Nav>();
  const { userProfile } = useAuth();

  return useCallback(
    (action: VerificationAction, onAllowed: () => void) => {
      // Males and verified females: no gate.
      const isFemale = userProfile?.gender === "female";
      const isVerified = userProfile?.is_verified === true;

      if (!isFemale || isVerified) {
        onAllowed();
        return;
      }

      const { title, body } = COPY[action];
      Alert.alert(title, body, [
        { text: "Not now", style: "cancel" },
        {
          text: "Verify now",
          onPress: () => navigation.navigate("KycVerification"),
        },
      ]);
    },
    [navigation, userProfile?.gender, userProfile?.is_verified],
  );
}
