import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { Typography } from '../constants/typography';

interface FullScreenTextEditorProps {
  visible: boolean;
  title: string;
  placeholder?: string;
  value: string;
  maxLength?: number;
  onSave: (text: string) => void;
  onClose: () => void;
}

export const FullScreenTextEditor: React.FC<FullScreenTextEditorProps> = ({
  visible,
  title,
  placeholder,
  value,
  maxLength,
  onSave,
  onClose,
}) => {
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);
  const initialValueRef = useRef('');

  // Only sync when modal OPENS (visible changes from false to true)
  useEffect(() => {
    if (visible) {
      // Store and set initial value when modal opens
      initialValueRef.current = value;
      setText(value);
      // Auto-focus with slight delay for modal animation
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]); // Only run when visibility changes, not when value changes

  const handleSave = () => {
    onSave(text);
    onClose();
  };

  const handleClose = () => {
    // Reset to the value that was present when modal opened
    setText(initialValueRef.current);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose} style={styles.headerButton}>
              <Text style={styles.cancelText}>キャンセル</Text>
            </TouchableOpacity>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={handleSave} style={styles.headerButton}>
              <Text style={styles.saveText}>完了</Text>
            </TouchableOpacity>
          </View>

          {/* Text Input */}
          <ScrollView
            style={styles.inputContainer}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.inputContentContainer}
          >
            <TextInput
              ref={inputRef}
              style={styles.textInput}
              placeholder={placeholder}
              placeholderTextColor={Colors.gray[400]}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={maxLength}
              textAlignVertical="top"
              autoFocus
              blurOnSubmit={false}
              scrollEnabled={false}
              selectionColor={Colors.primary}
            />
          </ScrollView>

          {/* Character Counter */}
          {maxLength && (
            <View style={styles.footer}>
              <Text style={styles.charCount}>
                {text.length.toLocaleString()} / {maxLength.toLocaleString()}
              </Text>
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
    backgroundColor: Colors.white,
  },
  headerButton: {
    minWidth: 80,
  },
  title: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold as any,
    color: Colors.text.primary,
  },
  cancelText: {
    fontSize: Typography.fontSize.base,
    color: Colors.gray[600],
  },
  saveText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold as any,
    color: Colors.primary,
    textAlign: 'right',
  },
  inputContainer: {
    flex: 1,
  },
  inputContentContainer: {
    flexGrow: 1,
    padding: Spacing.md,
    paddingBottom: 100, // Extra space at bottom for easier scrolling
  },
  textInput: {
    fontSize: Typography.fontSize.base,
    lineHeight: 26,
    color: Colors.text.primary,
    textAlignVertical: 'top',
    minHeight: 300, // Ensure good touch target
    paddingTop: 0, // Remove default iOS padding
    paddingBottom: 20,
  },
  footer: {
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[200],
    backgroundColor: Colors.white,
  },
  charCount: {
    fontSize: Typography.fontSize.sm,
    color: Colors.gray[500],
    textAlign: 'right',
  },
});

export default FullScreenTextEditor;
