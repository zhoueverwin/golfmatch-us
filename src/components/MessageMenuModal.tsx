import React, { useEffect, useRef } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TouchableWithoutFeedback,
  Alert,
  Animated,
  PanResponder,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors } from "../constants/colors";
import { Spacing, BorderRadius } from "../constants/spacing";
import { Typography } from "../constants/typography";

const MODAL_HEIGHT = 220; // Approximate height of the modal content
const DISMISS_THRESHOLD = 80; // How far to drag before dismissing

export interface MessageMenuModalProps {
  visible: boolean;
  onClose: () => void;
  messageId: string;
  messageUserId: string;
  messageUserName: string;
  currentUserId: string;
  onBlock: () => void;
  onReport: () => void;
}

const MessageMenuModal: React.FC<MessageMenuModalProps> = ({
  visible,
  onClose,
  messageId,
  messageUserId,
  messageUserName,
  currentUserId,
  onBlock,
  onReport,
}) => {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(MODAL_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;

  // Pan responder for swipe-to-dismiss
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to vertical swipes downward
        return gestureState.dy > 5;
      },
      onPanResponderMove: (_, gestureState) => {
        // Only allow dragging downward
        if (gestureState.dy > 0) {
          dragY.setValue(gestureState.dy);
          // Fade overlay as user drags
          const newOpacity = Math.max(0, 1 - gestureState.dy / MODAL_HEIGHT);
          fadeAnim.setValue(newOpacity);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > DISMISS_THRESHOLD || gestureState.vy > 0.5) {
          // Dismiss if dragged far enough or fast enough
          dismissModal();
        } else {
          // Snap back
          Animated.parallel([
            Animated.spring(dragY, {
              toValue: 0,
              useNativeDriver: true,
              tension: 65,
              friction: 11,
            }),
            Animated.timing(fadeAnim, {
              toValue: 1,
              duration: 200,
              useNativeDriver: true,
            }),
          ]).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (visible) {
      // Reset drag position
      dragY.setValue(0);
      // Slide up and fade in
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 65,
          friction: 11,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Reset animations
      slideAnim.setValue(MODAL_HEIGHT);
      fadeAnim.setValue(0);
      dragY.setValue(0);
    }
  }, [visible, slideAnim, fadeAnim, dragY]);

  const dismissModal = () => {
    // Slide down and fade out before closing
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: MODAL_HEIGHT,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(dragY, {
        toValue: MODAL_HEIGHT,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  };

  const handleClose = () => {
    dismissModal();
  };

  // Don't show menu for own messages
  if (messageUserId === currentUserId) {
    return null;
  }

  const handleBlock = () => {
    handleClose();
    setTimeout(() => {
      Alert.alert(
        "ブロック",
        `${messageUserName}さんをブロックしますか？ブロックすると、この相手の投稿やメッセージが表示されなくなります。`,
        [
          { text: "キャンセル", style: "cancel" },
          {
            text: "ブロック",
            style: "destructive",
            onPress: () => {
              onBlock();
            },
          },
        ]
      );
    }, 250);
  };

  const handleReport = () => {
    handleClose();
    setTimeout(() => onReport(), 250);
  };

  // Combined transform for slide animation and drag gesture
  const translateY = Animated.add(slideAnim, dragY);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={styles.modalWrapper}>
        <TouchableWithoutFeedback onPress={handleClose}>
          <Animated.View style={[styles.overlay, { opacity: fadeAnim }]} />
        </TouchableWithoutFeedback>

        <Animated.View
          style={[
            styles.container,
            {
              paddingBottom: insets.bottom + Spacing.sm,
              transform: [{ translateY }],
            },
          ]}
          {...panResponder.panHandlers}
        >
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={handleBlock}
            activeOpacity={0.7}
          >
            <Ionicons name="ban-outline" size={20} color={Colors.text.primary} />
            <Text style={styles.menuText}>ブロック</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, styles.menuItemDanger]}
            onPress={handleReport}
            activeOpacity={0.7}
          >
            <Ionicons name="flag-outline" size={20} color={Colors.error} />
            <Text style={[styles.menuText, styles.menuTextDanger]}>通報</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, styles.cancelItem]}
            onPress={handleClose}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelText}>キャンセル</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalWrapper: {
    flex: 1,
    justifyContent: "flex-end",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  container: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingTop: Spacing.xs,
    paddingHorizontal: Spacing.md,
    marginHorizontal: Spacing.sm,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.xl,
  },
  handleContainer: {
    paddingVertical: Spacing.sm,
    alignItems: "center",
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: Colors.gray[300],
    borderRadius: 2,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  menuItemDanger: {
    borderBottomWidth: 0,
  },
  menuText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.text.primary,
    marginLeft: Spacing.sm,
  },
  menuTextDanger: {
    color: Colors.error,
  },
  cancelItem: {
    justifyContent: "center",
    marginTop: Spacing.xs,
    borderBottomWidth: 0,
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
  },
  cancelText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.text.secondary,
    textAlign: "center",
  },
});

export default MessageMenuModal;
