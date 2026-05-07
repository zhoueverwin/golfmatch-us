/**
 * CourseTypeSelector Component
 *
 * Simple 3-button toggle for selecting which holes to play:
 * - OUT: Front 9 (アウト) - holes 1-9
 * - IN: Back 9 (イン) - holes 10-18
 * - THROUGH: Full 18 holes (スルー)
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Colors } from '../constants/colors';
import { Spacing, BorderRadius } from '../constants/spacing';
import { Typography } from '../constants/typography';
import { CourseType } from '../types/recruitment';

interface CourseTypeSelectorProps {
  value: CourseType;
  onChange: (type: CourseType) => void;
  disabled?: boolean;
}

interface CourseTypeOption {
  value: CourseType;
  label: string;
  description: string;
}

const OPTIONS: CourseTypeOption[] = [
  { value: 'OUT', label: 'OUT', description: '1-9番' },
  { value: 'IN', label: 'IN', description: '10-18番' },
  { value: 'THROUGH', label: 'スルー', description: '18ホール' },
];

const CourseTypeSelector: React.FC<CourseTypeSelectorProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  return (
    <View style={styles.container}>
      {OPTIONS.map((option, index) => {
        const isSelected = value === option.value;
        const isFirst = index === 0;
        const isLast = index === OPTIONS.length - 1;

        return (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.option,
              isSelected && styles.optionSelected,
              isFirst && styles.optionFirst,
              isLast && styles.optionLast,
              disabled && styles.optionDisabled,
            ]}
            onPress={() => !disabled && onChange(option.value)}
            activeOpacity={disabled ? 1 : 0.7}
          >
            <Text style={[
              styles.label,
              isSelected && styles.labelSelected,
              disabled && styles.labelDisabled,
            ]}>
              {option.label}
            </Text>
            <Text style={[
              styles.description,
              isSelected && styles.descriptionSelected,
              disabled && styles.descriptionDisabled,
            ]}>
              {option.description}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  option: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.md,
    backgroundColor: Colors.white,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
  },
  optionFirst: {
    borderTopLeftRadius: BorderRadius.lg - 1,
    borderBottomLeftRadius: BorderRadius.lg - 1,
  },
  optionLast: {
    borderTopRightRadius: BorderRadius.lg - 1,
    borderBottomRightRadius: BorderRadius.lg - 1,
    borderRightWidth: 0,
  },
  optionSelected: {
    backgroundColor: Colors.primary,
  },
  optionDisabled: {
    backgroundColor: Colors.gray[100],
  },
  label: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    marginBottom: 2,
  },
  labelSelected: {
    color: Colors.white,
  },
  labelDisabled: {
    color: Colors.gray[400],
  },
  description: {
    fontSize: Typography.fontSize.xs,
    color: Colors.gray[500],
  },
  descriptionSelected: {
    color: Colors.white,
    opacity: 0.8,
  },
  descriptionDisabled: {
    color: Colors.gray[400],
  },
});

export default CourseTypeSelector;
