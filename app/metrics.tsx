/**
 * app/metrics.tsx
 *
 * Session summary: everything the app has fetched since launch, grouped by
 * serialization format, with the arithmetic mean and the sample standard
 * deviation (n−1) the study uses — plus percentage change against JSON, which
 * is the baseline the paper reports against.
 *
 * Also the home for the connection setting, because "which proxy am I talking
 * to" and "what did those requests cost" are the same question when something
 * looks wrong.
 *
 * This screen reports; it never measures. The numbers are the ones the shared
 * instruments already produced.
 */

import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { palette, radius, shadow, spacing, type } from '../constants/theme';
import { describeBaseUrl } from '../src/api/baseUrl';
import {
  aggregateByFormat,
  clearMetrics,
  getMetrics,
  percentVsBaseline,
  subscribeToMetrics,
  type FormatAggregate,
  type MetricSample,
  type Summary,
} from '../src/api/metrics';
import { normaliseBaseUrl, setBaseUrlOverride, useSettings } from '../src/settings/settings';

function fmt(summary: Summary | null, digits: number): string {
  return summary === null ? '—' : summary.mean.toFixed(digits);
}

function fmtSd(summary: Summary | null, digits: number): string {
  return summary === null ? '' : `±${summary.sd.toFixed(digits)}`;
}

function pct(value: number | null): string {
  if (value === null) return '';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

export default function MetricsScreen() {
  const router = useRouter();
  const settings = useSettings();
  const [samples, setSamples] = useState<MetricSample[]>(getMetrics());
  const [draftUrl, setDraftUrl] = useState(settings.baseUrlOverride ?? '');
  const [urlError, setUrlError] = useState<string | null>(null);

  useEffect(() => subscribeToMetrics(setSamples), []);

  const rows = aggregateByFormat(samples);
  const baseline = rows.find((r) => r.format === 'json') ?? null;
  const connection = describeBaseUrl();

  function saveOverride() {
    const trimmed = draftUrl.trim();
    if (trimmed.length === 0) {
      setBaseUrlOverride(null);
      setUrlError(null);
      return;
    }
    const normalised = normaliseBaseUrl(trimmed);
    if (normalised === null) {
      setUrlError('Needs to look like http://192.168.1.20:3001 — scheme, host, port, no path.');
      return;
    }
    setBaseUrlOverride(normalised);
    setDraftUrl(normalised);
    setUrlError(null);
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Session measurements</Text>
        <Pressable onPress={clearMetrics} accessibilityRole="button" hitSlop={12}>
          <Text style={styles.clear}>Clear</Text>
        </Pressable>
      </View>

      <Text style={styles.caption}>
        {samples.length === 0
          ? 'Nothing fetched yet this session.'
          : `${samples.length} request${samples.length === 1 ? '' : 's'} this session. ` +
            'Mean ± sample sd (n−1). Percentages are against JSON.'}
      </Text>

      {/* ── Per-format aggregates ─────────────────────────────────────────── */}
      {rows.map((row) => (
        <AggregateCard key={row.format} row={row} baseline={baseline} />
      ))}

      {/* ── Recent requests ───────────────────────────────────────────────── */}
      {samples.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Recent requests</Text>
          {[...samples]
            .reverse()
            .slice(0, 8)
            .map((sample) => (
              <View key={sample.seq} style={styles.sampleRow}>
                <Text style={styles.sampleLabel} numberOfLines={1}>
                  {sample.kind === 'recipe' ? 'recipe' : 'search'} {sample.label}
                </Text>
                <Text style={styles.sampleNumbers}>
                  {sample.format} · {(sample.payloadBytes / 1024).toFixed(1)} KB ·{' '}
                  {sample.deserializationMs.toFixed(2)} ms
                </Text>
              </View>
            ))}
        </>
      )}

      {/* ── Connection ────────────────────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>Connection</Text>
      <View style={styles.card}>
        <Text style={styles.connectionUrl}>{connection.url}</Text>
        <Text style={styles.caption}>{connection.explanation}</Text>

        <Text style={styles.fieldLabel}>Manual proxy URL (optional)</Text>
        <TextInput
          style={styles.input}
          value={draftUrl}
          onChangeText={setDraftUrl}
          placeholder="leave empty to follow the dev server"
          placeholderTextColor={palette.faint}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        {urlError !== null && <Text style={styles.inputError}>{urlError}</Text>}

        <View style={styles.buttonRow}>
          <Pressable onPress={saveOverride} style={styles.primaryButton} accessibilityRole="button">
            <Text style={styles.primaryButtonText}>Save</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setDraftUrl('');
              setBaseUrlOverride(null);
              setUrlError(null);
            }}
            style={styles.secondaryButton}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>Use dev server</Text>
          </Pressable>
        </View>
      </View>

      <Pressable
        onPress={() => router.push('/benchmark')}
        style={styles.primaryButton}
        accessibilityRole="button"
      >
        <Text style={styles.primaryButtonText}>Open benchmark runner</Text>
      </Pressable>

      <Text style={styles.footnote}>
        Search is served as JSON or MessagePack only. Protobuf needs a compiled message type and the
        schema covers recipe documents, so a protobuf search falls back to JSON and is labelled as
        such rather than counted as protobuf.
      </Text>
    </ScrollView>
  );
}

function AggregateCard({
  row,
  baseline,
}: {
  row: FormatAggregate;
  baseline: FormatAggregate | null;
}) {
  const isBaseline = row.format === 'json';
  const sizePct = isBaseline
    ? null
    : percentVsBaseline(row.payloadKB?.mean ?? null, baseline?.payloadKB?.mean ?? null);
  const timePct = isBaseline
    ? null
    : percentVsBaseline(
        row.deserializationMs?.mean ?? null,
        baseline?.deserializationMs?.mean ?? null
      );

  return (
    <View style={[styles.card, row.n === 0 && styles.cardEmpty]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{row.format}</Text>
        <Text style={styles.cardCount}>
          {row.n === 0 ? 'not used yet' : `n = ${row.n}${isBaseline ? ' · baseline' : ''}`}
        </Text>
      </View>

      <View style={styles.metricRow}>
        <Metric
          label="size"
          value={fmt(row.payloadKB, 1)}
          sd={fmtSd(row.payloadKB, 1)}
          unit="KB"
          delta={pct(sizePct)}
        />
        <Metric
          label="decode"
          value={fmt(row.deserializationMs, 2)}
          sd={fmtSd(row.deserializationMs, 2)}
          unit="ms"
          delta={pct(timePct)}
        />
        <Metric
          label="heap"
          value={fmt(row.heapKB, 1)}
          sd={fmtSd(row.heapKB, 1)}
          unit="KB"
          delta=""
        />
      </View>
    </View>
  );
}

function Metric({
  label,
  value,
  sd,
  unit,
  delta,
}: {
  label: string;
  value: string;
  sd: string;
  unit: string;
  delta: string;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>
        {value}
        <Text style={styles.metricUnit}> {unit}</Text>
      </Text>
      <Text style={styles.metricSd}>
        {sd}
        {delta.length > 0 ? `  ${delta}` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.surfaceAlt },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  back: { ...type.label, color: palette.primary },
  clear: { ...type.label, color: palette.accentDeep },
  title: { ...type.title, color: palette.ink, fontSize: 18 },
  caption: { ...type.caption, color: palette.muted, marginBottom: spacing.md },
  sectionTitle: {
    ...type.section,
    color: palette.ink,
    fontSize: 15,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: palette.border,
    ...shadow.card,
  },
  cardEmpty: { opacity: 0.55 },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.sm,
  },
  cardTitle: { ...type.cardTitle, color: palette.primary },
  cardCount: { ...type.caption, color: palette.muted },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between' },
  metric: { flex: 1 },
  metricLabel: { ...type.caption, color: palette.muted },
  metricValue: {
    ...type.section,
    fontSize: 16,
    color: palette.ink,
    fontVariant: ['tabular-nums'],
  },
  metricUnit: { ...type.caption, color: palette.muted, fontWeight: '500' },
  metricSd: { ...type.caption, color: palette.muted, fontVariant: ['tabular-nums'] },
  sampleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
    gap: spacing.sm,
  },
  sampleLabel: { ...type.caption, color: palette.body, flexShrink: 1 },
  sampleNumbers: { ...type.caption, color: palette.muted, fontVariant: ['tabular-nums'] },
  connectionUrl: { ...type.cardTitle, color: palette.ink },
  fieldLabel: { ...type.caption, color: palette.muted, marginTop: spacing.md },
  input: {
    backgroundColor: palette.surfaceTint,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
    color: palette.ink,
    ...type.body,
  },
  inputError: { ...type.caption, color: palette.danger, marginTop: spacing.xs },
  buttonRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  primaryButton: {
    backgroundColor: palette.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  primaryButtonText: { ...type.label, color: palette.surface },
  secondaryButton: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  secondaryButtonText: { ...type.label, color: palette.primary },
  footnote: {
    ...type.caption,
    color: palette.muted,
    marginTop: spacing.lg,
    lineHeight: 16,
  },
});
