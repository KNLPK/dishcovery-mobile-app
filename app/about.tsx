/**
 * app/about.tsx
 *
 * The study behind the app (title and authors exactly as in the
 * reproducibility package's CITATION.cff), where the recipes and photos come
 * from, what stays on the phone, the links to the data and code, the app
 * version and the commit it was built from, and the licences. Reached from
 * Profile.
 *
 * The photo credits are listed here in full (they match
 * docs/IMAGE_CREDITS.md), so they do not depend on a link to a branch.
 */

import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { SecondaryButton, TextLink } from '../components/Buttons';
import { Screen, StackHeader } from '../components/Screen';
import { PAPER_RESULTS } from '../constants/paperResults.generated';
import { palette, radius, spacing, type } from '../constants/theme';

const APP_REPO = 'https://github.com/KNLPK/dishcovery-mobile-app';
const DATA_REPO = PAPER_RESULTS.source.repository;

/** From CITATION.cff in the reproducibility package (preferred-citation). */
const PAPER_TITLE =
  'Comparative Analysis of JSON, MessagePack, and Protocol Buffers on Performance Efficiency and ' +
  'Resource Utilization in AI-Powered Mobile E-Applications';
const AUTHORS = 'Kevin Nathanael, Michelle Daphne Langitan, Anderies';
const AFFILIATION = 'BINUS University';

/** [shown for, photographer], as in docs/IMAGE_CREDITS.md. */
const PHOTO_CREDITS: readonly (readonly [string, string])[] = [
  ['Desserts', 'Will Echols, Shoeib Abolhassani'],
  ['Noodles', 'Michele Blackwell, Zoshua Colah'],
  ['Chicken, duck, turkey', 'Anshu A, Annie Spratt'],
  ['Beef, lamb', 'Justus Menke, Davis Dai'],
  ['Pork', 'Sebastian Coman Photography, Zion C'],
  ['Fish and seafood', "Keesha's Kitchen, Lee Milo"],
  ['Eggs', 'Eiliv Aceron, Alex Bayev'],
  ['Pasta', 'Ben Lei, Aurora Song'],
  ['Rice', 'Vinn Koonyosying, Annie Spratt'],
  ['Curries', 'Rimsha Noor, Raman'],
  ['Soups, stews', 'Cala, Elena Leya'],
  ['Salads, vegetables, tofu', 'Christine Isakzhanova, Kuali Nenek'],
  ['Bread, pancakes', 'nikldn, Raychan'],
  ['Anything else', 'Maarten van den Heuvel, Stefan Vladimirov'],
];

export default function AboutScreen() {
  const appName = Constants.expoConfig?.name ?? 'Dishcovery';
  const version = Constants.expoConfig?.version ?? '';
  // Set by app.config.js for the demo build (docs/BRAND.md); absent otherwise.
  const commit = (Constants.expoConfig?.extra?.buildCommit as string | null | undefined) ?? null;

  return (
    <Screen background={palette.surfaceAlt}>
      <StackHeader title="About" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.appName}>{appName}</Text>
        <Text style={styles.meta} selectable>
          {version !== '' ? `Version ${version} · ` : ''}
          {commit !== null ? `Build commit ${commit.slice(0, 7)}` : 'Build commit not recorded in this build'}
        </Text>

        <Text style={styles.sectionTitle}>The study</Text>
        <View style={styles.card}>
          <Text style={styles.paperTitle}>{PAPER_TITLE}</Text>
          <Text style={styles.body}>{AUTHORS}</Text>
          <Text style={styles.meta}>{AFFILIATION}</Text>
          <TextLink
            label={`DOI ${PAPER_RESULTS.doi}`}
            accessibilityLabel={`Open the data on Zenodo, DOI ${PAPER_RESULTS.doi}`}
            onPress={() => WebBrowser.openBrowserAsync(PAPER_RESULTS.doiUrl)}
            style={styles.inlineLink}
          />
        </View>

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
          The recipes have no photos of their own, so the app shows one of 28 food photos that matches
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

        <Text style={styles.sectionTitle}>Code and data</Text>
        <View style={styles.links}>
          <SecondaryButton label="App source code (GitHub)" onPress={() => WebBrowser.openBrowserAsync(APP_REPO)} />
          <SecondaryButton
            label="Reproducibility package (GitHub)"
            onPress={() => WebBrowser.openBrowserAsync(DATA_REPO)}
          />
        </View>

        <Section title="Licences">
          The reproducibility package: code under the MIT License, data and results under Creative Commons
          Attribution 4.0 (CC BY 4.0). Food photos: Unsplash License.
        </Section>
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
  links: { gap: spacing.sm },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  paperTitle: { ...type.cardTitle, color: palette.ink },
  inlineLink: { alignSelf: 'flex-start', paddingHorizontal: 0 },
});
