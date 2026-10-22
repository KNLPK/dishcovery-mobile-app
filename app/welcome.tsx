/**
 * app/welcome.tsx
 *
 * First launch only: three short cards on what the app is for. Skippable at
 * any point; either way it is marked as seen and never shown again.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette, radius, spacing, touchTarget, type } from '../constants/theme';
import { markWelcomeSeen } from '../src/settings/settings';

const CARDS = [
  {
    icon: 'scale-balance',
    title: 'Three ways to send a recipe',
    body:
      'Dishcovery is a recipe app built for a study. Every recipe can travel as JSON, MessagePack or ' +
      'Protocol Buffers, and the app measures how long your phone takes to decode each one, how much ' +
      'memory that uses, and how big the data is.',
  },
  {
    icon: 'timer-outline',
    title: 'Test it on your phone',
    body:
      'The Quick test decodes 30 recipes in all three formats and shows the results. It usually takes ' +
      'under a minute and works offline. Start it from the top of the Home screen.',
  },
  {
    icon: 'chart-bar',
    title: 'Compare with the paper',
    body:
      'Results puts your phone next to the numbers published with the study, and the Paper results tab ' +
      'shows the full tables with a link to the data.',
  },
] as const;

export default function WelcomeScreen() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const card = CARDS[index];
  const last = index === CARDS.length - 1;
  const insets = useSafeAreaInsets();

  function finish() {
    markWelcomeSeen();
    router.replace('/');
  }

  return (
    <View style={[styles.page, { paddingBottom: spacing.xl + insets.bottom }]}>
      <View style={[styles.topRow, { top: insets.top + spacing.lg }]}>
        <Text style={styles.brand}>Dishcovery</Text>
        {!last && (
          <Pressable onPress={finish} style={styles.skip} accessibilityRole="button" accessibilityLabel="Skip introduction">
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.card} accessibilityLiveRegion="polite">
        <MaterialCommunityIcons name={card.icon} size={44} color={palette.primary} />
        <Text style={styles.title} accessibilityRole="header">
          {card.title}
        </Text>
        <Text style={styles.body}>{card.body}</Text>
      </View>

      <View style={styles.dots} accessibilityLabel={`Card ${index + 1} of ${CARDS.length}`}>
        {CARDS.map((c, i) => (
          <View key={c.title} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
        <Text style={styles.count}>
          {index + 1} of {CARDS.length}
        </Text>
      </View>

      <View style={styles.buttons}>
        {index > 0 && (
          <Pressable onPress={() => setIndex(index - 1)} style={styles.secondaryButton} accessibilityRole="button">
            <Text style={styles.secondaryButtonText}>Back</Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => (last ? finish() : setIndex(index + 1))}
          style={styles.primaryButton}
          accessibilityRole="button"
        >
          <Text style={styles.primaryButtonText}>{last ? 'Get started' : 'Next'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: palette.surface,
    padding: spacing.xl,
    justifyContent: 'center',
  },
  topRow: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brand: { ...type.section, color: palette.primary },
  skip: { minHeight: touchTarget, minWidth: touchTarget, justifyContent: 'center', alignItems: 'flex-end' },
  skipText: { ...type.label, fontSize: 14, color: palette.primary },
  card: {
    backgroundColor: palette.accent,
    borderRadius: 18,
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: { ...type.title, color: palette.primary },
  body: { fontSize: 15, lineHeight: 22, color: palette.primary },
  dots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.xl },
  dot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: palette.primary },
  dotActive: { width: 20, backgroundColor: palette.primary },
  count: { ...type.caption, color: palette.muted, marginLeft: spacing.sm },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.xl },
  primaryButton: {
    minHeight: touchTarget,
    justifyContent: 'center',
    backgroundColor: palette.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
  },
  primaryButtonText: { ...type.label, fontSize: 15, color: palette.surface },
  secondaryButton: {
    minHeight: touchTarget,
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    borderWidth: 1,
    borderColor: palette.border,
  },
  secondaryButtonText: { ...type.label, fontSize: 15, color: palette.primary },
});
