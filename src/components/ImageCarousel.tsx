import React, { useRef, useCallback, memo } from "react";
import {
  View,
  StyleSheet,
  Dimensions,
  ScrollView,
  Text,
  TouchableOpacity,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Animated,
} from "react-native";
import { Image as ExpoImage } from "expo-image";

import { Colors } from "../constants/colors";
import { Spacing, BorderRadius } from "../constants/spacing";
import { Typography } from "../constants/typography";

const { width } = Dimensions.get("window");

interface ImageCarouselProps {
  images: string[];
  style?: any;
  fullWidth?: boolean;
  aspectRatio?: number;
  containerWidth?: number; // Custom container width (for nested containers with margins)
}

// Fixed indicator height to prevent layout shifts
// marginTop (8px) + indicator height (8px) = 16px
const INDICATOR_ROW_HEIGHT = Spacing.sm + 8;

// Memoized indicator dot component - only re-renders when isActive changes
const IndicatorDot = memo(({
  isActive,
  onPress
}: {
  isActive: boolean;
  onPress: () => void;
}) => (
  <TouchableOpacity
    style={[
      styles.indicator,
      isActive && styles.activeIndicator,
    ]}
    onPress={onPress}
  />
), (prev, next) => prev.isActive === next.isActive);

// Memoized image item component - prevents re-renders during carousel scroll
const CarouselImage = memo(({
  uri,
  imageWidth,
  imageHeight,
  fullWidth
}: {
  uri: string;
  imageWidth: number;
  imageHeight: number;
  fullWidth: boolean;
}) => (
  <View style={{ width: imageWidth, height: imageHeight }}>
    <ExpoImage
      source={{ uri }}
      style={{
        width: "100%",
        height: "100%",
        borderRadius: fullWidth ? 0 : BorderRadius.md,
      }}
      contentFit="cover"
      cachePolicy="memory-disk"
      transition={0}
      placeholderContentFit="cover"
    />
  </View>
), (prev, next) =>
  prev.uri === next.uri &&
  prev.imageWidth === next.imageWidth &&
  prev.imageHeight === next.imageHeight
);

const ImageCarousel: React.FC<ImageCarouselProps> = memo(({
  images,
  style,
  fullWidth = false,
  aspectRatio: providedAspectRatio,
  containerWidth,
}) => {
  const scrollViewRef = useRef<ScrollView>(null);

  // Use ref to track current index without causing re-renders
  const currentIndexRef = useRef(0);

  // Animated value for indicator updates - avoids React state
  const scrollX = useRef(new Animated.Value(0)).current;

  const hasMultipleImages = images.length > 1;
  // Use containerWidth if provided, otherwise use screen width for fullWidth mode
  const effectiveWidth = containerWidth || width;
  const imageWidth = fullWidth ? effectiveWidth : (effectiveWidth - Spacing.md * 2) / 2;

  const getImageHeight = () => {
    if (!fullWidth) {
      return imageWidth * 0.75;
    }
    if (providedAspectRatio !== undefined && providedAspectRatio > 0) {
      return imageWidth / providedAspectRatio;
    }
    return imageWidth;
  };

  const imageHeight = getImageHeight();

  const containerHeight = hasMultipleImages
    ? imageHeight + INDICATOR_ROW_HEIGHT
    : imageHeight;

  const scrollToIndex = useCallback((index: number) => {
    currentIndexRef.current = index;
    scrollViewRef.current?.scrollTo({
      x: index * imageWidth,
      animated: true,
    });
  }, [imageWidth]);

  if (images.length === 0) {
    return null;
  }

  if (images.length === 1) {
    return (
      <View style={[styles.container, { height: containerHeight }, style]}>
        <ExpoImage
          source={{ uri: images[0] }}
          style={[
            {
              width: imageWidth,
              height: imageHeight,
              borderRadius: fullWidth ? 0 : BorderRadius.md,
            }
          ]}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={0}
          placeholderContentFit="cover"
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { height: containerHeight }, style]}>
      <Animated.ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        // Use Animated.event with native driver for smooth scroll tracking
        // This doesn't trigger React re-renders
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          {
            useNativeDriver: true,
            listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
              // Update ref for programmatic access (e.g., scrollToIndex)
              const index = Math.round(event.nativeEvent.contentOffset.x / imageWidth);
              currentIndexRef.current = index;
            }
          }
        )}
        style={[styles.scrollView, fullWidth && { borderRadius: 0 }]}
        // Optimize ScrollView performance
        removeClippedSubviews={true}
        decelerationRate="fast"
      >
        {images.map((image) => (
          <CarouselImage
            key={image}
            uri={image}
            imageWidth={imageWidth}
            imageHeight={imageHeight}
            fullWidth={fullWidth}
          />
        ))}
      </Animated.ScrollView>

      {/* Animated indicators - update without React state */}
      {hasMultipleImages && (
        <View style={styles.indicators}>
          {images.map((image, index) => {
            // Calculate animated opacity/scale for each indicator
            const inputRange = [
              (index - 1) * imageWidth,
              index * imageWidth,
              (index + 1) * imageWidth,
            ];

            const scale = scrollX.interpolate({
              inputRange,
              outputRange: [1, 1.2, 1],
              extrapolate: "clamp",
            });

            const opacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.5, 1, 0.5],
              extrapolate: "clamp",
            });

            return (
              <TouchableOpacity
                key={`indicator-${image}`}
                onPress={() => scrollToIndex(index)}
                activeOpacity={0.7}
              >
                <Animated.View
                  style={[
                    styles.indicator,
                    {
                      transform: [{ scale }],
                      opacity,
                      backgroundColor: Colors.primary,
                    },
                  ]}
                />
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Counter - uses Animated to derive current page without state */}
      {hasMultipleImages && (
        <View style={styles.counter}>
          <AnimatedCounter
            scrollX={scrollX}
            imageWidth={imageWidth}
            totalImages={images.length}
          />
        </View>
      )}
    </View>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.fullWidth === nextProps.fullWidth &&
    prevProps.aspectRatio === nextProps.aspectRatio &&
    prevProps.containerWidth === nextProps.containerWidth &&
    prevProps.images.length === nextProps.images.length &&
    prevProps.images.every((img, i) => img === nextProps.images[i])
  );
});

// Animated counter component - updates without React state
const AnimatedCounter = memo(({
  scrollX,
  imageWidth,
  totalImages
}: {
  scrollX: Animated.Value;
  imageWidth: number;
  totalImages: number;
}) => {
  // Create animated text nodes for each possible page number
  // This avoids state updates while showing the correct number
  return (
    <View style={styles.counterInner}>
      {Array.from({ length: totalImages }, (_, i) => {
        const inputRange = [
          (i - 0.5) * imageWidth,
          i * imageWidth,
          (i + 0.5) * imageWidth,
        ];

        const opacity = scrollX.interpolate({
          inputRange,
          outputRange: [0, 1, 0],
          extrapolate: "clamp",
        });

        return (
          <Animated.Text
            key={i}
            style={[
              styles.counterText,
              styles.counterTextAbsolute,
              { opacity },
            ]}
          >
            {i + 1} / {totalImages}
          </Animated.Text>
        );
      })}
      {/* Invisible text to maintain counter width */}
      <Text style={[styles.counterText, { opacity: 0 }]}>
        {totalImages} / {totalImages}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: "relative",
  },
  scrollView: {
    borderRadius: BorderRadius.md,
  },
  indicators: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: Spacing.sm,
    height: 8,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.gray[300],
    marginHorizontal: 4,
  },
  activeIndicator: {
    backgroundColor: Colors.primary,
  },
  counter: {
    position: "absolute",
    top: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  counterInner: {
    position: "relative",
  },
  counterText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: "600",
    fontFamily: Typography.getFontFamily("600"),
  },
  counterTextAbsolute: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
});

export default ImageCarousel;
