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
 * Changing the format only writes a setting. The next fetch reads it: nothing
 * is refetched behind the user's back, and no measurement is repeated or
 * discarded as a side effect of a tap.
 */

import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette, radius, spacing, type } from '../constants/theme';
import { formatKB, formatMs } from '../constants/units';
import type { SerializationFormat } from '../shared/contract';
import { SERIALIZATION_FORMATS } from '../shared/contract';
import { setFormat, useSettings } from '../src/settings/settings';
import { PrimaryButton, SecondaryButton, TextLink } from './Buttons';

/** Short labels: the full names do not fit three-up on a small phone. */
const LABELS: Record<SerializationFormat, string> = {
  json: 'JSON',
  msgpack: 'MsgPack',
  protobuf: 'Protobuf',
};

const NAMES: Record<SerializationFormat, string> = {
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

function describe(last: LastMeasurement | null, busy: boolean): string {
  if (busy) return 'Last response: measuring…';
  if (last === null) return 'Last response: none yet';
  const memory = last.heapDeltaBytes === null ? 'memory not reported' : `${formatKB(last.heapDeltaBytes)} memory`;
  const fallback = last.formatFallbackFrom
    ? ` · sent as ${NAMES[last.format]}: ${NAMES[last.formatFallbackFrom]} is not available for this request`
    : '';
  return `Last response: ${formatKB(last.payloadBytes)} · decoded in ${formatMs(last.deserializationMs)} · ${memory}${fallback}`;
}

export default function MetricsBar({
  last,
  busy = false,
}: {
  last: LastMeasurement | null;
  busy?: boolean;
}) {
  const settings = useSettings();
  const [explaining, setExplaining] = useState(false);

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

      <Text style={styles.readout} numberOfLines={2}>
        {describe(last, busy)}
      </Text>

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

function ExplainSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const go = (path: '/results' | '/metrics') => {
    onClose();
    router.push(path);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.sheetLayer}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} accessibilityViewIsModal>
          <View style={styles.grabber} />
          <Text style={styles.sheetTitle} accessibilityRole="header">
            What these numbers mean
          </Text>
          {TERMS.map(([term, text]) => (
            <Text key={term} style={styles.sheetLine}>
              <Text style={styles.sheetTerm}>{term}: </Text>
              {text}
            </Text>
          ))}
          <Text style={styles.sheetNote}>
            Each line is one request while you browse, so the numbers vary. For a fair comparison, run the
            quick test or look at the paper results.
          </Text>
          <View style={styles.sheetButtons}>
            <PrimaryButton label="Open results" onPress={() => go('/results')} />
            <SecondaryButton label="This session's requests" onPress={() => go('/metrics')} />
            <TextLink label="Close" onPress={onClose} style={{ alignSelf: 'center' }} />
          </View>
        </View>
      </View>
    </Modal>
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
  readout: { ...type.caption, color: palette.body, marginTop: spacing.sm, fontVariant: ['tabular-nums'] },
  sheetLayer: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11, 43, 51, 0.4)' },
  sheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: palette.border, marginBottom: spacing.sm },
  sheetTitle: { ...type.section, color: palette.ink },
  sheetLine: { ...type.body, color: palette.body },
  sheetTerm: { fontWeight: '700', color: palette.ink },
  sheetNote: { ...type.body, color: palette.muted },
  sheetButtons: { gap: spacing.sm, marginTop: spacing.sm },
});
