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
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { TextLink, buttonLook } from '../components/Buttons';
import { Screen, StackHeader } from '../components/Screen';
import { palette, radius, shadow, spacing, type } from '../constants/theme';
import { formatKB, formatMs, KB_DIGITS, MS_DIGITS } from '../constants/units';
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
import { useSettings } from '../src/settings/settings';

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
  useSettings(); // re-render when the server setting changes
  const [samples, setSamples] = useState<MetricSample[]>(getMetrics());

  useEffect(() => subscribeToMetrics(setSamples), []);

  const rows = aggregateByFormat(samples);
  const baseline = rows.find((r) => r.format === 'json') ?? null;
  const connection = describeBaseUrl();

  return (
    <Screen background={palette.surfaceAlt}>
      <StackHeader
        title="Session measurements"
        right={
          <TextLink
            label="Clear"
            accessibilityLabel="Clear this session's measurements"
            onPress={() =>
              Alert.alert('Clear this session’s measurements?', 'The list of requests made since launch is removed.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear', style: 'destructive', onPress: clearMetrics },
              ])
            }
          />
        }
      />
      <ScrollView style={styles.page} contentContainerStyle={styles.content}>

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
                  {sample.format} · {formatKB(sample.payloadBytes)} · {formatMs(sample.deserializationMs)}
                </Text>
              </View>
            ))}
        </>
      )}

      {/* ── Connection: details and changes live in Server settings ─────── */}
      <Text style={styles.sectionTitle}>Connection</Text>
      <View style={styles.card}>
        <Text style={styles.connectionUrl}>{connection.url}</Text>
        <Text style={styles.caption}>{connection.explanation}</Text>
        <View style={styles.buttonRow}>
          <Pressable onPress={() => router.push('/settings')} style={styles.secondaryButton} accessibilityRole="button">
            <Text style={styles.secondaryButtonText}>Server settings</Text>
          </Pressable>
        </View>
      </View>

      <View style={{ height: spacing.md }} />
      <Pressable
        onPress={() => router.push('/benchmark')}
        style={styles.secondaryButton}
        accessibilityRole="button"
      >
        <Text style={styles.secondaryButtonText}>Paper protocol runner (researcher)</Text>
      </Pressable>

      <Text style={styles.footnote}>
        Lists are sent as JSON when Protobuf is chosen, and labelled as JSON here.
      </Text>
      </ScrollView>
    </Screen>
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
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{row.format}</Text>
        <Text style={styles.cardCount}>
          {row.n === 0 ? 'not used yet' : `n = ${row.n}${isBaseline ? ' · baseline' : ''}`}
        </Text>
      </View>

      <View style={styles.metricRow}>
        <Metric
          label="Payload size"
          value={fmt(row.payloadKB, KB_DIGITS)}
          sd={fmtSd(row.payloadKB, KB_DIGITS)}
          unit="KB"
          delta={pct(sizePct)}
        />
        <Metric
          label="Decode time"
          value={fmt(row.deserializationMs, MS_DIGITS)}
          sd={fmtSd(row.deserializationMs, MS_DIGITS)}
          unit="ms"
          delta={pct(timePct)}
        />
        <Metric
          label="Memory"
          value={fmt(row.heapKB, KB_DIGITS)}
          sd={fmtSd(row.heapKB, KB_DIGITS)}
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
  buttonRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  secondaryButton: buttonLook.secondary,
  secondaryButtonText: buttonLook.secondaryText,
  footnote: {
    ...type.caption,
    color: palette.muted,
    marginTop: spacing.lg,
    lineHeight: 16,
  },
});
