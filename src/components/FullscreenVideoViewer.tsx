import React, { useEffect } from "react";
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  StatusBar,
  Dimensions,
} from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { Colors } from "../constants/colors";

const { width, height } = Dimensions.get("window");

interface FullscreenVideoViewerProps {
  visible: boolean;
  videoUri: string | null;
  onClose: () => void;
}

const FullscreenVideoViewer: React.FC<FullscreenVideoViewerProps> = ({
  visible,
  videoUri,
  onClose,
}) => {
  // useVideoPlayer requires a non-null source at hook construction. Use a
  // dummy placeholder when no video is selected; we swap the real source
  // via replaceAsync the moment one becomes available.
  const source = videoUri || "https://placeholder.invalid/_.mp4";
  const player = useVideoPlayer(source, (p) => {
    p.loop = false;
  });

  // Swap source + autoplay when the user opens a video.
  useEffect(() => {
    if (!visible || !videoUri) return;
    let cancelled = false;
    (async () => {
      try {
        await player.replaceAsync(videoUri);
        if (!cancelled) {
          player.play();
        }
      } catch {
        // VideoView surfaces playback errors via its own native UI;
        // nothing actionable to do here.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, videoUri, player]);

  // Pause when the modal closes so audio doesn't keep playing.
  useEffect(() => {
    if (!visible) {
      try {
        player.pause();
      } catch {
        // Ignore — player may already be torn down.
      }
    }
  }, [visible, player]);

  if (!visible || !videoUri) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <StatusBar hidden />
      <View style={styles.container}>
        <VideoView
          style={styles.video}
          player={player}
          contentFit="contain"
          // Native iOS controls give scrubber + AirPlay + PiP for free and
          // feel right at home alongside the platform's other media UIs.
          nativeControls
          allowsFullscreen
          allowsPictureInPicture
        />
        <SafeAreaView style={styles.overlay} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close video"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={26} color={Colors.white} />
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  video: {
    width,
    height,
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  closeButton: {
    margin: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "flex-end",
  },
});

export default FullscreenVideoViewer;
