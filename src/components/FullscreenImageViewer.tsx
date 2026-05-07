import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Image,
  TouchableOpacity,
  Dimensions,
  StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Colors } from "../constants/colors";
import { Spacing, BorderRadius } from "../constants/spacing";
import { Typography } from "../constants/typography";

const { width, height } = Dimensions.get("window");

interface FullscreenImageViewerProps {
  visible: boolean;
  images: string[];
  initialIndex: number;
  onClose: () => void;
}

const FullscreenImageViewer: React.FC<FullscreenImageViewerProps> = ({
  visible,
  images,
  initialIndex,
  onClose,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [showControls, setShowControls] = useState(true);

  // Update currentIndex when initialIndex changes or modal becomes visible
  useEffect(() => {
    if (visible) {
      // Ensure initialIndex is within bounds
      const validIndex = Math.max(0, Math.min(initialIndex, images.length - 1));
      setCurrentIndex(validIndex);
      setShowControls(true); // Reset controls visibility when opening
    }
  }, [visible, initialIndex, images.length]);

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < images.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const toggleControls = () => {
    setShowControls(!showControls);
  };

  if (!visible || images.length === 0) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <StatusBar hidden />
      <View style={styles.container}>
        <TouchableOpacity
          style={styles.imageContainer}
          activeOpacity={1}
          onPress={toggleControls}
        >
          <Image
            source={{ uri: images[currentIndex] }}
            style={styles.image}
            resizeMode="contain"
          />
        </TouchableOpacity>

        {showControls && (
          <>
            {/* Close Button */}
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.white} />
            </TouchableOpacity>

            {/* Navigation Arrows */}
            {images.length > 1 && (
              <>
                {currentIndex > 0 && (
                  <TouchableOpacity
                    style={[styles.navButton, styles.prevButton]}
                    onPress={handlePrevious}
                  >
                    <Ionicons
                      name="chevron-back"
                      size={24}
                      color={Colors.white}
                    />
                  </TouchableOpacity>
                )}

                {currentIndex < images.length - 1 && (
                  <TouchableOpacity
                    style={[styles.navButton, styles.nextButton]}
                    onPress={handleNext}
                  >
                    <Ionicons
                      name="chevron-forward"
                      size={24}
                      color={Colors.white}
                    />
                  </TouchableOpacity>
                )}
              </>
            )}

            {/* Image Counter */}
            {images.length > 1 && (
              <View style={styles.counter}>
                <View style={styles.counterBackground}>
                  <Text style={styles.counterText}>
                    {currentIndex + 1} / {images.length}
                  </Text>
                </View>
              </View>
            )}
          </>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  imageContainer: {
    width: width,
    height: height,
    justifyContent: "center",
    alignItems: "center",
  },
  image: {
    width: width,
    height: height,
  },
  closeButton: {
    position: "absolute",
    top: 50,
    right: Spacing.md,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    borderRadius: 20,
    padding: Spacing.sm,
  },
  navButton: {
    position: "absolute",
    top: "50%",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    borderRadius: 25,
    padding: Spacing.sm,
    transform: [{ translateY: -25 }],
  },
  prevButton: {
    left: Spacing.md,
  },
  nextButton: {
    right: Spacing.md,
  },
  counter: {
    position: "absolute",
    bottom: 50,
    alignSelf: "center",
  },
  counterBackground: {
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  counterText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: "600",
    fontFamily: Typography.getFontFamily("600"),
  },
});

export default FullscreenImageViewer;
