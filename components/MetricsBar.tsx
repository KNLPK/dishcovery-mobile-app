/**
 * components/MetricsBar.tsx
 *
 * The serialization format selector and the readout for the last request, in
 * one compact strip. Rendered on every screen that fetches, so the format is a
 * visible property of the app rather than a hidden benchmark parameter, and the
 * cost of the current choice is visible where the data lands.
 *
 * Two lines, fixed height, no scrolling:
 *
 *   [ JSON ] [ MsgPack ] [ Proto ]                         Σ
 *   4.6 KB · 1.82 ms decode · 61.5 KB heap · json
 *
 * Changing the format only writes a setting. The next fetch reads it — nothing
 * is refetched behind the user's back, and no measurement is repeated or
 * discarded as a side effect of a tap.
 */

import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { palette, radius, spacing, type } from '../constants/theme';
import type { SerializationFormat } from '../shared/contract';
import { SERIALIZATION_FORMATS } from '../shared/contract';
import { setFormat, useSettings } from '../src/settings/settings';

/** Short labels — the full names do not fit three-up on a small phone. */
const LABELS: Record<SerializationFormat, string> = {
  json: 'JSON',
  msgpack: 'MsgPack',
  protobuf: 'Proto',
};

export interface LastMeasurement {
  payloadBytes: number;
  deserializationMs: number;
  heapDeltaBytes: number | null;
  format: SerializationFormat;
  /** Set when the selected format could not be used for this request. */
  formatFallbackFrom?: SerializationFormat | null;
}

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export default function MetricsBar({
  last,
  busy = false,
}: {
  last: LastMeasurement | null;
  busy?: boolean;
}) {
  const settings = useSettings();
  const router = useRouter();

  return (
    <View style={styles.bar}>
      <View style={styles.row}>
        <View style={styles.pills}>
          {SERIALIZATION_FORMATS.map((format) => {
            const active = settings.format === format;
            return (
              <Pressable
                key={format}
                onPress={() => setFormat(format)}
                style={[styles.pill, active && styles.pillActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Use ${LABELS[format]} for every request`}
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]}>
                  {LABELS[format]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={() => router.push('/metrics')}
          style={styles.summaryButton}
          accessibilityRole="button"
          accessibilityLabel="Session measurement summary"
        >
          <Text style={styles.summaryButtonText}>Σ</Text>
        </Pressable>
      </View>

      <Text style={styles.readout} numberOfLines={1}>
        {busy
          ? 'measuring…'
          : last === null
            ? 'no request yet — results appear here'
            : `${kb(last.payloadBytes)} · ${last.deserializationMs.toFixed(2)} ms decode · ` +
              `${last.heapDeltaBytes === null ? 'heap n/a' : `${kb(last.heapDeltaBytes)} heap`} · ` +
              `${last.format}${
                last.formatFallbackFrom ? ` (${last.formatFallbackFrom} n/a here)` : ''
              }`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: palette.surfaceTint,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: palette.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pills: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexShrink: 1,
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  pillActive: {
    backgroundColor: palette.accent,
    borderColor: palette.accent,
  },
  pillText: {
    ...type.label,
    color: palette.muted,
  },
  pillTextActive: {
    color: palette.primary,
  },
  summaryButton: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  summaryButtonText: {
    color: palette.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  readout: {
    ...type.caption,
    color: palette.muted,
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },
});
