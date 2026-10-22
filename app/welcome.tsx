/**
 * app/welcome.tsx
 *
 * First launch only: three short cards on what the app is for, then an
 * optional "What should we call you?". The name is stored only on this phone
 * (src/settings/settings.ts) and shown on Home and in Profile; without one the
 * app says "Guest". Both steps can be skipped, and either way the welcome is
 * marked as seen and never shown again.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PrimaryButton, SecondaryButton, TextLink } from '../components/Buttons';
import { FormField, KeyboardForm } from '../components/KeyboardForm';
import { Screen } from '../components/Screen';
import { palette, spacing, type } from '../constants/theme';
import { markWelcomeSeen, setDisplayName } from '../src/settings/settings';

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
      'The quick test decodes 30 recipes in all three formats and shows the results. It usually takes ' +
      'under a minute and works offline. Start it from the top of the Home screen.',
  },
  {
    icon: 'chart-bar',
    title: 'Compare with the paper',
    body:
      'Results puts your phone next to the paper results: the numbers published with the study, with a ' +
      'link to the data.',
  },
] as const;

/** The step after the last card. */
const NAME_STEP = CARDS.length;

export default function WelcomeScreen() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [name, setName] = useState('');

  function finish(withName: boolean) {
    if (withName) setDisplayName(name);
    markWelcomeSeen();
    router.replace('/HomePage');
  }

  if (index === NAME_STEP) {
    return (
      <Screen background={palette.surface}>
        <KeyboardForm contentContainerStyle={styles.page}>
          <View style={styles.nameStep}>
          <View style={styles.nameBlock}>
            <MaterialCommunityIcons name="account-circle-outline" size={44} color={palette.primary} />
            <Text style={styles.title} accessibilityRole="header">
              What should we call you?
            </Text>
            <Text style={styles.nameBody}>
              Optional. It is shown on Home and in your profile, and stays on this phone.
            </Text>
            <FormField
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              autoFocus
              autoCapitalize="words"
              autoComplete="name"
              maxLength={40}
              returnKeyType="done"
              onSubmitEditing={() => finish(true)}
              accessibilityLabel="Your name, optional"
            />
          </View>
          <View style={styles.buttons}>
            <SecondaryButton label="Skip" onPress={() => finish(false)} />
            <PrimaryButton label="Continue" onPress={() => finish(true)} />
          </View>
          </View>
        </KeyboardForm>
      </Screen>
    );
  }

  const card = CARDS[index];
  return (
    <Screen background={palette.surface}>
      <View style={styles.topRow}>
        <Text style={styles.brand}>Dishcovery</Text>
        <TextLink label="Skip" onPress={() => setIndex(NAME_STEP)} accessibilityLabel="Skip introduction" />
      </View>

      <View style={styles.page}>
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
          {index > 0 && <SecondaryButton label="Back" onPress={() => setIndex(index - 1)} />}
          <PrimaryButton label="Next" onPress={() => setIndex(index + 1)} />
        </View>
      </View>
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
  // KeyboardForm's inner view fills the screen; this centres the step in it.
  nameStep: { flex: 1, justifyContent: 'center' },
  nameBlock: { gap: spacing.md },
  title: { ...type.title, color: palette.primary },
  body: { fontSize: 15, lineHeight: 22, color: palette.ink },
  nameBody: { fontSize: 15, lineHeight: 22, color: palette.body },
  dots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.xl },
  dot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: palette.primary },
  dotActive: { width: 20, backgroundColor: palette.primary },
  count: { ...type.caption, color: palette.muted, marginLeft: spacing.sm },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.xl },
});
