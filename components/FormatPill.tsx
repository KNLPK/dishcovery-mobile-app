/**
 * components/FormatPill.tsx
 *
 * The format selector in a screen's header (Cook and Search): one pill that
 * names the format and what the last response cost, and opens a sheet to
 * change it. Home and the recipe page keep the full MetricsBar.
 *
 *   ▪ JSON · 1.1 KB · 2.08 ms ⌄
 *
 * The pill shows the format chosen in settings. Its numbers are the screen's
 * last response when that response was for this choice (or, for Protobuf on a
 * list, sent as JSON in its place); after switching, it shows the name alone
 * until the next request is measured.
 *
 * The sheet ("Data format") lists the three formats with the last list
 * response this session in each, as a size bar. Choosing one only writes the
 * setting: the next request uses it, nothing is refetched. Lists cannot be
 * sent as Protocol Buffers (MetricsBar explains why), so the sheet says so
 * under that row.
 */

import { Feather } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatColors, palette, radius, spacing, type } from '../constants/theme';
import { formatKB, formatMs } from '../constants/units';
import { SERIALIZATION_FORMATS, type SerializationFormat } from '../shared/contract';
import { getMetrics, subscribeToMetrics, type MetricSample } from '../src/api/metrics';
import { setFormat, useSettings } from '../src/settings/settings';
import { PrimaryButton, TextLink } from './Buttons';
import { ExplainSheet, LABELS, LIST_PROTOBUF_NOTE, NAMES, type LastMeasurement } from './MetricsBar';
import { CrossfadeText, GrowBar, PressableScale } from './motion';
import { Sheet } from './Sheet';

function cost(m: { payloadBytes: number; deserializationMs: number }): string {
  return `${formatKB(m.payloadBytes)} · ${formatMs(m.deserializationMs)}`;
}

export default function FormatPill({ last, busy = false }: { last: LastMeasurement | null; busy?: boolean }) {
  const settings = useSettings();
  const [open, setOpen] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const chosen = settings.format;
  const current = last !== null && (last.format === chosen || last.formatFallbackFrom === chosen) ? last : null;
  // After a fallback the numbers are for the format actually sent, so the pill names that one.
  const shown = current?.format ?? chosen;
  const text = busy
    ? `${LABELS[chosen]} · measuring…`
    : current !== null
      ? `${LABELS[shown]} · ${cost(current)}`
      : LABELS[chosen];

  return (
    <>
      <PressableScale
        onPress={() => setOpen(true)}
        style={styles.pill}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={
          `Data format: ${NAMES[chosen]}.` +
          (current !== null
            ? ` Last response${current.formatFallbackFrom ? ` sent as ${NAMES[current.format]}` : ''}: ${formatKB(current.payloadBytes)}, decoded in ${formatMs(current.deserializationMs)}.`
            : '') +
          ' Change'
        }
      >
        <View style={[styles.swatch, { backgroundColor: formatColors[shown] }]} />
        {/* A new measurement cross-fades in (motion spec, "Header pill"). */}
        <CrossfadeText text={text} style={styles.pillText} />
        <Feather name="chevron-down" size={14} color={palette.primary} />
      </PressableScale>

      <FormatSheet
        visible={open}
        onClose={() => setOpen(false)}
        onExplain={() => {
          setOpen(false);
          setExplaining(true);
        }}
      />
      <ExplainSheet visible={explaining} onClose={() => setExplaining(false)} />
    </>
  );
}

/** The last list response this session in each format. */
function useLastListResponses(): Partial<Record<SerializationFormat, MetricSample>> {
  const [samples, setSamples] = useState(getMetrics);
  useEffect(() => subscribeToMetrics(() => setSamples(getMetrics())), []);
  const last: Partial<Record<SerializationFormat, MetricSample>> = {};
  for (const s of samples) if (s.kind === 'search') last[s.format] = s;
  return last;
}

function FormatSheet({ visible, onClose, onExplain }: { visible: boolean; onClose: () => void; onExplain: () => void }) {
  const settings = useSettings();
  const last = useLastListResponses();
  const largest = Math.max(1, ...SERIALIZATION_FORMATS.map((f) => last[f]?.payloadBytes ?? 0));

  return (
    <Sheet visible={visible} onClose={onClose} title="Data format">
      <Text style={styles.intro}>Every recipe is sent in this format. Numbers are from the last response in each.</Text>
      <View style={styles.rows} accessibilityRole="radiogroup" accessibilityLabel="Format for every request">
        {SERIALIZATION_FORMATS.map((format, i) => {
          const active = settings.format === format;
          const sample = last[format];
          return (
            <Pressable
              key={format}
              onPress={() => setFormat(format)}
              style={[styles.row, active && styles.rowActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${NAMES[format]}, ${sample ? cost(sample) : 'not measured yet'}`}
            >
              <View style={styles.rowTop}>
                <View style={styles.radio}>{active && <View style={styles.radioDot} />}</View>
                <Text style={styles.rowName}>{NAMES[format]}</Text>
                <Text style={styles.rowValue}>{sample ? cost(sample) : 'not measured yet'}</Text>
              </View>
              <View style={styles.track}>
                {/* Mounted with the sheet, so the bars grow in as it opens. */}
                {sample && (
                  <GrowBar
                    index={i}
                    width={`${(100 * sample.payloadBytes) / largest}%`}
                    style={[styles.fill, { backgroundColor: formatColors[format] }]}
                  />
                )}
              </View>
              {format === 'protobuf' && <Text style={styles.note}>{LIST_PROTOBUF_NOTE}</Text>}
            </Pressable>
          );
        })}
      </View>
      <View style={styles.actions}>
        <PrimaryButton label="Done" onPress={onClose} />
        <TextLink label="What these numbers mean" onPress={onExplain} style={styles.explain} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  pill: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: spacing.md,
    paddingRight: 10,
    borderRadius: radius.pill,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    flexShrink: 1,
  },
  swatch: { width: 8, height: 8, borderRadius: 2 },
  pillText: { ...type.label, color: palette.primary, fontVariant: ['tabular-nums'], flexShrink: 1 },
  intro: { ...type.body, color: palette.body },
  rows: { gap: spacing.sm, marginTop: spacing.sm },
  row: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    paddingVertical: spacing.md,
    paddingHorizontal: 14,
    gap: spacing.sm,
  },
  rowActive: { borderWidth: 2, borderColor: palette.primary, paddingVertical: spacing.md - 1, paddingHorizontal: 13 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.primary },
  rowName: { ...type.cardTitle, color: palette.ink },
  rowValue: { ...type.label, fontWeight: '400', color: palette.body, marginLeft: 'auto', fontVariant: ['tabular-nums'] },
  track: { height: 6, borderRadius: 3, backgroundColor: palette.surfaceTint, marginLeft: 30, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  note: { ...type.caption, fontWeight: '400', color: palette.muted, marginLeft: 30 },
  actions: { gap: spacing.xs, marginTop: spacing.sm },
  explain: { alignSelf: 'center' },
});
