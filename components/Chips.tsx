/**
 * components/Chips.tsx
 *
 * A row of single-choice chips (categories, cook time) that scrolls sideways
 * when it does not fit, and shows that it does: the row runs to the edge of
 * the screen, so the next chip is cut off there, and the right edge fades out
 * while there is more to scroll to. The fade is a few stacked strips of the
 * background colour (no gradient package), drawn only while it means
 * something, and it never moves on its own.
 *
 * Selected: dark teal fill, white label. Not selected: outline. The selected
 * chip is also announced as selected.
 */

import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { palette, radius, spacing, type } from '../constants/theme';

export type ChipOption<T extends string> = { value: T; label: string };

/** Opacity of each strip, from the inside of the fade to the screen edge. */
const FADE = [0.25, 0.5, 0.7, 0.85, 0.95];
const STRIP = 6;

export function ChipRow<T extends string>({
  options,
  selected,
  onSelect,
  background,
  gutter = spacing.lg,
  accessibilityLabel,
}: {
  options: readonly ChipOption<T>[];
  selected: T | null;
  onSelect: (value: T) => void;
  /** The colour behind the row, which the fade blends into. */
  background: string;
  /** The screen's side padding: the row bleeds through it to the edge. */
  gutter?: number;
  accessibilityLabel?: string;
}) {
  const [width, setWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [x, setX] = useState(0);
  const moreToTheRight = contentWidth - width - x > 2;

  return (
    <View style={{ marginHorizontal: -gutter }} accessibilityLabel={accessibilityLabel}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.row, { paddingHorizontal: gutter }]}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onContentSizeChange={(w) => setContentWidth(w)}
        onScroll={(e) => setX(e.nativeEvent.contentOffset.x)}
        scrollEventThrottle={32}
      >
        {options.map((option) => {
          const active = option.value === selected;
          return (
            <Pressable
              key={option.value}
              onPress={() => onSelect(option.value)}
              style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.pressed]}
              hitSlop={{ top: 4, bottom: 4 }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {moreToTheRight && (
        <View pointerEvents="none" style={styles.fade}>
          {FADE.map((opacity) => (
            <View key={opacity} style={{ width: STRIP, backgroundColor: background, opacity }} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: spacing.xs },
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  chipActive: { backgroundColor: palette.primary, borderColor: palette.primary },
  chipText: { ...type.label, fontSize: 14, lineHeight: 18, color: palette.primary },
  chipTextActive: { color: palette.surface },
  pressed: { opacity: 0.85 },
  fade: { position: 'absolute', top: 0, bottom: 0, right: 0, flexDirection: 'row' },
});
