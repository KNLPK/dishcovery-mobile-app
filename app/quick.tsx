/**
 * app/quick.tsx
 *
 * The Quick test: a short benchmark on this phone, clearly labelled as
 * not the paper protocol. Runs on the bundled payloads by default, so it needs
 * no server. Results are saved apart from the paper runs and open in Results.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { buttonLook } from '../components/Buttons';
import { FadeIn, PressableScale, tapHaptic } from '../components/motion';
import { Screen, StackHeader } from '../components/Screen';
import { palette, radius, spacing, touchTarget, type } from '../constants/theme';
import { BENCHMARK_CONFIG } from '../shared/contract';
import { serverBaseUrl } from '../src/api/baseUrl';
import { describeRequestError } from '../src/api/errors';
import { captureEnvironment } from '../src/bench/environment';
import {
  QUICK_TEST_CONFIG,
  QUICK_TEST_LABEL,
  runQuickTest,
  type QuickProgress,
  type QuickTestResult,
} from '../src/quick/quickTest';
import { listQuickTests, saveQuickTest } from '../src/quick/storage';
import { FORMAT_NAMES, tierSummary } from '../src/quick/summary';
import { showToast } from '../src/ui/toast';

type SourceChoice = 'offline' | 'server';

const TIER_NAMES = { low: 'Low', medium: 'Medium', high: 'High' } as const;

/** Remaining time from the rate so far; null until measuring is under way. */
function remainingSeconds(p: QuickProgress, elapsedMs: number): number | null {
  if (p.phase !== 'measuring' || p.fraction <= 0.22 || p.fraction >= 1) return null;
  return Math.max(1, Math.round(((elapsedMs / p.fraction) * (1 - p.fraction)) / 1000));
}

/** "8 s", or "1 min 5 s" from a minute up. */
function describeDuration(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

function describeRemaining(seconds: number | null): string {
  if (seconds === null) return 'Estimating time left…';
  if (seconds < 60) return `About ${seconds} s left`;
  return `About ${Math.round(seconds / 60)} min left`;
}

export default function QuickTestScreen() {
  const router = useRouter();
  const [source, setSource] = useState<SourceChoice>('offline');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<QuickProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const stop = useRef(false);
  const [stopping, setStopping] = useState(false);
  const startedAt = useRef(0);
  const [now, setNow] = useState(0);
  // The completion moment: shown after a run, until the next one starts.
  const [finished, setFinished] = useState<QuickTestResult | null>(null);

  const environment = useMemo(() => captureEnvironment(null), []);
  const serverUrl = serverBaseUrl();
  const c = QUICK_TEST_CONFIG;
  const decodes = c.payloadsPerTier * 3 * 3 * (c.warmupIterations + c.measuredIterations);

  useEffect(() => {
    listQuickTests().then((r) => setSavedCount(r.length));
  }, []);

  // Without a server the only source is the bundled payloads.
  useEffect(() => {
    if (serverUrl === null) setSource('offline');
  }, [serverUrl]);

  const openResults = (id: string) => router.push({ pathname: '/results', params: { id } });

  async function start() {
    tapHaptic();
    setBusy(true);
    setError(null);
    setFinished(null);
    setStopping(false);
    stop.current = false;
    startedAt.current = Date.now();
    try {
      const result = await runQuickTest({
        source: source === 'server' && serverUrl !== null ? { kind: 'server', baseUrl: serverUrl } : { kind: 'offline' },
        onProgress: (p) => {
          setProgress(p);
          setNow(Date.now());
        },
        shouldStop: () => stop.current,
      });
      // The run is over and the motion gate open again from here on.
      if (result === null) {
        setError('Stopped. Nothing was saved.');
        showToast({ kind: 'info', message: 'Quick test stopped. Nothing was saved.' });
        return;
      }
      await saveQuickTest(result);
      setSavedCount((n) => n + 1);
      setFinished(result);
      showToast({
        kind: 'success',
        message: `Done in ${describeDuration(result.durationMs)}`,
        action: { label: 'View results', onPress: () => openResults(result.id) },
      });
    } catch (err) {
      const failure = describeRequestError(err, 'run the quick test');
      setError(`${failure.title} — ${failure.detail}${failure.hint ? ` ${failure.hint}` : ''}`);
      showToast({ kind: 'error', message: failure.title, action: { label: 'Retry', onPress: start } });
    } finally {
      setBusy(false);
      setStopping(false);
      setProgress(null);
    }
  }

  const fraction = progress?.fraction ?? 0;
  let status = 'Starting…';
  if (progress !== null) {
    if (progress.phase === 'measuring' && progress.tier !== undefined && progress.format !== undefined) {
      status =
        `${TIER_NAMES[progress.tier]} payloads · ${FORMAT_NAMES[progress.format]} ` +
        `(payload ${progress.done + 1} of ${progress.total})`;
    } else if (progress.phase === 'loading') {
      status = 'Loading payloads';
    } else if (progress.phase === 'prewarming') {
      status = `Warming up the engine${progress.format !== undefined ? ` · ${FORMAT_NAMES[progress.format]}` : ''}`;
    } else if (progress.phase === 'calibrating') {
      status = 'Calibrating the memory counter';
    }
  }

  return (
    <Screen background={palette.surfaceAlt}>
      <StackHeader title="Quick test" />
      <ScrollView style={styles.page} contentContainerStyle={styles.content}>

      <View style={styles.badge}>
        <Text style={styles.badgeText}>{QUICK_TEST_LABEL}</Text>
      </View>
      <Text style={styles.lead}>
        Decodes {c.payloadsPerTier * 3} recipes in JSON, MessagePack and Protocol Buffers on this phone and
        shows how they compare. Usually under a minute.
      </Text>

      {serverUrl !== null && (
        <View style={styles.choiceRow} accessibilityRole="radiogroup">
          {(
            [
              ['offline', 'Bundled payloads', 'No internet needed.'],
              ['server', 'Download from the server', 'The same bytes, fetched first.'],
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
              <Text style={[styles.choiceLabel, source === value && styles.choiceLabelActive]}>
                {source === value ? '● ' : '○ '}
                {label}
              </Text>
              <Text style={styles.choiceDetail}>{detail}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {environment.buildType !== 'release' && (
        <View style={styles.warn}>
          <Text style={styles.warnText}>
            This is a development build. Development checks slow every decode down, so the times
            will be higher than in the installed app.
          </Text>
        </View>
      )}

      {busy ? (
        <View style={styles.progress} accessibilityLiveRegion="polite">
          <Text style={styles.progressStatus}>{stopping ? 'Stopping…' : status}</Text>
          <View
            style={styles.track}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }}
          >
            <View style={[styles.fill, { width: `${Math.round(fraction * 100)}%` }]} />
          </View>
          <View style={styles.progressMeta}>
            <Text style={styles.note}>{Math.round(fraction * 100)}%</Text>
            <Text style={styles.note}>
              {progress === null ? '' : describeRemaining(remainingSeconds(progress, now - startedAt.current))}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              stop.current = true;
              setStopping(true);
            }}
            disabled={stopping}
            style={[styles.secondaryButton, styles.stopButton]}
            accessibilityRole="button"
            accessibilityLabel="Stop the quick test"
          >
            <Text style={styles.secondaryButtonText}>Stop</Text>
          </Pressable>
          <Text style={styles.note}>Keep the app open while it runs. Stopping saves nothing.</Text>
        </View>
      ) : finished !== null ? (
        <FadeIn style={styles.done}>
          <View style={styles.doneHead} accessibilityRole="summary">
            <MaterialCommunityIcons name="check-circle" size={40} color={palette.success} />
            <View style={{ flex: 1 }}>
              <Text style={styles.doneTitle}>Quick test finished</Text>
              <Text style={styles.note}>
                Done in {describeDuration(finished.durationMs)} · {finished.payloadIds.length} recipes × 3 formats
              </Text>
            </View>
          </View>
          {(['low', 'medium', 'high'] as const).map((tier) => {
            const line = tierSummary(finished.cells, tier, 'on this phone');
            return line === null ? null : (
              <Text key={tier} style={styles.doneLine}>
                {line}
              </Text>
            );
          })}
          <View style={styles.buttonRow}>
            <PressableScale onPress={() => openResults(finished.id)} style={styles.primaryButton} accessibilityRole="button">
              <Text style={styles.primaryButtonText}>View results</Text>
            </PressableScale>
            <PressableScale onPress={start} style={styles.secondaryButton} accessibilityRole="button">
              <Text style={styles.secondaryButtonText}>Run again</Text>
            </PressableScale>
          </View>
        </FadeIn>
      ) : (
        <View style={styles.buttonRow}>
          <PressableScale onPress={start} style={styles.primaryButton} accessibilityRole="button">
            <Text style={styles.primaryButtonText}>Start quick test</Text>
          </PressableScale>
          {savedCount > 0 && (
            <PressableScale onPress={() => router.push('/results')} style={styles.secondaryButton} accessibilityRole="button">
              <Text style={styles.secondaryButtonText}>Past results ({savedCount})</Text>
            </PressableScale>
          )}
        </View>
      )}

      {error !== null && (
        <Text style={styles.error} selectable accessibilityRole="alert">
          {error}
        </Text>
      )}

      <Text style={styles.section}>How it differs from the paper</Text>
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
        {decodes.toLocaleString()} decodes in all. Warm-up decodes are discarded; only the measured ones
        count. The timing and memory instruments are the same code the paper used, and every payload is
        in memory before timing starts, so the network never affects the results. Quick test numbers are
        indicative only and are never mixed with the paper&apos;s data.
      </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.surfaceAlt },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: palette.surfaceCool,
    borderColor: palette.accent,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  badgeText: { ...type.label, color: palette.primary },
  lead: { ...type.body, color: palette.body, marginTop: spacing.sm, marginBottom: spacing.md },
  progressStatus: { ...type.cardTitle, color: palette.ink },
  progressMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  stopButton: { alignSelf: 'flex-start', marginTop: spacing.md },
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
    minHeight: touchTarget,
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
  primaryButton: buttonLook.primary,
  primaryButtonText: buttonLook.primaryText,
  secondaryButton: buttonLook.secondary,
  secondaryButtonText: buttonLook.secondaryText,
  disabled: { opacity: 0.5 },
  progress: {
    marginTop: spacing.lg,
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
  },
  track: { height: 10, borderRadius: 5, backgroundColor: palette.surfaceTint, marginTop: spacing.sm, overflow: 'hidden' },
  fill: { height: 10, backgroundColor: palette.primary },
  error: { ...type.body, color: palette.danger, marginTop: spacing.lg },
  done: {
    marginTop: spacing.lg,
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  doneHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  doneTitle: { ...type.section, color: palette.ink },
  doneLine: { ...type.body, color: palette.body },
});
