/**
 * EditableRow — single-line profile field row.
 *
 * Used by EditProfileScreen (and the onboarding flow eventually) to
 * render each field as a tappable row showing label + current value +
 * trailing affordance. Tapping opens a focused editor for that single
 * field. This pattern (Hinge / Tinder / Bumble) trades scroll depth for
 * focus: the main edit screen becomes scannable, and each editor has
 * room to provide the right control (date picker, list, prompt
 * suggestions, etc.) instead of cramming everything inline.
 *
 * States:
 *   - has value     -> show value, forward chevron, tappable
 *   - empty + opt   -> show muted placeholder, chevron, tappable
 *   - empty + req   -> show muted "Required" placeholder + red asterisk
 *                      in label, chevron, tappable
 *   - locked        -> show value (gray), lock icon, NOT tappable
 *                      (used for KYC-verified fields like gender / DOB)
 */

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../constants/colors";
import { Typography } from "../constants/typography";
import { Spacing, BorderRadius } from "../constants/spacing";

export interface EditableRowProps {
  label: string;
  /** Current display value. Empty string / null / undefined treated as empty. */
  value?: string | null;
  /** Shown muted when value is empty. Defaults to "Add". */
  placeholder?: string;
  required?: boolean;
  /** When true: row is not tappable; lock icon replaces chevron. */
  locked?: boolean;
  /** Hint text shown below the row (for locked-field explanations). */
  hint?: string;
  onPress?: () => void;
  /** Show a subtle filled green dot at trailing-left to mark completed fields. */
  showCompleted?: boolean;
  testID?: string;
}

export const EditableRow: React.FC<EditableRowProps> = ({
  label,
  value,
  placeholder = "Add",
  required = false,
  locked = false,
  hint,
  onPress,
  showCompleted = true,
  testID,
}) => {
  const hasValue = typeof value === "string" && value.trim().length > 0;
  const displayValue = hasValue ? value : placeholder;
  const tappable = !locked && typeof onPress === "function";

  return (
    <View>
      <TouchableOpacity
        testID={testID}
        style={styles.row}
        onPress={tappable ? onPress : undefined}
        activeOpacity={tappable ? 0.6 : 1}
        disabled={!tappable}
      >
        <View style={styles.labelColumn}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>{label}</Text>
            {required && !hasValue && (
              <Text style={styles.requiredIndicator}>*</Text>
            )}
          </View>
        </View>

        <View style={styles.valueColumn}>
          <Text
            style={[
              styles.value,
              !hasValue && styles.valuePlaceholder,
              locked && styles.valueLocked,
            ]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {displayValue}
          </Text>
          {showCompleted && hasValue && !locked && (
            <View style={styles.completedDot} />
          )}
          {locked ? (
            <Ionicons
              name="lock-closed"
              size={16}
              color={Colors.gray[400]}
              style={styles.trailingIcon}
            />
          ) : (
            <Ionicons
              name="chevron-forward"
              size={18}
              color={Colors.gray[400]}
              style={styles.trailingIcon}
            />
          )}
        </View>
      </TouchableOpacity>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.gray[50],
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.xs,
  },
  labelColumn: {
    flex: 0.4,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  label: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.gray[700],
    letterSpacing: 0.1,
  },
  requiredIndicator: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.error,
    marginLeft: Spacing.xs,
  },
  valueColumn: {
    flex: 0.6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  value: {
    flexShrink: 1,
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.text.primary,
    textAlign: "right",
  },
  valuePlaceholder: {
    color: Colors.gray[400],
  },
  valueLocked: {
    color: Colors.gray[500],
  },
  completedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.success,
    marginLeft: Spacing.sm,
  },
  trailingIcon: {
    marginLeft: Spacing.sm,
  },
  hint: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.gray[500],
    marginLeft: Spacing.md,
    marginBottom: Spacing.sm,
  },
});

export default EditableRow;
