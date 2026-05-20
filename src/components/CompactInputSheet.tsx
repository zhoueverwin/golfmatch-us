/**
 * CompactInputSheet — small bottom-sheet single-line text input.
 *
 * For fields where FullScreenTextEditor's page-sheet is overkill
 * (Name, Average Score before it became a wheel — anything that's
 * one short line). Matches the visual language of NumberWheelPicker:
 * slide-up bottom sheet, Cancel | Title | Done header, then the
 * control. Keyboard pushes the sheet up.
 *
 * Bio still uses FullScreenTextEditor because the multi-paragraph
 * surface area genuinely benefits from the larger layout.
 */

import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Colors } from "../constants/colors";
import { Spacing, BorderRadius } from "../constants/spacing";
import { Typography } from "../constants/typography";

export interface CompactInputSheetProps {
  visible: boolean;
  title: string;
  placeholder?: string;
  value: string;
  maxLength?: number;
  keyboardType?: "default" | "number-pad" | "decimal-pad" | "email-address";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  onSave: (text: string) => void;
  onClose: () => void;
}

export const CompactInputSheet: React.FC<CompactInputSheetProps> = ({
  visible,
  title,
  placeholder,
  value,
  maxLength,
  keyboardType = "default",
  autoCapitalize = "sentences",
  onSave,
  onClose,
}) => {
  const [text, setText] = useState("");
  const inputRef = useRef<TextInput>(null);
  const initialValueRef = useRef("");

  useEffect(() => {
    if (!visible) return;
    initialValueRef.current = value;
    setText(value);
    // Slight delay so focus lands after the modal slide-in animation.
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [visible, value]);

  const handleSave = () => {
    onSave(text);
    onClose();
  };

  const handleCancel = () => {
    setText(initialValueRef.current);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleCancel}
    >
      <TouchableWithoutFeedback onPress={handleCancel}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              style={styles.keyboardWrapper}
            >
              <View style={styles.sheet}>
                <View style={styles.header}>
                  <TouchableOpacity
                    onPress={handleCancel}
                    style={styles.headerButton}
                  >
                    <Text style={styles.cancel}>Cancel</Text>
                  </TouchableOpacity>
                  <Text style={styles.title}>{title}</Text>
                  <TouchableOpacity
                    onPress={handleSave}
                    style={styles.headerButton}
                  >
                    <Text style={styles.done}>Done</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.inputWrapper}>
                  <TextInput
                    ref={inputRef}
                    style={styles.input}
                    value={text}
                    onChangeText={(next) =>
                      // Strip newlines — this is single-line, return = Done.
                      setText(next.replace(/[\r\n]+/g, ""))
                    }
                    placeholder={placeholder}
                    placeholderTextColor={Colors.gray[400]}
                    maxLength={maxLength}
                    keyboardType={keyboardType}
                    autoCapitalize={autoCapitalize}
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={handleSave}
                    selectionColor={Colors.primary}
                  />
                </View>

                {maxLength && (
                  <Text style={styles.charCount}>
                    {text.length} / {maxLength}
                  </Text>
                )}
              </View>
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "flex-end",
  },
  keyboardWrapper: {
    // No flex — let the sheet hug its content.
  },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingBottom: Spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  headerButton: {
    minWidth: 70,
    paddingVertical: Spacing.xs,
  },
  title: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
  },
  cancel: {
    fontSize: Typography.fontSize.base,
    color: Colors.gray[600],
  },
  done: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.primary,
    textAlign: "right",
  },
  inputWrapper: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  input: {
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.primary,
  },
  charCount: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.gray[500],
    textAlign: "right",
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xs,
  },
});

export default CompactInputSheet;
