/**
 * app/quick.tsx
 *
 * The Quick test: a one-minute benchmark on this phone, clearly labelled as
 * not the paper protocol. Runs on the bundled payloads by default, so it needs
 * no server. Results are saved apart from the paper runs and open in Results.
 */

import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { palette, radius, spacing, type } from '../constants/theme';
import { BENCHMARK_CONFIG } from '../shared/contract';
import { describeBaseUrl } from '../src/api/baseUrl';
import { describeRequestError } from '../src/api/errors';
import { captureEnvironment } from '../src/bench/environment';
import {
  QUICK_TEST_CONFIG,
  QUICK_TEST_LABEL,
  runQuickTest,
  type QuickProgress,
} from '../src/quick/quickTest';
import { listQuickTests, saveQuickTest } from '../src/quick/storage';

type SourceChoice = 'offline' | 'server';

export default function QuickTestScreen() {
  const router = useRouter();
  const [source, setSource] = useState<SourceChoice>('offline');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<QuickProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const stop = useRef(false);

  const environment = useMemo(() => captureEnvironment(null), []);
  const connection = describeBaseUrl();
  const c = QUICK_TEST_CONFIG;
  const decodes = c.payloadsPerTier * 3 * 3 * (c.warmupIterations + c.measuredIterations);

  useEffect(() => {
    listQuickTests().then((r) => setSavedCount(r.length));
  }, []);

  async function start() {
    setBusy(true);
    setError(null);
    stop.current = false;
    try {
      const result = await runQuickTest({
        source: source === 'offline' ? { kind: 'offline' } : { kind: 'server', baseUrl: connection.url },
        onProgress: setProgress,
        shouldStop: () => stop.current,
      });
      if (result === null) {
        setError('Stopped. Nothing was saved.');
        return;
      }
      await saveQuickTest(result);
      router.push({ pathname: '/results', params: { id: result.id } });
    } catch (err) {
      const failure = describeRequestError(err, 'run the Quick test');
      setError(`${failure.title} — ${failure.detail}${failure.hint ? ` ${failure.hint}` : ''}`);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Quick test</Text>
        <View style={{ width: 48 }} />
      </View>

      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>{QUICK_TEST_LABEL}</Text>
        <Text style={styles.bannerText}>
          A short version of the study&apos;s benchmark, to see the three formats compared on this
          phone in under a minute. Its numbers are indicative only and are never mixed with the
          paper&apos;s data.
        </Text>
      </View>

      <Text style={styles.section}>What it does</Text>
      <Text style={styles.body}>
        Decodes {c.payloadsPerTier * 3} recipe payloads ({c.payloadsPerTier} each of low, medium and
        high complexity) in JSON, MessagePack and Protocol Buffers, and measures decode time and the
        memory each decode allocates. {decodes.toLocaleString()} decodes in all.
      </Text>

      <View style={styles.table}>
        <View style={styles.tableRow}>
          <Text style={[styles.cellHead, styles.cellWide]} />
          <Text style={styles.cellHead}>Quick test</Text>
          <Text style={styles.cellHead}>Paper</Text>
        </View>
        {[
          ['Payloads', `${c.payloadsPerTier * 3}, generated`, '250 (100 Spoonacular)'],
          ['Engine pre-warm', `${c.prewarmDecodesPerFormat} / format`, `${BENCHMARK_CONFIG.prewarmDecodes} / format`],
          [
            'Per payload',
            `${c.warmupIterations} + ${c.measuredIterations} decodes`,
            `${BENCHMARK_CONFIG.warmupIterations} + ${BENCHMARK_CONFIG.measuredIterations} decodes`,
          ],
          ['Drift check, cooldown', 'none', 'enforced'],
        ].map(([label, quick, paper]) => (
          <View key={label} style={styles.tableRow}>
            <Text style={[styles.cell, styles.cellWide]}>{label}</Text>
            <Text style={styles.cell}>{quick}</Text>
            <Text style={styles.cell}>{paper}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.note}>
        Warm-up decodes are discarded; only the measured ones count. The timing and memory
        instruments are the same code the paper used.
      </Text>

      <Text style={styles.section}>Payloads from</Text>
      <View style={styles.choiceRow}>
        {(
          [
            ['offline', 'This app (offline)', 'Bundled with the app. No internet needed.'],
            ['server', 'The server', `Downloaded first from ${connection.url}.`],
          ] as const
        ).map(([value, label, detail]) => (
          <Pressable
            key={value}
            onPress={() => setSource(value)}
            disabled={busy}
            style={[styles.choice, source === value && styles.choiceActive]}
            accessibilityRole="radio"
            accessibilityState={{ selected: source === value, disabled: busy }}
          >
            <Text style={[styles.choiceLabel, source === value && styles.choiceLabelActive]}>{label}</Text>
            <Text style={styles.choiceDetail}>{detail}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.note}>
        Either way the bytes are identical and every payload is in memory before timing starts, so
        the network never affects the results.
      </Text>

      {environment.buildType !== 'release' && (
        <View style={styles.warn}>
          <Text style={styles.warnText}>
            This is a development build. Development checks slow every decode down, so the times
            will be higher than in the installed app.
          </Text>
        </View>
      )}

      <View style={styles.buttonRow}>
        <Pressable
          onPress={start}
          disabled={busy}
          style={[styles.primaryButton, busy && styles.disabled]}
          accessibilityRole="button"
        >
          <Text style={styles.primaryButtonText}>{busy ? 'Running…' : 'Start Quick test'}</Text>
        </Pressable>
        {busy && (
          <Pressable onPress={() => (stop.current = true)} style={styles.secondaryButton} accessibilityRole="button">
            <Text style={styles.secondaryButtonText}>Stop</Text>
          </Pressable>
        )}
        {!busy && savedCount > 0 && (
          <Pressable onPress={() => router.push('/results')} style={styles.secondaryButton} accessibilityRole="button">
            <Text style={styles.secondaryButtonText}>Past results ({savedCount})</Text>
          </Pressable>
        )}
      </View>

      {busy && progress !== null && (
        <View style={styles.progress}>
          <View style={styles.progressRow}>
            <ActivityIndicator color={palette.primary} />
            <Text style={styles.body}>
              {progress.phase === 'measuring'
                ? `Measuring payload ${progress.done} of ${progress.total}`
                : progress.label}
            </Text>
          </View>
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                { width: `${progress.phase === 'measuring' && progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` },
              ]}
            />
          </View>
          <Text style={styles.note}>Keep the app open; it takes about a minute.</Text>
        </View>
      )}

      {error !== null && (
        <Text style={styles.error} selectable>
          {error}
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.surfaceAlt },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  back: { ...type.label, color: palette.primary },
  title: { ...type.section, color: palette.ink },
  banner: {
    backgroundColor: palette.surfaceCool,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.accent,
    padding: spacing.md,
  },
  bannerTitle: { ...type.cardTitle, color: palette.primary },
  bannerText: { ...type.body, color: palette.body, marginTop: spacing.xs },
  section: { ...type.cardTitle, color: palette.ink, marginTop: spacing.xl, marginBottom: spacing.sm },
  body: { ...type.body, color: palette.body },
  note: { ...type.caption, color: palette.muted, marginTop: spacing.sm, lineHeight: 16 },
  table: {
    marginTop: spacing.md,
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  tableRow: { flexDirection: 'row', paddingVertical: 4, gap: spacing.sm },
  cellHead: { ...type.label, color: palette.muted, flex: 1 },
  cell: { ...type.caption, color: palette.body, flex: 1 },
  cellWide: { flex: 1.1, color: palette.ink },
  choiceRow: { gap: spacing.sm },
  choice: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
  },
  choiceActive: { borderColor: palette.primary, borderWidth: 2 },
  choiceLabel: { ...type.label, color: palette.body },
  choiceLabelActive: { color: palette.primary },
  choiceDetail: { ...type.caption, color: palette.muted, marginTop: 2 },
  warn: {
    marginTop: spacing.lg,
    backgroundColor: '#fdf6ec',
    borderColor: '#f0cfa0',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  warnText: { ...type.caption, color: palette.body, lineHeight: 16 },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xl },
  primaryButton: {
    backgroundColor: palette.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  primaryButtonText: { ...type.label, fontSize: 14, color: palette.surface },
  secondaryButton: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  secondaryButtonText: { ...type.label, fontSize: 14, color: palette.primary },
  disabled: { opacity: 0.5 },
  progress: { marginTop: spacing.lg },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  track: { height: 6, borderRadius: 3, backgroundColor: palette.surfaceTint, marginTop: spacing.sm, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: palette.accentDeep },
  error: { ...type.body, color: palette.danger, marginTop: spacing.lg },
});
