/**
 * app/welcome.tsx
 *
 * The tutorial: four steps with progress dots, Back, Skip and Next. Shown on
 * first launch, and again from "Replay tutorial" in Profile and About.
 *
 *   1  what Dishcovery is
 *   2  the three formats, as letters and forms
 *   3  what the quick test measures
 *   4  an optional name, then "Run a quick test now" or "Browse recipes"
 *
 * Skip jumps to step 4. The name is stored only on this phone
 * (src/settings/settings.ts) and shown on Home and in Profile; without one the
 * app says "Guest". Either action marks the tutorial as seen.
 */

import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton, SecondaryButton, TextLink } from '../components/Buttons';
import { FormField, KeyboardForm } from '../components/KeyboardForm';
import { Screen } from '../components/Screen';
import { formatColors, palette, spacing, type } from '../constants/theme';
import { QUICK_TEST_CONFIG } from '../src/quick/quickTest';
import { getSettings, markWelcomeSeen, setDisplayName } from '../src/settings/settings';

const QUICK_TEST_RECIPES = QUICK_TEST_CONFIG.payloadsPerTier * 3;

/** The three formats as a letter, a packed letter and a form (step 2). */
const ANALOGIES = [
  {
    color: formatColors.json,
    name: 'JSON',
    text: 'is a readable letter. Every field is written out with its name, so people and programs can both read it.',
  },
  {
    color: formatColors.msgpack,
    name: 'MessagePack',
    text: 'is the same letter packed tighter: the same fields and names, written in a compact code instead of text.',
  },
  {
    color: formatColors.protobuf,
    name: 'Protocol Buffers',
    text: 'is a form with fixed fields. Both sides already have the form, so only the field numbers and the answers are sent.',
  },
] as const;

/** Illustrations exported from assets/brand/welcome-*.svg (docs/BRAND.md). */
const STEPS = [
  {
    image: require('../assets/brand/welcome-intro.png'),
    title: 'Recipes, and a speed test',
    body:
      'Dishcovery is a recipe app: browse, search, or find recipes for what you have. It also measures how ' +
      'fast your phone reads the data each recipe arrives in.',
  },
  {
    image: require('../assets/brand/welcome-formats.png'),
    title: 'Three ways to send a recipe',
    body: 'The recipe is the same in all three; only the packing differs.',
  },
  {
    image: require('../assets/brand/welcome-test.png'),
    title: 'The quick test',
    body:
      `It decodes ${QUICK_TEST_RECIPES} recipes in all three formats and measures three things: payload size ` +
      '(how much data), decode time (how long your phone takes to read it) and memory (how much the app ' +
      'allocates while reading). It usually takes under a minute and works offline.',
  },
  {
    image: require('../assets/brand/welcome-start.png'),
    title: 'What should we call you?',
    body: 'Optional. It is shown on Home and in your profile, and stays on this phone.',
  },
] as const;

const LAST = STEPS.length - 1;

export default function WelcomeScreen() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  // Prefilled when the tutorial is replayed.
  const [name, setName] = useState(() => getSettings().displayName);

  function finish(next: 'quick' | 'browse') {
    setDisplayName(name);
    markWelcomeSeen();
    router.replace('/HomePage');
    if (next === 'quick') router.push('/quick');
  }

  const step = STEPS[index];
  return (
    <Screen background={palette.surface}>
      <View style={styles.topRow}>
        <Text style={styles.brand}>Dishcovery</Text>
        {index < LAST && (
          <TextLink label="Skip" onPress={() => setIndex(LAST)} accessibilityLabel="Skip the tutorial" />
        )}
      </View>

      <KeyboardForm contentContainerStyle={styles.page}>
        <View style={styles.card} accessibilityLiveRegion="polite">
          <Image source={step.image} style={styles.illustration} resizeMode="contain" accessibilityIgnoresInvertColors />
          <Text style={styles.title} accessibilityRole="header">
            {step.title}
          </Text>
          {index === 1 &&
            ANALOGIES.map((a) => (
              <View key={a.name} style={styles.analogy}>
                <View style={[styles.swatch, { backgroundColor: a.color }]} />
                <Text style={styles.body}>
                  <Text style={styles.formatName}>{a.name}</Text> {a.text}
                </Text>
              </View>
            ))}
          <Text style={index === LAST ? styles.nameBody : styles.body}>{step.body}</Text>
          {index === LAST && (
            <FormField
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              autoCapitalize="words"
              autoComplete="name"
              maxLength={40}
              returnKeyType="done"
              accessibilityLabel="Your name, optional"
            />
          )}
        </View>

        <View style={styles.dots} accessibilityLabel={`Step ${index + 1} of ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <View key={s.title} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
          <Text style={styles.count}>
            {index + 1} of {STEPS.length}
          </Text>
        </View>

        {index < LAST ? (
          <View style={styles.buttons}>
            {index > 0 && <SecondaryButton label="Back" onPress={() => setIndex(index - 1)} />}
            <PrimaryButton label="Next" onPress={() => setIndex(index + 1)} />
          </View>
        ) : (
          <View style={styles.actions}>
            <PrimaryButton label="Run a quick test now" onPress={() => finish('quick')} />
            <SecondaryButton label="Browse recipes" onPress={() => finish('browse')} />
            <TextLink label="Back" onPress={() => setIndex(index - 1)} style={styles.back} />
          </View>
        )}
      </KeyboardForm>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: {
    flexGrow: 1,
    padding: spacing.xl,
    justifyContent: 'center',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 48,
    paddingLeft: spacing.xl,
    paddingRight: spacing.md,
    paddingTop: spacing.sm,
  },
  brand: { ...type.section, color: palette.primary },
  card: {
    backgroundColor: palette.surfaceCool,
    borderRadius: 18,
    padding: spacing.xl,
    gap: spacing.md,
  },
  illustration: { width: '100%', aspectRatio: 16 / 9 },
  title: { ...type.title, color: palette.primary },
  body: { fontSize: 15, lineHeight: 22, color: palette.ink, flexShrink: 1 },
  nameBody: { fontSize: 15, lineHeight: 22, color: palette.body },
  analogy: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  swatch: { width: 12, height: 12, borderRadius: 3, marginTop: 5 },
  formatName: { fontWeight: '700' },
  dots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.xl },
  dot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: palette.primary },
  dotActive: { width: 20, backgroundColor: palette.primary },
  count: { ...type.caption, color: palette.muted, marginLeft: spacing.sm },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.xl },
  actions: { gap: spacing.sm, marginTop: spacing.xl },
  back: { alignSelf: 'center' },
});
