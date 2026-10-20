/**
 * components/BarChart.tsx
 *
 * Horizontal bars for one metric across the three formats, drawn with plain
 * Views (no chart library, so no new dependency).
 *
 * Each row: format name, a bar scaled to the largest value in the group, the
 * value, and its change against JSON. With `compare` values, a thin outlined
 * bar under each row shows the reference (for example the paper's number) on
 * the same scale, so the two can be read against each other directly.
 *
 * Nothing is told by colour alone: every bar has its format name beside it,
 * the unit is in the group title and after every value, and the legend names
 * both bar styles (solid and outlined) in words.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatColors, palette, spacing, type } from '../constants/theme';
import type { SerializationFormat } from '../shared/contract';

export const FORMAT_LABELS: Record<SerializationFormat, string> = {
  json: 'JSON',
  msgpack: 'MsgPack',
  protobuf: 'Protobuf',
};

export interface BarRow {
  format: SerializationFormat;
  value: number | null;
  pctVsJson: number | null;
  /** Standard deviation of `value`, shown as ±; omit when not meaningful. */
  sd?: number | null;
  /** Reference value on the same scale, drawn as a thin outlined bar. */
  compare?: number | null;
  comparePct?: number | null;
}

export function pct(v: number | null | undefined): string {
  if (v === null || v === undefined) return '';
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}%`;
}

export default function BarChart({
  title,
  unit,
  digits,
  rows,
  valueLabel,
  compareLabel,
}: {
  title: string;
  unit: string;
  digits: number;
  rows: BarRow[];
  /** Legend text for the solid bars, e.g. "this phone"; shown with compareLabel. */
  valueLabel?: string;
  /** Legend text for the outlined bars, e.g. "paper". Omit when there are none. */
  compareLabel?: string;
}) {
  const values = rows.flatMap((r) => [r.value, r.compare ?? null]).filter((v): v is number => v !== null);
  const max = values.length === 0 ? 1 : Math.max(...values);
  const width = (v: number | null | undefined) =>
    v === null || v === undefined || max <= 0 ? '0%' : (`${Math.max((v / max) * 100, 1)}%` as const);

  return (
    <View style={styles.group} accessibilityLabel={`${title}, ${unit}`}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>
          {title} <Text style={styles.titleUnit}>({unit})</Text>
        </Text>
        {compareLabel !== undefined && (
          <View style={styles.legend}>
            <View style={styles.legendSolid} />
            <Text style={styles.legendText}>{valueLabel ?? 'measured'}</Text>
            <View style={styles.legendSwatch} />
            <Text style={styles.legendText}>{compareLabel}</Text>
          </View>
        )}
      </View>
      {rows.map((r) => (
        <View key={r.format} style={styles.row}>
          <Text style={styles.label}>{FORMAT_LABELS[r.format]}</Text>
          <View style={styles.bars}>
            <View style={styles.track}>
              <View style={[styles.bar, { width: width(r.value), backgroundColor: formatColors[r.format] }]} />
            </View>
            {r.compare !== undefined && (
              <View style={styles.compareTrack}>
                <View style={[styles.compareBar, { width: width(r.compare), borderColor: formatColors[r.format] }]} />
              </View>
            )}
          </View>
          <View style={styles.numbers}>
            <Text style={styles.value}>
              {r.value === null ? '—' : r.value.toFixed(digits)}
              <Text style={styles.unit}> {unit}</Text>
            </Text>
            <Text style={styles.delta}>
              {r.sd !== undefined && r.sd !== null ? `±${r.sd.toFixed(digits)}` : ''}
              {r.sd !== undefined && r.sd !== null && r.pctVsJson !== null ? '  ' : ''}
              {pct(r.pctVsJson)}
            </Text>
            {r.compare !== undefined && (
              <Text style={styles.compareValue}>
                {compareLabel ?? 'ref'} {r.compare === null ? '—' : r.compare.toFixed(digits)} {pct(r.comparePct)}
              </Text>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { marginTop: spacing.md },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  title: { ...type.label, color: palette.ink },
  titleUnit: { ...type.caption, color: palette.muted },
  legendSolid: { width: 14, height: 6, borderRadius: 3, backgroundColor: palette.muted },
  legend: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendSwatch: { width: 14, height: 6, borderRadius: 3, borderWidth: 1, borderColor: palette.muted },
  legendText: { ...type.caption, color: palette.muted },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3, gap: spacing.sm },
  label: { ...type.caption, color: palette.body, width: 58 },
  bars: { flex: 1, gap: 3 },
  track: { height: 12, borderRadius: 6, backgroundColor: palette.surfaceTint, overflow: 'hidden' },
  bar: { height: 12, borderRadius: 6 },
  compareTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  compareBar: { height: 6, borderRadius: 3, borderWidth: 1, backgroundColor: palette.surface },
  numbers: { width: 112, alignItems: 'flex-end' },
  value: { ...type.label, color: palette.ink, fontVariant: ['tabular-nums'] },
  unit: { ...type.caption, color: palette.muted, fontWeight: '500' },
  delta: { ...type.caption, color: palette.muted, fontVariant: ['tabular-nums'] },
  compareValue: { ...type.caption, color: palette.muted, fontStyle: 'italic', fontVariant: ['tabular-nums'] },
});
