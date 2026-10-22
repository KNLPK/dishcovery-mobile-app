/**
 * app/about.tsx
 *
 * What the app is, where its recipes and photos come from, what stays on the
 * phone, and the links to the data. Reached from Profile.
 *
 * The photo credits are listed here in full (they match
 * docs/IMAGE_CREDITS.md), so they do not depend on a link to a branch.
 */

import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { SecondaryButton } from '../components/Buttons';
import { Screen, StackHeader } from '../components/Screen';
import { PAPER_RESULTS } from '../constants/paperResults.generated';
import { palette, radius, spacing, type } from '../constants/theme';

const SOURCE_URL = 'https://github.com/KNLPK/dishcovery-mobile-app';

/** [shown for, photographer], as in docs/IMAGE_CREDITS.md. */
const PHOTO_CREDITS: readonly (readonly [string, string])[] = [
  ['Chicken, duck, turkey', 'Anshu A'],
  ['Beef, lamb', 'Justus Menke'],
  ['Pork', 'Sebastian Coman Photography'],
  ['Fish and seafood', "Keesha's Kitchen"],
  ['Pasta, noodles', 'Ben Lei'],
  ['Rice', 'Vinn Koonyosying'],
  ['Eggs', 'Eiliv Aceron'],
  ['Salads, vegetables, tofu', 'Christine Isakzhanova'],
  ['Soups, stews, curries', 'Cala'],
  ['Desserts', 'Will Echols'],
  ['Bread, pancakes', 'nikldn'],
  ['Anything else', 'Maarten van den Heuvel'],
];

export default function AboutScreen() {
  const appName = Constants.expoConfig?.name ?? 'Dishcovery';
  const version = Constants.expoConfig?.version ?? '';

  return (
    <Screen background={palette.surfaceAlt}>
      <StackHeader title="About" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.appName}>{appName}</Text>
        {version !== '' && <Text style={styles.meta}>Version {version}</Text>}

        <Section title="What this app is">
          A recipe app built for an undergraduate thesis. It compares three ways of sending data to a
          phone (JSON, MessagePack and Protocol Buffers) by payload size, decode time and memory (heap
          allocation). The quick test lets you measure them on your own phone.
        </Section>

        <Section title="The recipes">
          The 150 recipes you can browse are the test recipes from the thesis dataset. They were written
          by an AI model (Google Gemini), not by cooks, and are marked as AI-generated on each recipe
          page. They have not been tested in a kitchen.
        </Section>

        <Section title="Your data">
          There are no accounts. Your name, saved recipes and quick test results are stored only on this
          phone. What you search for, and the ingredients you enter in Cook, are sent to the demo server
          so it can find recipes.
        </Section>

        <Text style={styles.sectionTitle}>Photos</Text>
        <Text style={styles.body}>
          The recipes have no photos of their own, so the app shows one of twelve food photos that matches
          the kind of dish, marked as illustrative. All are from Unsplash, under the Unsplash License.
        </Text>
        <View style={styles.credits}>
          {PHOTO_CREDITS.map(([dish, photographer]) => (
            <View key={dish} style={styles.creditRow}>
              <Text style={styles.creditDish}>{dish}</Text>
              <Text style={styles.creditName}>{photographer}</Text>
            </View>
          ))}
        </View>

        <View style={styles.links}>
          <SecondaryButton label="Paper data (DOI)" onPress={() => WebBrowser.openBrowserAsync(PAPER_RESULTS.doiUrl)} />
          <SecondaryButton label="Source code on GitHub" onPress={() => WebBrowser.openBrowserAsync(SOURCE_URL)} />
        </View>
      </ScrollView>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.body}>{children}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  appName: { ...type.title, color: palette.ink },
  meta: { ...type.caption, color: palette.muted, marginTop: 2 },
  sectionTitle: { ...type.cardTitle, color: palette.ink, marginTop: spacing.xl, marginBottom: spacing.xs },
  body: { ...type.body, color: palette.body },
  credits: {
    marginTop: spacing.md,
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  creditRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 4 },
  creditDish: { ...type.caption, color: palette.body, flex: 1 },
  creditName: { ...type.caption, color: palette.ink, flex: 1, textAlign: 'right' },
  links: { gap: spacing.sm, marginTop: spacing.xl },
});
