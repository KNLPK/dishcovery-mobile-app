/**
 * components/MetricsBar.tsx
 *
 * The serialization format selector and what the last response cost, on every
 * screen that fetches, so the format is a visible property of the app rather
 * than a hidden benchmark parameter.
 *
 *   Format  [ JSON | MsgPack | Protobuf ]                        Σ
 *   Last response: 1.1 KB · decoded in 2.08 ms · 75.5 KB memory
 *
 * Σ opens a short sheet that says what the numbers are, with a way on to
 * Results and to this session's requests.
 *
 * Home and the recipe page show this bar; Cook and Search show the compact
 * FormatPill in their header instead, with the same choice in a sheet.
 *
 * Lists (Home, Search, Cook) cannot be sent as Protocol Buffers: the frozen
 * shared/proto/recipe.proto describes recipe documents only, so the client
 * asks for JSON instead (src/api/client.ts). With Protobuf selected, list
 * screens say so in a line of its own, before and after the request, and the
 * readout names the format the numbers are for. No text here is truncated.
 *
 * Changing the format only writes a setting. The next fetch reads it: nothing
 * is refetched behind the user's back, and no measurement is repeated or
 * discarded as a side effect of a tap.
 */

import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { palette, radius, spacing, type } from '../constants/theme';
import { formatKB, formatMs } from '../constants/units';
import type { SerializationFormat } from '../shared/contract';
import { SERIALIZATION_FORMATS } from '../shared/contract';
import { setFormat, useSettings } from '../src/settings/settings';
import { PrimaryButton, SecondaryButton, TextLink } from './Buttons';
import { Sheet, SheetLine } from './Sheet';

/** Short labels: the full names do not fit three-up on a small phone. */
export const LABELS: Record<SerializationFormat, string> = {
  json: 'JSON',
  msgpack: 'MsgPack',
  protobuf: 'Protobuf',
};

export const NAMES: Record<SerializationFormat, string> = {
  json: 'JSON',
  msgpack: 'MessagePack',
  protobuf: 'Protocol Buffers',
};

export interface LastMeasurement {
  payloadBytes: number;
  deserializationMs: number;
  heapDeltaBytes: number | null;
  format: SerializationFormat;
  /** Set when the selected format could not be used for this request. */
  formatFallbackFrom?: SerializationFormat | null;
}

/** Shown on list screens while Protobuf is selected. */
export const LIST_PROTOBUF_NOTE = 'Lists are sent as JSON. Protobuf is used on recipe pages.';

function describe(last: LastMeasurement | null, busy: boolean): string {
  if (busy) return 'Last response: measuring…';
  if (last === null) return 'Last response: none yet';
  const memory = last.heapDeltaBytes === null ? 'memory not reported' : `${formatKB(last.heapDeltaBytes)} memory`;
  // After a fallback the numbers are for the format actually used, so say which.
  const label = last.formatFallbackFrom ? `Last response (${LABELS[last.format]})` : 'Last response';
  return `${label}: ${formatKB(last.payloadBytes)} · decoded in ${formatMs(last.deserializationMs)} · ${memory}`;
}

export default function MetricsBar({
  last,
  busy = false,
  list = false,
}: {
  last: LastMeasurement | null;
  busy?: boolean;
  /** A list screen (Home, Search, Cook), whose requests cannot use Protobuf. */
  list?: boolean;
}) {
  const settings = useSettings();
  const [explaining, setExplaining] = useState(false);
  const protobufOnList = list && (settings.format === 'protobuf' || last?.formatFallbackFrom === 'protobuf');

  return (
    <View style={styles.bar}>
      <View style={styles.row}>
        <Text style={styles.label}>Format</Text>
        <View style={styles.segments} accessibilityRole="radiogroup" accessibilityLabel="Format for every request">
          {SERIALIZATION_FORMATS.map((format, i) => {
            const active = settings.format === format;
            return (
              <Pressable
                key={format}
                onPress={() => setFormat(format)}
                style={[styles.segment, i > 0 && styles.segmentDivider, active && styles.segmentActive]}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={NAMES[format]}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{LABELS[format]}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          onPress={() => setExplaining(true)}
          style={styles.explainButton}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="What these numbers mean"
        >
          <Text style={styles.explainButtonText}>Σ</Text>
        </Pressable>
      </View>

      {protobufOnList && <Text style={styles.note}>{LIST_PROTOBUF_NOTE}</Text>}
      <Text style={styles.readout}>{describe(last, busy)}</Text>

      <ExplainSheet visible={explaining} onClose={() => setExplaining(false)} />
    </View>
  );
}

const TERMS: readonly (readonly [string, string])[] = [
  ['Format', 'How the server sends the recipe: JSON, MessagePack or Protocol Buffers. Your choice applies to every request.'],
  ['Payload size', 'How much data came over the network, in KB (1 KB = 1,000 bytes).'],
  ['Decode time', 'How long this phone took to turn that data into a recipe, in milliseconds (ms).'],
  ['Memory (heap allocation)', 'How much memory the app used while decoding.'],
];

export function ExplainSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const go = (path: '/results' | '/metrics') => {
    onClose();
    router.push(path);
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="What these numbers mean">
      {TERMS.map(([term, text]) => (
        <SheetLine key={term} term={term}>
          {text}
        </SheetLine>
      ))}
      <SheetLine>
        Each line is one request while you browse, so the numbers vary. For a fair comparison, run the quick
        test or look at the paper results.
      </SheetLine>
      <View style={styles.sheetButtons}>
        <PrimaryButton label="Open results" onPress={() => go('/results')} />
        <SecondaryButton label="This session's requests" onPress={() => go('/metrics')} />
        <TextLink label="Close" onPress={onClose} style={{ alignSelf: 'center' }} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: palette.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { ...type.label, color: palette.body },
  segments: {
    flex: 1,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: palette.primary,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  segment: { flex: 1, minHeight: 32, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xs },
  segmentDivider: { borderLeftWidth: 1, borderLeftColor: palette.primary },
  segmentActive: { backgroundColor: palette.primary },
  segmentText: { ...type.label, color: palette.primary },
  segmentTextActive: { color: palette.surface },
  explainButton: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.primary,
  },
  explainButtonText: { color: palette.primary, fontSize: 15, fontWeight: '700' },
  note: { ...type.caption, color: palette.ink, marginTop: spacing.sm },
  readout: { ...type.caption, color: palette.body, marginTop: spacing.sm, fontVariant: ['tabular-nums'] },
  sheetButtons: { gap: spacing.sm, marginTop: spacing.sm },
});
