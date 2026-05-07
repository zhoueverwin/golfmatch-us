import React, { useState, useEffect } from "react";
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TextInputProps,
} from "react-native";
import { Colors } from "../constants/colors";
import { Typography } from "../constants/typography";

interface PhoneInputProps extends TextInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
}

const PhoneInput: React.FC<PhoneInputProps> = ({
  label,
  value,
  onChangeText,
  error,
  ...rest
}) => {
  const [displayPhoneNumber, setDisplayPhoneNumber] = useState("");

  const formatPhoneNumber = (input: string) => {
    // Remove non-digit characters
    let digits = input.replace(/\D/g, "");

    // If starts with 0, remove it for Japanese numbers
    if (digits.startsWith("0")) {
      digits = digits.substring(1);
    }
    return digits;
  };

  const handleTextChange = (input: string) => {
    setDisplayPhoneNumber(input);
    const formatted = formatPhoneNumber(input);
    onChangeText("+81" + formatted);
  };

  // Effect to update display number if value changes externally (e.g., initial load)
  useEffect(() => {
    if (value && value.startsWith("+81")) {
      setDisplayPhoneNumber(value.replace("+81", ""));
    } else {
      setDisplayPhoneNumber("");
    }
  }, [value]);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrapper}>
        <View style={styles.countryCodeContainer}>
          <Text style={styles.countryCodeText}>🇯🇵 +81</Text>
        </View>
        <TextInput
          style={[styles.input, error && styles.inputError]}
          onChangeText={handleTextChange}
          value={displayPhoneNumber}
          placeholder="80-2258-2038"
          keyboardType="phone-pad"
          autoCapitalize="none"
          placeholderTextColor={Colors.text.secondary}
          {...rest}
        />
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    fontFamily: Typography.getFontFamily("600"),
    color: Colors.text.primary,
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  countryCodeContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
    height: 56,
  },
  countryCodeText: {
    fontSize: 16,
    color: Colors.text.primary,
  },
  input: {
    flex: 1,
    height: 56,
    paddingHorizontal: 16,
    fontSize: 16,
    color: Colors.text.primary,
  },
  inputError: {
    borderColor: Colors.error,
  },
  errorText: {
    color: Colors.error,
    fontSize: 12,
    marginTop: 4,
    marginLeft: 16,
  },
});

export default PhoneInput;
