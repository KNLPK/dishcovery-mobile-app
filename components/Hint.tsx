/**
 * components/Hint.tsx
 *
 * A one-time hint: a small callout that stays until the user dismisses it,
 * then never shows again (settings.hintsSeen). No animation of its own.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { palette, radius, spacing, type } from '../constants/theme';
import { markHintSeen, useSettings, type HintId } from '../src/settings/settings';
import { TextLink } from './Buttons';

export function Hint({
  id,
  text,
  action,
}: {
  id: HintId;
  text: string;
  /** An optional second link, e.g. "How to read this". Using it also dismisses the hint. */
  action?: { label: string; onPress: () => void };
}) {
  const seen = useSettings().hintsSeen.includes(id);
  if (seen) return null;
  return (
    <View style={styles.hint} accessibilityRole="summary" accessibilityLiveRegion="polite">
      <View style={styles.row}>
        <MaterialCommunityIcons name="lightbulb-on-outline" size={20} color={palette.primary} />
        <Text style={styles.text}>{text}</Text>
      </View>
      <View style={styles.actions}>
        {action !== undefined && (
          <TextLink
            label={action.label}
            onPress={() => {
              markHintSeen(id);
              action.onPress();
            }}
          />
        )}
        <TextLink label="Got it" onPress={() => markHintSeen(id)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: {
    backgroundColor: palette.surfaceCool,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.primary,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  text: { ...type.body, color: palette.ink, flex: 1 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
});
