import React, { memo, useCallback } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";

import { Colors } from "../constants/colors";
import { BorderRadius, Spacing } from "../constants/spacing";
import { YouTubeVideo } from "../utils/youtubeUtils";

const { width: screenWidth } = Dimensions.get("window");
const PLAYER_HEIGHT = screenWidth * (9 / 16); // 16:9 aspect ratio

interface YouTubeEmbedProps {
  video: YouTubeVideo;
  postId: string;
}

const YouTubeEmbed: React.FC<YouTubeEmbedProps> = ({ video, postId: _postId }) => {
  const watchUrl = `https://www.youtube.com/watch?v=${video.videoId}`;

  // Open in-app browser (SFSafariViewController) — no embed restrictions
  const handlePlay = useCallback(() => {
    WebBrowser.openBrowserAsync(watchUrl, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
    });
  }, [watchUrl]);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.thumbnailContainer}
        onPress={handlePlay}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="YouTube動画を再生"
      >
        <ExpoImage
          source={{ uri: video.thumbnailUrl }}
          style={styles.thumbnail}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={200}
        />
        <View style={styles.playOverlay}>
          <View style={styles.playButton}>
            <Ionicons name="play" size={32} color={Colors.white} style={styles.playIcon} />
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
    height: PLAYER_HEIGHT,
    backgroundColor: Colors.black,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    marginTop: Spacing.sm,
  },
  thumbnailContainer: {
    flex: 1,
  },
  thumbnail: {
    width: "100%",
    height: "100%",
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255, 0, 0, 0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
  playIcon: {
    marginLeft: 4, // Optical centering — play triangles look off-center without this
  },
});

export default memo(YouTubeEmbed, (prev, next) => {
  return (
    prev.video.videoId === next.video.videoId && prev.postId === next.postId
  );
});
