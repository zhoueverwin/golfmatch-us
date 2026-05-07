import React from "react";
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInputProps,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../constants/colors";
import { Typography } from "../constants/typography";

interface AuthInputProps extends TextInputProps {
  label: string;
  error?: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightIconPress?: () => void;
  isPassword?: boolean;
  showPassword?: boolean;
  onTogglePassword?: () => void;
}

const AuthInput: React.FC<AuthInputProps> = ({
  label,
  error,
  leftIcon,
  rightIcon,
  onRightIconPress,
  isPassword = false,
  showPassword = false,
  onTogglePassword,
  style,
  ...props
}) => {
  const getRightIcon = () => {
    if (isPassword) {
      return (
        <TouchableOpacity onPress={onTogglePassword} style={styles.iconButton}>
          <Ionicons
            name={showPassword ? "eye-off" : "eye"}
            size={20}
            color={Colors.gray[500]}
          />
        </TouchableOpacity>
      );
    }

    if (rightIcon) {
      return (
        <TouchableOpacity onPress={onRightIconPress} style={styles.iconButton}>
          <Ionicons name={rightIcon} size={20} color={Colors.gray[500]} />
        </TouchableOpacity>
      );
    }

    return null;
  };

  return (
    <View style={[styles.container, style]}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[styles.inputContainer, error && styles.inputContainerError]}
      >
        {leftIcon && (
          <View style={styles.leftIconContainer}>
            <Ionicons name={leftIcon} size={20} color={Colors.gray[500]} />
          </View>
        )}
        <TextInput
          style={[styles.input, leftIcon && styles.inputWithLeftIcon]}
          placeholderTextColor={Colors.gray[400]}
          secureTextEntry={isPassword && !showPassword}
          autoCorrect={false}
          {...props}
          testID={props.testID}
        />
        {getRightIcon()}
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    fontFamily: Typography.getFontFamily("600"),
    color: Colors.text.primary,
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  inputContainerError: {
    borderColor: Colors.error,
  },
  leftIconContainer: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: Colors.text.primary,
    paddingVertical: 0,
  },
  inputWithLeftIcon: {
    marginLeft: 0,
  },
  iconButton: {
    padding: 4,
  },
  errorText: {
    fontSize: 12,
    color: Colors.error,
    marginTop: 4,
    marginLeft: 4,
  },
});

export default AuthInput;
