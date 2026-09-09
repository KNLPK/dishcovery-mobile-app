/**
 * src/api/measure.ts
 *
 * Measurement primitives, deliberately separated from transport so that the
 * production data path and the benchmark runner use the *same instruments*.
 * If these differ, the numbers are not comparable.
 *
 * Units policy:
 *   Raw counters (bytes, milliseconds) are the stored source of truth.
 *   Conversion to KB/MB happens only at the reporting boundary, so rounding
 *   error can never accumulate across aggregation.
 */

// ─── Timing ───────────────────────────────────────────────────────────────────

export interface Timed<T> {
  result: T;
  /** Fractional milliseconds from performance.now(). Not rounded. */
  elapsedMs: number;
}

/**
 * Time a synchronous call, bracketing the call and nothing else.
 *
 * Nothing may be added between the two clock reads — no logging, no
 * allocation, no unit conversion. That is the whole point of this helper.
 */
export function timeSync<T>(fn: () => T): Timed<T> {
  const start = performance.now();
  const result = fn();
  const end = performance.now();
  return { result, elapsedMs: end - start };
}

/** Time an asynchronous call (used for the network stage). */
export async function timeAsync<T>(fn: () => Promise<T>): Promise<Timed<T>> {
  const start = performance.now();
  const result = await fn();
  const end = performance.now();
  return { result, elapsedMs: end - start };
}

// ─── Hermes heap instrumentation ──────────────────────────────────────────────

/**
 * React Native 0.79.2 declares this API in
 * node_modules/react-native/flow/HermesInternalType.js:51 as:
 *
 *     +getInstrumentedStats?: () => {[string]: number | string, ...},
 *
 * Two things follow directly from that declaration, and both shape the code
 * below:
 *
 *   1. The method is OPTIONAL. React Native's own header comment instructs
 *      callers to "check explicitly at run-time whether the object(s) and
 *      method(s) exist, and fail safely if not."
 *   2. The return type is an OPEN dictionary. React Native documents it as
 *      "There are no guarantees about what keys exist in it." The key names are
 *      therefore a property of the Hermes build in the running binary, not
 *      something that can be determined from source.
 *
 * Consequently this module never assumes a key name. It probes the candidate
 * list below, reports WHICH key it actually read, and returns null when nothing
 * usable is present. It never substitutes an estimate.
 */

/** Minimal structural type for the part of HermesInternal we touch. */
interface HermesInstrumentation {
  getInstrumentedStats?: () => Record<string, number | string>;
  getRuntimeProperties?: () => Record<string, unknown>;
}

function hermes(): HermesInstrumentation | undefined {
  return (globalThis as { HermesInternal?: HermesInstrumentation }).HermesInternal;
}

/** True when the runtime is Hermes and exposes instrumented stats. */
export function isHeapInstrumentationAvailable(): boolean {
  return typeof hermes()?.getInstrumentedStats === 'function';
}

/**
 * The raw stats object, verbatim, or null.
 *
 * Call this to discover the key names on a given device — see
 * `describeHeapInstrumentation()` for a printable summary.
 */
export function getInstrumentedStats(): Record<string, number | string> | null {
  const fn = hermes()?.getInstrumentedStats;
  if (typeof fn !== 'function') return null;
  try {
    return fn();
  } catch {
    return null;
  }
}

/**
 * Candidate keys for cumulative heap allocation, most preferred first.
 *
 * PROVENANCE: these follow Hermes' documented `js_` instrumentation prefix.
 * They are NOT verified against this project's Hermes binary — React Native
 * guarantees no key names (see above). The key actually used is recorded in
 * every reading so the paper can cite the real one rather than this list.
 *
 * Prefer cumulative allocation counters over live-size counters: a live-size
 * measure (heap occupancy) drops when the garbage collector runs, which can
 * make a decode appear to allocate a negative amount.
 */
export const HEAP_STAT_CANDIDATES: readonly string[] = [
  'js_totalAllocatedBytes',
  'js_allocatedBytes',
  'js_heapSize',
  'js_mallocSizeEstimate',
];

export interface HeapSample {
  /** Raw byte count as reported by Hermes. Not rounded, not converted. */
  bytes: number;
  /** Which key this reading came from, for citation. */
  key: string;
}

/** One heap reading, or null when unavailable. */
export function readHeap(): HeapSample | null {
  const stats = getInstrumentedStats();
  if (stats === null) return null;

  for (const key of HEAP_STAT_CANDIDATES) {
    const value = stats[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return { bytes: value, key };
    }
  }
  return null;
}

/**
 * A printable description of what this device's Hermes actually exposes.
 * Intended to be logged once from a device so the field names can be recorded
 * in the methodology section.
 */
export function describeHeapInstrumentation(): {
  available: boolean;
  keys: string[];
  stats: Record<string, number | string> | null;
  selectedKey: string | null;
  runtimeProperties: Record<string, unknown> | null;
} {
  const stats = getInstrumentedStats();
  let runtimeProperties: Record<string, unknown> | null = null;
  try {
    runtimeProperties = hermes()?.getRuntimeProperties?.() ?? null;
  } catch {
    runtimeProperties = null;
  }

  return {
    available: stats !== null,
    keys: stats === null ? [] : Object.keys(stats).sort(),
    stats,
    selectedKey: readHeap()?.key ?? null,
    runtimeProperties,
  };
}

// ─── Combined decode instrument ───────────────────────────────────────────────

export interface DecodeMeasurement<T> {
  result: T;
  /** Decode duration in fractional milliseconds. Not rounded. */
  deserializationMs: number;
  /**
   * Heap bytes attributable to the decode, or null when the runtime exposes no
   * instrumentation. Never estimated.
   */
  heapDeltaBytes: number | null;
  /** Hermes key the heap delta was read from, or null. */
  heapStatKey: string | null;
}

/**
 * Measure a decode: heap immediately before, clock, decode, clock, heap
 * immediately after.
 *
 * Ordering is deliberate and identical for every format:
 *
 *   - The heap reads sit OUTSIDE the clock bracket, so the cost of reading
 *     Hermes stats is never charged to deserialization time.
 *   - The clock reads sit INSIDE the heap bracket. Two performance.now() calls
 *     are therefore included in the heap delta — a constant, format-independent
 *     overhead that biases all three formats equally and so cannot favour one.
 *
 * Every format goes through this one function. No format may be measured with a
 * different instrument.
 */
export function measureDecode<T>(decode: () => T): DecodeMeasurement<T> {
  const before = readHeap();

  const start = performance.now();
  const result = decode();
  const end = performance.now();

  const after = readHeap();

  const heapDeltaBytes =
    before !== null && after !== null && before.key === after.key
      ? after.bytes - before.bytes
      : null;

  return {
    result,
    deserializationMs: end - start,
    heapDeltaBytes,
    heapStatKey: before?.key ?? null,
  };
}

// ─── Unit conversion (reporting boundary only) ────────────────────────────────

/** Bytes -> kilobytes (1024). Unrounded; round only when rendering. */
export function bytesToKB(bytes: number): number {
  return bytes / 1024;
}

/** Bytes -> megabytes (1024^2). Unrounded; round only when rendering. */
export function bytesToMB(bytes: number): number {
  return bytes / (1024 * 1024);
}
