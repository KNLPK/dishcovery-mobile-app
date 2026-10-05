/**
 * src/api/metrics.ts
 *
 * Session-scoped store of what the app actually measured while it was used.
 *
 * This is a VIEW over measurements, never a source of them. It records what the
 * instruments in ./measure.ts already produced and computes summary statistics
 * for display. It does not time anything, does not touch a bracket, and adding
 * or removing it cannot change a single number the study reports.
 *
 * Deliberately in memory only. These are the numbers from this session's real
 * usage; persisting them would blur one session into the next and invite
 * treating casual browsing as a dataset. The formal dataset comes from the
 * benchmark runner, not from here.
 */

import type { ComplexityTier, SerializationFormat } from '../../shared/contract';
import { SERIALIZATION_FORMATS } from '../../shared/contract';

export type RequestKind = 'recipe' | 'search';

export interface MetricSample {
  /** Monotonic id, so lists have stable keys. */
  seq: number;
  kind: RequestKind;
  /** What was fetched — a recipe id, or the search query. */
  label: string;
  format: SerializationFormat;
  /** Bytes actually received. */
  payloadBytes: number;
  /** Request issued to body fully read. Fractional ms. */
  networkMs: number;
  /** Decode call only. Fractional ms. THE primary dependent variable. */
  deserializationMs: number;
  /** Heap bytes attributable to the decode, or null when unavailable. */
  heapDeltaBytes: number | null;
  tier: ComplexityTier | null;
  timestamp: number;
}

export interface Summary {
  n: number;
  mean: number;
  /** Sample standard deviation, n−1 denominator — the study's convention. */
  sd: number;
}

export interface FormatAggregate {
  format: SerializationFormat;
  n: number;
  /** Kilobytes (1024). */
  payloadKB: Summary | null;
  /** Milliseconds. */
  deserializationMs: Summary | null;
  /** Kilobytes (1024). null when the runtime reported no heap deltas. */
  heapKB: Summary | null;
  networkMs: Summary | null;
}

// ─── Statistics ───────────────────────────────────────────────────────────────

/**
 * Arithmetic mean and sample sd (n−1), matching the study's statistics exactly.
 * n=1 yields sd 0 rather than NaN, because a single observation has no spread
 * to report and NaN would render as garbage.
 */
export function summarise(values: number[]): Summary | null {
  if (values.length === 0) return null;

  const n = values.length;
  const mean = values.reduce((sum, v) => sum + v, 0) / n;
  const variance =
    n < 2 ? 0 : values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1);

  return { n, mean, sd: Math.sqrt(variance) };
}

// ─── Store ────────────────────────────────────────────────────────────────────

let samples: MetricSample[] = [];
let nextSeq = 1;

type Listener = (samples: MetricSample[]) => void;
const listeners = new Set<Listener>();

export function recordMetric(sample: Omit<MetricSample, 'seq'>): MetricSample {
  const recorded: MetricSample = { ...sample, seq: nextSeq++ };
  samples = [...samples, recorded];
  for (const listener of listeners) listener(samples);
  return recorded;
}

export function getMetrics(): MetricSample[] {
  return samples;
}

export function clearMetrics(): void {
  samples = [];
  for (const listener of listeners) listener(samples);
}

export function subscribeToMetrics(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

const KB = 1024;

/**
 * One row per format, in the contract's declared order so the table never
 * reorders itself as data arrives.
 */
export function aggregateByFormat(all: MetricSample[]): FormatAggregate[] {
  return SERIALIZATION_FORMATS.map((format) => {
    const rows = all.filter((s) => s.format === format);
    const heap = rows
      .map((s) => s.heapDeltaBytes)
      .filter((v): v is number => v !== null);

    return {
      format,
      n: rows.length,
      payloadKB: summarise(rows.map((s) => s.payloadBytes / KB)),
      deserializationMs: summarise(rows.map((s) => s.deserializationMs)),
      heapKB: summarise(heap.map((v) => v / KB)),
      networkMs: summarise(rows.map((s) => s.networkMs)),
    };
  });
}

/**
 * Percentage change of a value against the JSON baseline, per the study's
 * reporting convention. null when either side is missing, so a blank cell can
 * never be mistaken for "no difference".
 */
export function percentVsBaseline(value: number | null, baseline: number | null): number | null {
  if (value === null || baseline === null || baseline === 0) return null;
  return ((value - baseline) / baseline) * 100;
}
