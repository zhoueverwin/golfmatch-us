/**
 * NumberWheelPicker — iOS-style scroll wheel for numeric profile fields.
 *
 * Used by EditProfileScreen for height, years playing, best score.
 * Matches the existing visual language of the native DateTimePicker
 * used by BirthDatePicker, so users see one consistent pattern across
 * date and number selection.
 *
 * Implementation: FlatList with snap-to-interval. A static center
 * "band" overlay marks the selected row. Scrolling lands the selected
 * number in that band; tapping a number scrolls it to center.
 *
 * Why not @react-native-picker/picker? It's discouraged on iOS (poor
 * styling control) and would add a dependency. The FlatList approach is
 * ~120 LOC and behaves identically on iOS and Android.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { Colors } from "../constants/colors";
import { Spacing, BorderRadius } from "../constants/spacing";
import { Typography } from "../constants/typography";

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5; // odd so the center row is unambiguous
const LIST_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
// Half the list (rounded down to a whole item) — padding above the
// first item and below the last item so they can scroll into the
// center band.
const EDGE_PAD = ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2);

export interface NumberWheelPickerProps {
  visible: boolean;
  title: string;
  /** Current value as a string (matches formData shape). Empty -> defaultValue. */
  value: string;
  min: number;
  max: number;
  step?: number;
  /** Optional suffix shown next to each number (e.g. "yrs"). Ignored if formatValue is provided. */
  unit?: string;
  /**
   * Optional custom formatter for each row. Use this when a raw number
   * isn't the natural display (e.g. height stored as inches but shown
   * as 5' 10").
   */
  formatValue?: (n: number) => string;
  /** Where to start the wheel when value is empty. Defaults to middle. */
  defaultValue?: number;
  onSave: (value: string) => void;
  onClose: () => void;
}

export const NumberWheelPicker: React.FC<NumberWheelPickerProps> = ({
  visible,
  title,
  value,
  min,
  max,
  step = 1,
  unit,
  formatValue,
  defaultValue,
  onSave,
  onClose,
}) => {
  const numbers = useMemo(() => {
    // Generate by index (min + i*step) instead of accumulating, so
    // float steps like 0.1 don't drift after many iterations
    // (0.1 + 0.2 = 0.30000...004 etc). Then round each value to the
    // step's decimal precision so saved values are clean
    // ("5.3" not "5.299999999998").
    const arr: number[] = [];
    const decimals = step >= 1 ? 0 : Math.ceil(Math.log10(1 / step));
    const count = Math.round((max - min) / step) + 1;
    for (let i = 0; i < count; i++) {
      const raw = min + i * step;
      arr.push(Number(raw.toFixed(decimals)));
    }
    return arr;
  }, [min, max, step]);

  // Resolve the initial wheel index from the current value, falling back
  // to defaultValue (if in range) and finally to the midpoint.
  // Uses parseFloat + closest-match so decimal-step pickers (e.g. handicap
  // with step 0.1) land near the user's stored value even if it doesn't
  // line up exactly with a generated step.
  const initialIndex = useMemo(() => {
    const findClosest = (target: number) => {
      let best = 0;
      let bestDiff = Math.abs(numbers[0] - target);
      for (let i = 1; i < numbers.length; i++) {
        const d = Math.abs(numbers[i] - target);
        if (d < bestDiff) {
          best = i;
          bestDiff = d;
        }
      }
      return best;
    };
    const parsed = parseFloat(value);
    if (!Number.isNaN(parsed)) {
      return findClosest(parsed);
    }
    if (defaultValue !== undefined) {
      return findClosest(defaultValue);
    }
    return Math.floor(numbers.length / 2);
  }, [value, defaultValue, numbers]);

  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const listRef = useRef<FlatList<number>>(null);

  // Re-seed selection + scroll position when the picker opens. The
  // small setTimeout lets the FlatList finish layout before scrollToIndex.
  useEffect(() => {
    if (!visible) return;
    setSelectedIndex(initialIndex);
    const t = setTimeout(() => {
      listRef.current?.scrollToOffset({
        offset: initialIndex * ITEM_HEIGHT,
        animated: false,
      });
    }, 40);
    return () => clearTimeout(t);
  }, [visible, initialIndex]);

  const updateFromOffset = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(numbers.length - 1, idx));
    setSelectedIndex(clamped);
  };

  const handleItemPress = (idx: number) => {
    setSelectedIndex(idx);
    listRef.current?.scrollToOffset({
      offset: idx * ITEM_HEIGHT,
      animated: true,
    });
  };

  const handleApply = () => {
    onSave(String(numbers[selectedIndex]));
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.headerButton}>
              <Text style={styles.cancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={handleApply} style={styles.headerButton}>
              <Text style={styles.done}>Done</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.wheelContainer}>
            {/* Static center band — sits behind the FlatList, marks the
                selected row. pointerEvents=none so it doesn't block taps. */}
            <View pointerEvents="none" style={styles.centerBand} />

            <FlatList
              ref={listRef}
              data={numbers}
              keyExtractor={(n) => String(n)}
              showsVerticalScrollIndicator={false}
              snapToInterval={ITEM_HEIGHT}
              decelerationRate="fast"
              onMomentumScrollEnd={updateFromOffset}
              onScrollEndDrag={updateFromOffset}
              getItemLayout={(_, idx) => ({
                length: ITEM_HEIGHT,
                offset: ITEM_HEIGHT * idx,
                index: idx,
              })}
              contentContainerStyle={{
                paddingTop: EDGE_PAD,
                paddingBottom: EDGE_PAD,
              }}
              style={{ height: LIST_HEIGHT }}
              renderItem={({ item, index }) => {
                const isSelected = index === selectedIndex;
                return (
                  <TouchableOpacity
                    activeOpacity={0.6}
                    onPress={() => handleItemPress(index)}
                    style={styles.row}
                  >
                    <Text
                      style={[
                        styles.itemText,
                        isSelected && styles.itemTextSelected,
                      ]}
                    >
                      {formatValue
                        ? formatValue(item)
                        : `${item}${unit ? ` ${unit}` : ""}`}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "flex-end",
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
  wheelContainer: {
    height: LIST_HEIGHT,
    justifyContent: "center",
  },
  centerBand: {
    position: "absolute",
    top: EDGE_PAD,
    left: Spacing.lg,
    right: Spacing.lg,
    height: ITEM_HEIGHT,
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.md,
  },
  row: {
    height: ITEM_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  itemText: {
    fontSize: Typography.fontSize.lg,
    color: Colors.gray[400],
    fontFamily: Typography.fontFamily.regular,
  },
  itemTextSelected: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
  },
});

export default NumberWheelPicker;
