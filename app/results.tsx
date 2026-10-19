/**
 * app/results.tsx
 *
 * Two tabs:
 *
 *   This phone     a saved Quick test, per tier, with the paper's number drawn
 *                  under each bar for comparison. The default comparison is the
 *                  paper's generated-only subset: the same kind of payloads the
 *                  app ships, so like is compared with like.
 *   Paper results  the published numbers, pooled (the paper's table) or the
 *                  generated-only subset, with the DOI.
 *
 * Every paper number comes from constants/paperResults.generated.ts, which
 * scripts/build-paper-results.ts writes from the reproducibility package.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import BarChart, { pct } from '../components/BarChart';
import { PAPER_RESULTS, type PaperCell } from '../constants/paperResults.generated';
import { palette, radius, shadow, spacing, type } from '../constants/theme';
import { COMPLEXITY_TIERS, SERIALIZATION_FORMATS } from '../shared/contract';
import type { ComplexityTier } from '../shared/contract';
import type { QuickCell, QuickTestResult } from '../src/quick/quickTest';
import { deleteQuickTest, listQuickTests, shareQuickTest } from '../src/quick/storage';

type Tab = 'phone' | 'paper';
type PaperSet = 'generatedOnly' | 'pooled';

const TIER_LABEL: Record<ComplexityTier, string> = {
  low: 'Low complexity',
  medium: 'Medium complexity',
  high: 'High complexity',
};

const SET_LABEL: Record<PaperSet, string> = {
  generatedOnly: 'Generated payloads only (150)',
  pooled: 'All payloads, as in the paper (250)',
};

function paperCell(set: PaperSet, tier: ComplexityTier, format: string): PaperCell | undefined {
  return PAPER_RESULTS[set].find((c) => c.tier === tier && c.format === format);
}

function when(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export default function ResultsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const [tab, setTab] = useState<Tab>('phone');
  const [tests, setTests] = useState<QuickTestResult[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(params.id ?? null);
  const [comparison, setComparison] = useState<PaperSet>('generatedOnly');
  const [paperSet, setPaperSet] = useState<PaperSet>('pooled');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const refresh = useCallback(async () => {
    const all = await listQuickTests();
    setTests(all);
    setSelectedId((id) => (id !== null && all.some((t) => t.id === id) ? id : (all[0]?.id ?? null)));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const selected = tests?.find((t) => t.id === selectedId) ?? null;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Results</Text>
        <View style={{ width: 48 }} />
      </View>

      <View style={styles.tabs} accessibilityRole="tablist">
        {(
          [
            ['phone', 'This phone'],
            ['paper', 'Paper results'],
          ] as const
        ).map(([value, label]) => (
          <Pressable
            key={value}
            onPress={() => setTab(value)}
            style={[styles.tab, tab === value && styles.tabActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === value }}
          >
            <Text style={[styles.tabText, tab === value && styles.tabTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'phone' ? (
        <PhoneTab
          tests={tests}
          selected={selected}
          onSelect={(id) => {
            setSelectedId(id);
            setConfirmDelete(false);
          }}
          comparison={comparison}
          onComparison={setComparison}
          onRun={() => router.push('/quick')}
          confirmDelete={confirmDelete}
          onDelete={async () => {
            if (selected === null) return;
            if (!confirmDelete) {
              setConfirmDelete(true);
              return;
            }
            await deleteQuickTest(selected.id);
            setConfirmDelete(false);
            await refresh();
          }}
        />
      ) : (
        <PaperTab set={paperSet} onSet={setPaperSet} />
      )}
    </ScrollView>
  );
}

// ─── This phone ───────────────────────────────────────────────────────────────

function PhoneTab({
  tests,
  selected,
  onSelect,
  comparison,
  onComparison,
  onRun,
  confirmDelete,
  onDelete,
}: {
  tests: QuickTestResult[] | null;
  selected: QuickTestResult | null;
  onSelect: (id: string) => void;
  comparison: PaperSet;
  onComparison: (s: PaperSet) => void;
  onRun: () => void;
  confirmDelete: boolean;
  onDelete: () => void;
}) {
  if (tests === null) return <Text style={styles.note}>Loading…</Text>;

  if (selected === null) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No Quick test yet</Text>
        <Text style={styles.body}>
          Run a Quick test to see how JSON, MessagePack and Protocol Buffers compare on this phone,
          next to the numbers from the paper.
        </Text>
        <Pressable onPress={onRun} style={[styles.primaryButton, { marginTop: spacing.lg }]} accessibilityRole="button">
          <Text style={styles.primaryButtonText}>Run a Quick test</Text>
        </Pressable>
      </View>
    );
  }

  const cell = (tier: ComplexityTier, format: string): QuickCell | undefined =>
    selected.cells.find((c) => c.tier === tier && c.format === format);

  return (
    <>
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>{selected.label}</Text>
        <Text style={styles.bannerText}>
          {when(selected.startedAt)} · {selected.payloadIds.length} payloads ·{' '}
          {selected.source.kind === 'offline' ? 'bundled payloads' : `from ${selected.source.baseUrl}`} ·{' '}
          {selected.environment.buildType} build · {(selected.durationMs / 1000).toFixed(0)} s
        </Text>
      </View>

      {tests.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {tests.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => onSelect(t.id)}
              style={[styles.chip, t.id === selected.id && styles.chipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: t.id === selected.id }}
            >
              <Text style={[styles.chipText, t.id === selected.id && styles.chipTextActive]}>{when(t.startedAt)}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <Text style={styles.section}>Compare with</Text>
      <Segmented
        value={comparison}
        options={[
          ['generatedOnly', 'Paper, generated payloads'],
          ['pooled', 'Paper, all payloads'],
        ]}
        onChange={onComparison}
      />
      <Text style={styles.note}>
        Solid bars: this phone. Thin outlined bars: the paper ({SET_LABEL[comparison].toLowerCase()}).
        {comparison === 'generatedOnly'
          ? ' The Quick test uses generated payloads only, so this is the like-for-like comparison.'
          : ` The paper's low tier also includes ${PAPER_RESULTS.payloadsBySourceAndTier.spoonacular?.low ?? 0} Spoonacular recipes, which the app does not ship.`}{' '}
        Phones differ, so compare the pattern and the % against JSON rather than the absolute times.
      </Text>

      {COMPLEXITY_TIERS.map((tier) => (
        <View key={tier} style={styles.card}>
          <Text style={styles.cardTitle}>{TIER_LABEL[tier]}</Text>
          <BarChart
            title="Decode time"
            unit="ms"
            digits={2}
            compareLabel="paper"
            rows={SERIALIZATION_FORMATS.map((f) => ({
              format: f,
              value: cell(tier, f)?.msMean ?? null,
              pctVsJson: cell(tier, f)?.msPctVsJson ?? null,
              compare: paperCell(comparison, tier, f)?.msMean ?? null,
              comparePct: paperCell(comparison, tier, f)?.msPctVsJson ?? null,
            }))}
          />
          <BarChart
            title="Memory allocated per decode"
            unit="kB"
            digits={0}
            compareLabel="paper"
            rows={SERIALIZATION_FORMATS.map((f) => {
              const mb = cell(tier, f)?.mbMean ?? null;
              const paper = paperCell(comparison, tier, f)?.mbMean ?? null;
              return {
                format: f,
                value: mb === null ? null : mb * 1000,
                pctVsJson: cell(tier, f)?.mbPctVsJson ?? null,
                compare: paper === null ? null : paper * 1000,
                comparePct: paperCell(comparison, tier, f)?.mbPctVsJson ?? null,
              };
            })}
          />
          <BarChart
            title="Payload size"
            unit="kB"
            digits={1}
            compareLabel="paper"
            rows={SERIALIZATION_FORMATS.map((f) => ({
              format: f,
              value: cell(tier, f)?.kbMean ?? null,
              pctVsJson: cell(tier, f)?.kbPctVsJson ?? null,
              compare: paperCell(comparison, tier, f)?.kbMean ?? null,
              comparePct: paperCell(comparison, tier, f)?.kbPctVsJson ?? null,
            }))}
          />
          <Text style={styles.note}>
            {cell(tier, 'json')?.payloads ?? 0} payloads, {cell(tier, 'json')?.decodes ?? 0} measured decodes per format
            here; {paperCell(comparison, tier, 'json')?.payloads ?? 0} payloads in the paper.
          </Text>
        </View>
      ))}

      {selected.cells.some((c) => c.mbMean === null) && (
        <Text style={styles.note}>
          Memory is blank where this build exposes no heap counter (it needs the Hermes engine).
        </Text>
      )}

      <View style={styles.buttonRow}>
        <Pressable onPress={onRun} style={styles.primaryButton} accessibilityRole="button">
          <Text style={styles.primaryButtonText}>Run again</Text>
        </Pressable>
        <Pressable onPress={() => shareQuickTest(selected)} style={styles.secondaryButton} accessibilityRole="button">
          <Text style={styles.secondaryButtonText}>Share as file</Text>
        </Pressable>
        <Pressable onPress={onDelete} style={styles.secondaryButton} accessibilityRole="button">
          <Text style={[styles.secondaryButtonText, { color: palette.danger }]}>
            {confirmDelete ? 'Tap again to delete' : 'Delete'}
          </Text>
        </Pressable>
      </View>
    </>
  );
}

// ─── Paper results ────────────────────────────────────────────────────────────

function PaperTab({ set, onSet }: { set: PaperSet; onSet: (s: PaperSet) => void }) {
  const spoonLow = PAPER_RESULTS.payloadsBySourceAndTier.spoonacular?.low ?? 0;
  const generated = PAPER_RESULTS.payloadsBySourceAndTier.generated ?? {};
  return (
    <>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Comparative Analysis of JSON, MessagePack, and Protocol Buffers</Text>
        <Text style={styles.body}>
          Decode time and memory allocated per decode, measured in a release build of this app on one
          Android phone, three runs pooled. Change against JSON is shown beside each value.
        </Text>
        <Pressable onPress={() => WebBrowser.openBrowserAsync(PAPER_RESULTS.doiUrl)} accessibilityRole="link">
          <Text style={styles.link}>Data and code: doi.org/{PAPER_RESULTS.doi}</Text>
        </Pressable>
      </View>

      <Text style={styles.section}>Payloads</Text>
      <Segmented
        value={set}
        options={[
          ['pooled', 'All (paper)'],
          ['generatedOnly', 'Generated only'],
        ]}
        onChange={onSet}
      />
      <Text style={styles.note}>
        {set === 'pooled'
          ? `The paper's table: ${spoonLow} real Spoonacular recipes and ${generated.low ?? 0} generated ones in the low tier, ` +
            `${generated.medium ?? 0} and ${generated.high ?? 0} generated in medium and high. The app does not ship the ` +
            'Spoonacular payloads, so a Quick test cannot reproduce the low tier of this table exactly.'
          : `The ${(generated.low ?? 0) + (generated.medium ?? 0) + (generated.high ?? 0)} generated payloads only, computed from the ` +
            "published per-payload data. Medium and high are the same as in the paper's table; low differs because the " +
            `${spoonLow} Spoonacular recipes are left out. This is what the Quick test compares against by default.`}
      </Text>

      {COMPLEXITY_TIERS.map((tier) => {
        const cells = SERIALIZATION_FORMATS.map((f) => paperCell(set, tier, f));
        return (
          <View key={tier} style={styles.card}>
            <Text style={styles.cardTitle}>
              {TIER_LABEL[tier]} · {cells[0]?.payloads ?? 0} payloads
            </Text>
            <BarChart
              title="Decode time"
              unit="ms"
              digits={2}
              rows={SERIALIZATION_FORMATS.map((f, i) => ({
                format: f,
                value: cells[i]?.msMean ?? null,
                pctVsJson: cells[i]?.msPctVsJson ?? null,
              }))}
            />
            <BarChart
              title="Memory allocated per decode"
              unit="kB"
              digits={0}
              rows={SERIALIZATION_FORMATS.map((f, i) => ({
                format: f,
                value: cells[i] === undefined ? null : cells[i]!.mbMean * 1000,
                pctVsJson: cells[i]?.mbPctVsJson ?? null,
              }))}
            />
            <BarChart
              title="Payload size"
              unit="kB"
              digits={1}
              rows={SERIALIZATION_FORMATS.map((f, i) => ({
                format: f,
                value: cells[i]?.kbMean ?? null,
                pctVsJson: cells[i]?.kbPctVsJson ?? null,
              }))}
            />
            {cells[2]?.materialisationPct !== null && cells[2]?.materialisationPct !== undefined && (
              <Text style={styles.note}>
                Protocol Buffers decode followed by conversion to a plain object: {pct(cells[2].materialisationPct)} time
                over the decode alone.
              </Text>
            )}
          </View>
        );
      })}

      <Text style={styles.note}>
        Sizes in kB of 1,000 bytes. Memory is the heap allocated during one decode (Hermes
        js_totalAllocatedBytes), not peak memory.
        {set === 'generatedOnly'
          ? ' The spread of decode times over individual decodes is not shown for this subset: the published per-payload data holds one mean per payload.'
          : ''}
      </Text>
      <Text style={styles.provenance} selectable>
        Source: {PAPER_RESULTS.source.repository} @ {PAPER_RESULTS.source.artifactCommit.slice(0, 7)}
        {'\n'}
        {Object.entries(PAPER_RESULTS.source.files)
          .map(([file, sha]) => `${file}  sha256 ${sha.slice(0, 12)}…`)
          .join('\n')}
      </Text>
    </>
  );
}

// ─── Shared ───────────────────────────────────────────────────────────────────

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup">
      {options.map(([v, label]) => (
        <Pressable
          key={v}
          onPress={() => onChange(v)}
          style={[styles.segment, value === v && styles.segmentActive]}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === v }}
        >
          <Text style={[styles.segmentText, value === v && styles.segmentTextActive]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.surfaceAlt },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  back: { ...type.label, color: palette.primary },
  title: { ...type.section, color: palette.ink },
  tabs: {
    flexDirection: 'row',
    backgroundColor: palette.surfaceTint,
    borderRadius: radius.pill,
    padding: 3,
    marginBottom: spacing.lg,
  },
  tab: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.pill, alignItems: 'center' },
  tabActive: { backgroundColor: palette.surface, ...shadow.card },
  tabText: { ...type.label, color: palette.muted },
  tabTextActive: { color: palette.primary },
  banner: {
    backgroundColor: palette.surfaceCool,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.accent,
    padding: spacing.md,
  },
  bannerTitle: { ...type.cardTitle, color: palette.primary },
  bannerText: { ...type.caption, color: palette.body, marginTop: spacing.xs },
  chips: { gap: spacing.sm, paddingVertical: spacing.md },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  chipActive: { borderColor: palette.primary, backgroundColor: palette.surfaceCool },
  chipText: { ...type.caption, color: palette.body },
  chipTextActive: { color: palette.primary, fontWeight: '700' },
  section: { ...type.cardTitle, color: palette.ink, marginTop: spacing.lg, marginBottom: spacing.sm },
  segmented: { flexDirection: 'row', gap: spacing.sm },
  segment: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  segmentActive: { borderColor: palette.primary, borderWidth: 2 },
  segmentText: { ...type.caption, color: palette.body, textAlign: 'center' },
  segmentTextActive: { color: palette.primary, fontWeight: '700' },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    marginTop: spacing.md,
    ...shadow.card,
  },
  cardTitle: { ...type.cardTitle, color: palette.primary },
  body: { ...type.body, color: palette.body, marginTop: spacing.xs },
  note: { ...type.caption, color: palette.muted, marginTop: spacing.sm, lineHeight: 16 },
  link: { ...type.label, color: palette.primary, textDecorationLine: 'underline', marginTop: spacing.md },
  provenance: { fontFamily: 'monospace', fontSize: 10, lineHeight: 14, color: palette.muted, marginTop: spacing.md },
  empty: { alignItems: 'flex-start', paddingVertical: spacing.xl },
  emptyTitle: { ...type.section, color: palette.ink },
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
});
