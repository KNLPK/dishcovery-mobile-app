/**
 * components/Chips.tsx
 *
 * A row of single-choice chips (categories, cook time) that scrolls sideways
 * when it does not fit, and shows that it does: the row runs to the edge of
 * the screen, so the next chip is cut off there, and the right edge fades out
 * while a chip is cut off. The fade is a few stacked strips of the background
 * colour (no gradient package), and it never moves on its own.
 *
 * The fade is measured against the chips themselves, not the row: it is drawn
 * only when some chip actually runs past the right edge, and it is never
 * wider than the space between the last whole chip and that edge, so it can
 * only ever dim the chip that is cut off. A row that fits (Cook time) has no
 * fade at all.
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
/** Narrower than this, a fade reads as a smudge; the cut-off chip says enough. */
const MIN_FADE = 10;

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
  const [x, setX] = useState(0);
  // Each chip's left and right edge in the scrolling content, by position.
  const [edges, setEdges] = useState<readonly (readonly [number, number])[]>([]);

  const visibleRight = x + width;
  const measured = width > 0 && edges.length === options.length && Array.from(edges).every(Boolean);
  const cutOff = measured && edges.some(([, right]) => right > visibleRight + 0.5);
  // Right edge of the last chip still wholly in view (or the row's start).
  const lastWhole = measured
    ? Math.max(x, ...edges.filter(([, right]) => right <= visibleRight + 0.5).map(([, right]) => right))
    : visibleRight;
  const fadeWidth = Math.min(STRIP * FADE.length, visibleRight - lastWhole);
  const showFade = cutOff && fadeWidth >= MIN_FADE;

  return (
    <View style={{ marginHorizontal: -gutter }} accessibilityLabel={accessibilityLabel}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.row, { paddingHorizontal: gutter }]}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onScroll={(e) => setX(e.nativeEvent.contentOffset.x)}
        scrollEventThrottle={32}
      >
        {options.map((option, i) => {
          const active = option.value === selected;
          return (
            <Pressable
              key={option.value}
              onLayout={(e) => {
                const { x: left, width: w } = e.nativeEvent.layout;
                setEdges((prev) => {
                  const next = [...prev];
                  next[i] = [left, left + w];
                  return next.slice(0, options.length);
                });
              }}
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
      {showFade && (
        <View pointerEvents="none" style={styles.fade}>
          {FADE.map((opacity) => (
            <View key={opacity} style={{ width: fadeWidth / FADE.length, backgroundColor: background, opacity }} />
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
