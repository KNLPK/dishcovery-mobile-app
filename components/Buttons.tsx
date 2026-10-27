/**
 * components/Buttons.tsx
 *
 * The app's three buttons, and no others:
 *
 *   PrimaryButton    dark teal fill, white label: the one main action
 *   SecondaryButton  teal outline on the background: other actions
 *   TextLink         teal text, no box: small or inline actions
 *
 * There is deliberately no light-teal button: on phones it read as disabled.
 * Disabled is shown one way only, at half opacity. Every button is at least
 * 48 dp tall, and dims and shrinks a little while held (PressableScale).
 */

import { Feather } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { palette, radius, spacing, touchTarget, type } from '../constants/theme';
import BrandLoader from './BrandLoader';
import { PressableScale } from './motion';

type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Shows the brand loader (24) beside `busyLabel`, and ignores presses. */
  busy?: boolean;
  /** The label while busy, e.g. "Finding recipes…"; the normal label if left out. */
  busyLabel?: string;
  /** A Feather icon before the label, e.g. "x" on Cook's "Remove “Dessert”". */
  icon?: React.ComponentProps<typeof Feather>['name'];
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function PrimaryButton({ label, onPress, disabled = false, busy = false, busyLabel, style, accessibilityLabel }: ButtonProps) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || busy}
      style={[styles.base, styles.primary, disabled && styles.disabled, style]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || busy, busy }}
    >
      <View style={styles.content}>
        {busy && <BrandLoader size={24} tone="dark" />}
        <Text style={styles.primaryText}>{busy ? busyLabel ?? label : label}</Text>
      </View>
    </PressableScale>
  );
}

export function SecondaryButton({ label, onPress, disabled = false, busy = false, busyLabel, icon, style, accessibilityLabel }: ButtonProps) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || busy}
      style={[styles.base, styles.secondary, disabled && styles.disabled, style]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || busy, busy }}
    >
      <View style={styles.content}>
        {busy && <BrandLoader size={24} />}
        {!busy && icon !== undefined && <Feather name={icon} size={16} color={palette.primary} />}
        <Text style={styles.secondaryText}>{busy ? busyLabel ?? label : label}</Text>
      </View>
    </PressableScale>
  );
}

export function TextLink({
  label,
  onPress,
  style,
  accessibilityLabel,
}: Pick<ButtonProps, 'label' | 'onPress' | 'style' | 'accessibilityLabel'>) {
  return (
    <PressableScale
      onPress={onPress}
      style={[styles.link, style]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <Text style={styles.linkText}>{label}</Text>
    </PressableScale>
  );
}

const base = {
  minHeight: touchTarget,
  borderRadius: radius.pill,
  paddingHorizontal: spacing.xl,
  alignItems: 'center',
  justifyContent: 'center',
} as const;

/**
 * The same looks as plain style objects, for screens that lay out their own
 * Pressables (the benchmark runner has a couple of dozen): spread them into
 * the screen's StyleSheet so those buttons cannot drift from these.
 */
export const buttonLook = {
  primary: { ...base, backgroundColor: palette.primary },
  primaryText: { ...type.label, fontSize: 15, lineHeight: 20, color: palette.surface },
  secondary: { ...base, borderWidth: 1.5, borderColor: palette.primary, backgroundColor: 'transparent' },
  secondaryText: { ...type.label, fontSize: 15, lineHeight: 20, color: palette.primary },
} as const;

const styles = StyleSheet.create({
  base,
  primary: { backgroundColor: palette.primary },
  primaryText: buttonLook.primaryText,
  secondary: { borderWidth: 1.5, borderColor: palette.primary, backgroundColor: 'transparent' },
  secondaryText: buttonLook.secondaryText,
  disabled: { opacity: 0.5 },
  // Loader and label side by side while busy, 8 dp apart.
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  link: { minHeight: touchTarget, justifyContent: 'center', paddingHorizontal: spacing.sm },
  linkText: { ...type.label, fontSize: 14, lineHeight: 20, color: palette.primary, textDecorationLine: 'underline' },
});
