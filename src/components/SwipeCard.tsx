import React, { useCallback } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  Dimensions,
  TouchableWithoutFeedback,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  interpolate,
  runOnJS,
  Extrapolation,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";

import { Colors } from "../constants/colors";
import { Spacing, BorderRadius } from "../constants/spacing";
import { Typography } from "../constants/typography";
import { User } from "../types/dataModels";
import { getAgeRange, calculateAge } from "../utils/formatters";
import { StreakBadge } from "./StreakBadge";

const PinOutlineIcon = require("../../assets/images/Icons/Pin-Outline.png");

/**
 * Compute the distance chip label for a candidate card. Honors the same
 * <5mi privacy bucket as the server RPC — even when we derived the meters
 * from score_breakdown (which contains raw meters for observability), we
 * still bucket on the client to keep behavior consistent across surfaces.
 */
function getDistanceLabel(user: User): string | null {
  // Search results carry distance_miles directly from the RPC.
  if (typeof user.distance_miles === "number") {
    if (user.distance_miles < 5) return "<5 mi";
    return `${user.distance_miles} mi`;
  }
  // Recommendation results carry distance_meters in score_breakdown.
  const meters = user.score_breakdown?.distance_meters;
  if (meters != null) {
    const miles = meters / 1609.34;
    if (miles < 5) return "<5 mi";
    return `${Math.round(miles)} mi`;
  }
  return null;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } =
  Dimensions.get("window");
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3;
const VELOCITY_THRESHOLD = 800;
const SWIPE_OUT_DURATION = 300;
const CARD_BORDER_RADIUS = 20;

interface SwipeCardProps {
  users: User[];
  currentIndex: number;
  onSwipeRight: (user: User) => void;
  onSwipeLeft: (user: User) => void;
  onTapProfile: (user: User) => void;
  cardHeight?: number;
  hideOverlay?: boolean;
  overlayPaddingBottom?: number;
}

const SwipeCard: React.FC<SwipeCardProps> = ({
  users,
  currentIndex,
  onSwipeRight,
  onSwipeLeft,
  onTapProfile,
  cardHeight = SCREEN_HEIGHT * 0.65,
  hideOverlay = false,
  overlayPaddingBottom = 20,
}) => {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const isAnimating = useSharedValue(false);

  // Photo pagination state per card
  const [photoIndex, setPhotoIndex] = React.useState(0);

  // Reset translateX/Y to 0 synchronously after the new currentIndex is
  // committed but before paint. Worklet callbacks intentionally leave the
  // shared values off-screen so the OLD Animated.View can't snap back to
  // center between its withTiming completion and React's re-render with a
  // new key. useLayoutEffect runs before the next frame paints — by then
  // the new top card key is mounted and its first paint sees translateX=0.
  React.useLayoutEffect(() => {
    setPhotoIndex(0);
    translateX.value = 0;
    translateY.value = 0;
    isAnimating.value = false;
  }, [currentIndex, translateX, translateY, isAnimating]);

  const currentUser = users[currentIndex];
  const nextUser = users[currentIndex + 1];

  // Notify parent of swipe. translateX/Y are left off-screen by the
  // worklet; the useLayoutEffect on currentIndex (above) resets them to 0
  // after React commits the new currentUser, so the freshly keyed top card
  // paints centered on its very first frame.
  const handleSwipeComplete = useCallback(
    (direction: "left" | "right") => {
      if (!currentUser) return;
      if (direction === "right") {
        onSwipeRight(currentUser);
      } else {
        onSwipeLeft(currentUser);
      }
    },
    [currentUser, onSwipeRight, onSwipeLeft],
  );

  // Programmatic swipe (for button presses)
  const triggerSwipe = useCallback(
    (direction: "left" | "right") => {
      if (isAnimating.value || !currentUser) return;
      isAnimating.value = true;
      const targetX =
        direction === "right" ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5;
      translateX.value = withTiming(
        targetX,
        { duration: SWIPE_OUT_DURATION },
        () => {
          "worklet";
          // Do NOT reset translateX/Y here. The OLD Animated.View (keyed on
          // the outgoing user.id) is still mounted at this moment; resetting
          // would snap it from off-screen back to center for 1–3 frames
          // before React commits the new currentUser. Leave it off-screen
          // and let useLayoutEffect on currentIndex reset to 0 after the
          // key change has unmounted the old card and mounted the new one.
          runOnJS(handleSwipeComplete)(direction);
        },
      );
    },
    [currentUser, handleSwipeComplete, translateX, isAnimating],
  );

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (isAnimating.value) return;
      translateX.value = event.translationX;
      translateY.value = event.translationY * 0.3; // Dampen vertical
    })
    .onEnd((event) => {
      if (isAnimating.value) return;

      const shouldSwipeRight =
        translateX.value > SWIPE_THRESHOLD ||
        event.velocityX > VELOCITY_THRESHOLD;
      const shouldSwipeLeft =
        translateX.value < -SWIPE_THRESHOLD ||
        event.velocityX < -VELOCITY_THRESHOLD;

      if (shouldSwipeRight) {
        isAnimating.value = true;
        translateX.value = withTiming(
          SCREEN_WIDTH * 1.5,
          { duration: SWIPE_OUT_DURATION },
          () => {
            "worklet";
            runOnJS(handleSwipeComplete)("right");
          },
        );
        translateY.value = withTiming(event.translationY * 0.5, {
          duration: SWIPE_OUT_DURATION,
        });
      } else if (shouldSwipeLeft) {
        isAnimating.value = true;
        translateX.value = withTiming(
          -SCREEN_WIDTH * 1.5,
          { duration: SWIPE_OUT_DURATION },
          () => {
            "worklet";
            runOnJS(handleSwipeComplete)("left");
          },
        );
        translateY.value = withTiming(event.translationY * 0.5, {
          duration: SWIPE_OUT_DURATION,
        });
      } else {
        // Snap back
        translateX.value = withSpring(0, { damping: 15, stiffness: 150 });
        translateY.value = withSpring(0, { damping: 15, stiffness: 150 });
      }
    });

  // Top card animated style
  const topCardStyle = useAnimatedStyle(() => {
    const rotation = interpolate(
      translateX.value,
      [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
      [-15, 0, 15],
      Extrapolation.CLAMP,
    );
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rotation}deg` },
      ],
    };
  });

  // Like overlay opacity (right swipe)
  const likeOverlayStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [0, SCREEN_WIDTH * 0.2],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  // Skip overlay opacity (left swipe)
  const skipOverlayStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [-SCREEN_WIDTH * 0.2, 0],
      [1, 0],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  // Back card animated style
  const backCardStyle = useAnimatedStyle(() => {
    const scale = interpolate(
      Math.abs(translateX.value),
      [0, SCREEN_WIDTH * 0.5],
      [0.95, 1],
      Extrapolation.CLAMP,
    );
    const opacity = interpolate(
      Math.abs(translateX.value),
      [0, SCREEN_WIDTH * 0.5],
      [0.7, 1],
      Extrapolation.CLAMP,
    );
    return {
      transform: [{ scale }],
      opacity,
    };
  });

  const handleTapLeft = useCallback(() => {
    if (!currentUser) return;
    const photos = currentUser.profile_pictures;
    if (photos.length > 1 && photoIndex > 0) {
      setPhotoIndex((prev) => prev - 1);
    }
  }, [currentUser, photoIndex]);

  const handleTapRight = useCallback(() => {
    if (!currentUser) return;
    const photos = currentUser.profile_pictures;
    if (photos.length > 1 && photoIndex < photos.length - 1) {
      setPhotoIndex((prev) => prev + 1);
    }
  }, [currentUser, photoIndex]);

  const handleTapCenter = useCallback(() => {
    if (currentUser) {
      onTapProfile(currentUser);
    }
  }, [currentUser, onTapProfile]);

  const renderCard = (user: User, isTop: boolean) => {
    const photos = user.profile_pictures;
    const currentPhoto =
      photos[isTop ? photoIndex : 0] ||
      "https://images.unsplash.com/photo-1494790108755-2616b612b786?w=400&h=400&fit=crop&crop=face";
    const age = user.birth_date ? calculateAge(user.birth_date) : user.age;

    return (
      <View style={[styles.card, { height: cardHeight }]}>
        <ExpoImage
          source={{ uri: currentPhoto }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={0}
          recyclingKey={`${user.id}-${isTop ? photoIndex : 0}`}
        />

        {/* Photo indicator bars */}
        {isTop && photos.length > 1 && (
          <View style={styles.photoIndicatorContainer}>
            {photos.map((_, idx) => (
              <View
                key={idx}
                style={[
                  styles.photoIndicatorBar,
                  idx === photoIndex && styles.photoIndicatorBarActive,
                ]}
              />
            ))}
          </View>
        )}

        {/* Swipe overlays (top card only) */}
        {isTop && (
          <>
            <Animated.View style={[styles.stampOverlay, styles.likeStamp, likeOverlayStyle]}>
              <Text style={styles.likeStampText}>LIKE!</Text>
            </Animated.View>
            <Animated.View style={[styles.stampOverlay, styles.skipStamp, skipOverlayStyle]}>
              <Text style={styles.skipStampText}>SKIP</Text>
            </Animated.View>
          </>
        )}

        {/* Gradient overlay with user info (hidden when parent provides its own) */}
        {!hideOverlay && (
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.25)", "rgba(0,0,0,0.78)"]}
            locations={[0, 0.4, 1.0]}
            style={[styles.gradientOverlay, { paddingBottom: overlayPaddingBottom }]}
          >
            {/* Thumbnail strip */}
            {isTop && photos.length > 1 && (
              <View style={styles.thumbnailStrip}>
                {photos.map((photo, idx) => (
                  <TouchableWithoutFeedback
                    key={idx}
                    onPress={() => setPhotoIndex(idx)}
                  >
                    <View>
                      <ExpoImage
                        source={{ uri: photo }}
                        style={[
                          styles.thumbnailImage,
                          idx === (isTop ? photoIndex : 0) && styles.thumbnailImageActive,
                        ]}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                      />
                    </View>
                  </TouchableWithoutFeedback>
                ))}
              </View>
            )}
            <View style={styles.userInfoContainer}>
              <View style={styles.nameRow}>
                <Text style={styles.userName} numberOfLines={1}>
                  {user.name}
                </Text>
                <StreakBadge days={user.current_streak_days} />
                <View style={styles.genderAgeBadge}>
                  {user.gender === "male" ? (
                    <Ionicons name="male" size={14} color="#5B9BD5" />
                  ) : user.gender === "female" ? (
                    <Ionicons name="female" size={14} color="#FF6B8A" />
                  ) : null}
                  <Text style={styles.ageText}>{age}</Text>
                </View>
              </View>
              <View style={styles.locationRow}>
                <Image source={PinOutlineIcon} style={styles.pinIcon} />
                <Text style={styles.locationText}>
                  {user.prefecture || "Not set"}
                  {getDistanceLabel(user)
                    ? ` · ${getDistanceLabel(user)}`
                    : ""}
                </Text>
              </View>
              {(user.golf_skill_level || user.average_score) && (
                <View style={styles.golfRow}>
                  <Ionicons name="golf" size={13} color="rgba(255,255,255,0.7)" />
                  <Text style={styles.golfText}>
                    {user.golf_skill_level}
                    {user.average_score ? ` · Avg ${user.average_score}` : ""}
                  </Text>
                </View>
              )}
            </View>
          </LinearGradient>
        )}

        {/* Tap zones for photo navigation (top card only) */}
        {isTop && (
          <View style={styles.tapZoneContainer} pointerEvents="box-none">
            <TouchableWithoutFeedback onPress={handleTapLeft}>
              <View style={styles.tapZoneLeft} />
            </TouchableWithoutFeedback>
            <TouchableWithoutFeedback onPress={handleTapCenter}>
              <View style={styles.tapZoneCenter} />
            </TouchableWithoutFeedback>
            <TouchableWithoutFeedback onPress={handleTapRight}>
              <View style={styles.tapZoneRight} />
            </TouchableWithoutFeedback>
          </View>
        )}
      </View>
    );
  };

  if (!currentUser) return null;

  return (
    <View style={[styles.container, { height: cardHeight }]}>
      {/* Back card — keyed on the user so React mounts a fresh subtree
          per card and Expo Image doesn't transition between profiles. */}
      {nextUser && (
        <Animated.View
          key={`back-${nextUser.id}`}
          style={[styles.cardWrapper, styles.backCardWrapper, backCardStyle]}
        >
          {renderCard(nextUser, false)}
        </Animated.View>
      )}

      {/* Top card with gestures — keyed on currentUser.id so the post-swipe
          re-render mounts a new Animated.View whose useAnimatedStyle
          evaluates against the (already worklet-reset) translateX = 0. */}
      <GestureDetector gesture={panGesture}>
        <Animated.View
          key={`top-${currentUser.id}`}
          style={[styles.cardWrapper, topCardStyle]}
        >
          {renderCard(currentUser, true)}
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

// Expose triggerSwipe via ref
export interface SwipeCardRef {
  triggerSwipe: (direction: "left" | "right") => void;
}

export const SwipeCardWithRef = React.forwardRef<SwipeCardRef, SwipeCardProps>(
  (props, ref) => {
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const isAnimating = useSharedValue(false);
    const [photoIndex, setPhotoIndex] = React.useState(0);

    const {
      users,
      currentIndex,
      onSwipeRight,
      onSwipeLeft,
      onTapProfile,
      cardHeight = SCREEN_HEIGHT * 0.65,
      hideOverlay = false,
      overlayPaddingBottom = 20,
    } = props;

    const currentUser = users[currentIndex];
    const nextUser = users[currentIndex + 1];

    React.useLayoutEffect(() => {
      setPhotoIndex(0);
      // Reset before paint — see comment on the non-forwardRef variant.
      // The worklet leaves translateX off-screen so the OLD Animated.View
      // never snaps back to center between withTiming completion and the
      // React commit that swaps the keyed top card.
      translateX.value = 0;
      translateY.value = 0;
      isAnimating.value = false;
    }, [currentIndex, translateX, translateY, isAnimating]);

    // See comment on the non-forwardRef variant above — reset happens in
    // the worklet (UI thread, synchronous) so React commits the new
    // currentUser into a card whose transform is already centered.
    const handleSwipeComplete = useCallback(
      (direction: "left" | "right") => {
        if (!currentUser) return;
        if (direction === "right") {
          onSwipeRight(currentUser);
        } else {
          onSwipeLeft(currentUser);
        }
      },
      [currentUser, onSwipeRight, onSwipeLeft],
    );

    const triggerSwipe = useCallback(
      (direction: "left" | "right") => {
        if (isAnimating.value || !currentUser) return;
        isAnimating.value = true;
        const targetX =
          direction === "right" ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5;
        translateX.value = withTiming(
          targetX,
          { duration: SWIPE_OUT_DURATION },
          () => {
            "worklet";
            // Leave translateX off-screen; useLayoutEffect on currentIndex
            // resets to 0 after the key change unmounts the old card.
            runOnJS(handleSwipeComplete)(direction);
          },
        );
      },
      [currentUser, handleSwipeComplete, translateX, isAnimating],
    );

    React.useImperativeHandle(ref, () => ({ triggerSwipe }), [triggerSwipe]);

    const panGesture = Gesture.Pan()
      .onUpdate((event) => {
        if (isAnimating.value) return;
        translateX.value = event.translationX;
        translateY.value = event.translationY * 0.3;
      })
      .onEnd((event) => {
        if (isAnimating.value) return;

        const shouldSwipeRight =
          translateX.value > SWIPE_THRESHOLD ||
          event.velocityX > VELOCITY_THRESHOLD;
        const shouldSwipeLeft =
          translateX.value < -SWIPE_THRESHOLD ||
          event.velocityX < -VELOCITY_THRESHOLD;

        if (shouldSwipeRight) {
          isAnimating.value = true;
          translateX.value = withTiming(
            SCREEN_WIDTH * 1.5,
            { duration: SWIPE_OUT_DURATION },
            () => {
              "worklet";
              runOnJS(handleSwipeComplete)("right");
            },
          );
          translateY.value = withTiming(event.translationY * 0.5, {
            duration: SWIPE_OUT_DURATION,
          });
        } else if (shouldSwipeLeft) {
          isAnimating.value = true;
          translateX.value = withTiming(
            -SCREEN_WIDTH * 1.5,
            { duration: SWIPE_OUT_DURATION },
            () => {
              "worklet";
              runOnJS(handleSwipeComplete)("left");
            },
          );
          translateY.value = withTiming(event.translationY * 0.5, {
            duration: SWIPE_OUT_DURATION,
          });
        } else {
          translateX.value = withSpring(0, { damping: 15, stiffness: 150 });
          translateY.value = withSpring(0, { damping: 15, stiffness: 150 });
        }
      });

    const topCardStyle = useAnimatedStyle(() => {
      const rotation = interpolate(
        translateX.value,
        [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
        [-15, 0, 15],
        Extrapolation.CLAMP,
      );
      return {
        transform: [
          { translateX: translateX.value },
          { translateY: translateY.value },
          { rotate: `${rotation}deg` },
        ],
      };
    });

    const likeOverlayStyle = useAnimatedStyle(() => {
      const opacity = interpolate(
        translateX.value,
        [0, SCREEN_WIDTH * 0.2],
        [0, 1],
        Extrapolation.CLAMP,
      );
      return { opacity };
    });

    const skipOverlayStyle = useAnimatedStyle(() => {
      const opacity = interpolate(
        translateX.value,
        [-SCREEN_WIDTH * 0.2, 0],
        [1, 0],
        Extrapolation.CLAMP,
      );
      return { opacity };
    });

    const backCardStyle = useAnimatedStyle(() => {
      const scale = interpolate(
        Math.abs(translateX.value),
        [0, SCREEN_WIDTH * 0.5],
        [0.95, 1],
        Extrapolation.CLAMP,
      );
      const opacity = interpolate(
        Math.abs(translateX.value),
        [0, SCREEN_WIDTH * 0.5],
        [0.7, 1],
        Extrapolation.CLAMP,
      );
      return {
        transform: [{ scale }],
        opacity,
      };
    });

    const handleTapLeft = useCallback(() => {
      if (!currentUser) return;
      const photos = currentUser.profile_pictures;
      if (photos.length > 1 && photoIndex > 0) {
        setPhotoIndex((prev) => prev - 1);
      }
    }, [currentUser, photoIndex]);

    const handleTapRight = useCallback(() => {
      if (!currentUser) return;
      const photos = currentUser.profile_pictures;
      if (photos.length > 1 && photoIndex < photos.length - 1) {
        setPhotoIndex((prev) => prev + 1);
      }
    }, [currentUser, photoIndex]);

    const handleTapCenter = useCallback(() => {
      if (currentUser) {
        onTapProfile(currentUser);
      }
    }, [currentUser, onTapProfile]);

    const renderCard = (user: User, isTop: boolean) => {
      const photos = user.profile_pictures;
      const currentPhoto =
        photos[isTop ? photoIndex : 0] ||
        "https://images.unsplash.com/photo-1494790108755-2616b612b786?w=400&h=400&fit=crop&crop=face";
      const age = user.birth_date ? calculateAge(user.birth_date) : user.age;

      return (
        <View style={[styles.card, { height: cardHeight }]}>
          <ExpoImage
            source={{ uri: currentPhoto }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={0}
            recyclingKey={`${user.id}-${isTop ? photoIndex : 0}`}
          />

          {isTop && photos.length > 1 && (
            <View style={styles.photoIndicatorContainer}>
              {photos.map((_, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.photoIndicatorBar,
                    idx === photoIndex && styles.photoIndicatorBarActive,
                  ]}
                />
              ))}
            </View>
          )}

          {isTop && (
            <>
              <Animated.View
                style={[styles.stampOverlay, styles.likeStamp, likeOverlayStyle]}
              >
                <Text style={styles.likeStampText}>LIKE!</Text>
              </Animated.View>
              <Animated.View
                style={[styles.stampOverlay, styles.skipStamp, skipOverlayStyle]}
              >
                <Text style={styles.skipStampText}>SKIP</Text>
              </Animated.View>
            </>
          )}

          {!hideOverlay && (
            <LinearGradient
              colors={["transparent", "rgba(0,0,0,0.25)", "rgba(0,0,0,0.78)"]}
              locations={[0, 0.4, 1.0]}
              style={[styles.gradientOverlay, { paddingBottom: overlayPaddingBottom }]}
            >
              {/* Thumbnail strip */}
              {isTop && photos.length > 1 && (
                <View style={styles.thumbnailStrip}>
                  {photos.map((photo, idx) => (
                    <TouchableWithoutFeedback
                      key={idx}
                      onPress={() => setPhotoIndex(idx)}
                    >
                      <View>
                        <ExpoImage
                          source={{ uri: photo }}
                          style={[
                            styles.thumbnailImage,
                            idx === (isTop ? photoIndex : 0) && styles.thumbnailImageActive,
                          ]}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                        />
                      </View>
                    </TouchableWithoutFeedback>
                  ))}
                </View>
              )}
              <View style={styles.userInfoContainer}>
                <View style={styles.nameRow}>
                  <Text style={styles.userName} numberOfLines={1}>
                    {user.name}
                  </Text>
                  <StreakBadge days={user.current_streak_days} />
                  <View style={styles.genderAgeBadge}>
                  {user.gender === "male" ? (
                    <Ionicons name="male" size={14} color="#5B9BD5" />
                  ) : user.gender === "female" ? (
                    <Ionicons name="female" size={14} color="#FF6B8A" />
                  ) : null}
                  <Text style={styles.ageText}>{age}</Text>
                </View>
                </View>
                <View style={styles.locationRow}>
                  <Image source={PinOutlineIcon} style={styles.pinIcon} />
                  <Text style={styles.locationText}>
                    {user.prefecture || "Not set"}
                    {getDistanceLabel(user)
                      ? ` · ${getDistanceLabel(user)}`
                      : ""}
                  </Text>
                </View>
                {(user.golf_skill_level || user.average_score) && (
                  <View style={styles.golfRow}>
                    <Ionicons name="golf" size={13} color="rgba(255,255,255,0.7)" />
                    <Text style={styles.golfText}>
                      {user.golf_skill_level}
                      {user.average_score ? ` · Avg ${user.average_score}` : ""}
                    </Text>
                  </View>
                )}
              </View>
            </LinearGradient>
          )}

          {isTop && (
            <View style={styles.tapZoneContainer} pointerEvents="box-none">
              <TouchableWithoutFeedback onPress={handleTapLeft}>
                <View style={styles.tapZoneLeft} />
              </TouchableWithoutFeedback>
              <TouchableWithoutFeedback onPress={handleTapCenter}>
                <View style={styles.tapZoneCenter} />
              </TouchableWithoutFeedback>
              <TouchableWithoutFeedback onPress={handleTapRight}>
                <View style={styles.tapZoneRight} />
              </TouchableWithoutFeedback>
            </View>
          )}
        </View>
      );
    };

    if (!currentUser) return null;

    return (
      <View style={[styles.container, { height: cardHeight }]}>
        {nextUser && (
          <Animated.View
            key={`back-${nextUser.id}`}
            style={[styles.cardWrapper, styles.backCardWrapper, backCardStyle]}
          >
            {renderCard(nextUser, false)}
          </Animated.View>
        )}

        <GestureDetector gesture={panGesture}>
          <Animated.View
            key={`top-${currentUser.id}`}
            style={[styles.cardWrapper, topCardStyle]}
          >
            {renderCard(currentUser, true)}
          </Animated.View>
        </GestureDetector>
      </View>
    );
  },
);

SwipeCardWithRef.displayName = "SwipeCardWithRef";

const styles = StyleSheet.create({
  container: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  cardWrapper: {
    position: "absolute",
    width: SCREEN_WIDTH - Spacing.md * 2,
    borderRadius: CARD_BORDER_RADIUS,
    overflow: "hidden",
  },
  backCardWrapper: {
    zIndex: -1,
  },
  card: {
    width: "100%",
    borderRadius: CARD_BORDER_RADIUS,
    overflow: "hidden",
    backgroundColor: Colors.gray[200],
  },
  photoIndicatorContainer: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    zIndex: 10,
    gap: 4,
  },
  photoIndicatorBar: {
    flex: 1,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  photoIndicatorBarActive: {
    backgroundColor: "rgba(255,255,255,0.95)",
  },
  stampOverlay: {
    position: "absolute",
    top: 60,
    zIndex: 5,
    borderWidth: 4,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  likeStamp: {
    left: 24,
    borderColor: Colors.primary,
    transform: [{ rotate: "-15deg" }],
  },
  likeStampText: {
    fontSize: Typography.fontSize["2xl"],
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.primary,
  },
  skipStamp: {
    right: 24,
    borderColor: Colors.gray[400],
    transform: [{ rotate: "15deg" }],
  },
  skipStampText: {
    fontSize: Typography.fontSize["2xl"],
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.gray[400],
  },
  gradientOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 20,
    paddingHorizontal: 16,
    paddingTop: Spacing["3xl"],
  },
  userInfoContainer: {
    gap: 5,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  userName: {
    fontSize: 22,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.white,
    flexShrink: 1,
  },
  badge: {
    width: 20,
    height: 20,
  },
  genderAgeBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: "auto",
    gap: 2,
  },
  ageText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
    color: "rgba(255,255,255,0.85)",
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  pinIcon: {
    width: 12,
    height: 16,
    tintColor: "rgba(255,255,255,0.85)",
    marginRight: Spacing.xs,
    resizeMode: "contain",
  },
  locationText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
    color: "rgba(255,255,255,0.85)",
  },
  golfRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 1,
  },
  golfText: {
    fontSize: 13,
    fontWeight: Typography.fontWeight.medium,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.medium),
    color: "rgba(255,255,255,0.7)",
  },
  tapZoneContainer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    zIndex: 2,
  },
  tapZoneLeft: {
    flex: 1,
  },
  tapZoneCenter: {
    flex: 1,
  },
  tapZoneRight: {
    flex: 1,
  },
  thumbnailStrip: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  thumbnailImage: {
    width: 44,
    height: 44,
    borderRadius: 10,
    opacity: 0.55,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  thumbnailImageActive: {
    opacity: 1,
    borderColor: "#FFFFFF",
  },
});

export default SwipeCard;
