/**
 * src/bench/calibration.ts
 *
 * The constant instrument overhead inside the heap bracket.
 *
 * measureDecode() places the two performance.now() calls INSIDE the heap
 * bracket (see src/api/measure.ts). Whatever they allocate is charged to every
 * reading, identically for all three formats. Running the same bracket around a
 * function that does nothing measures that overhead directly instead of
 * assuming it away.
 *
 * It cancels out of every BETWEEN-format comparison, because it is added to all
 * of them equally. It matters for absolute claims: "protobuf allocates X KB
 * decoding this document" must cite X minus this offset.
 *
 * This lives in src/bench/ rather than src/dev/ deliberately: the dev heap
 * probe is deleted before the final release build, and the benchmark runner
 * must keep working afterwards.
 */

import { measureDecode } from '../api/measure';

export interface Stats {
  n: number;
  mean: number;
  /** Sample standard deviation, n−1 denominator — the study's convention. */
  sd: number;
  min: number;
  max: number;
}

/** Arithmetic mean and sample sd (n−1). n=1 gives sd 0, never NaN. */
export function describeSeries(values: number[]): Stats | null {
  if (values.length === 0) return null;

  const n = values.length;
  const mean = values.reduce((sum, v) => sum + v, 0) / n;
  const variance =
    n < 2 ? 0 : values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1);

  return { n, mean, sd: Math.sqrt(variance), min: Math.min(...values), max: Math.max(...values) };
}

/**
 * The smallest unit this counter moves in.
 *
 * js_totalAllocatedBytes does not advance one byte at a time: Hermes rounds each
 * allocation up to a cell granularity, so every reading is a multiple of some
 * quantum. Inferring it from the data — the greatest common divisor of the gaps
 * between distinct observed values — turns an unexplained wobble into a known,
 * citable property of the instrument.
 *
 * Returns null when fewer than two distinct values were seen, because a single
 * value implies no quantum.
 */
export function inferQuantum(values: number[]): number | null {
  const distinct = [...new Set(values)].sort((a, b) => a - b);
  if (distinct.length < 2) return null;

  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  let q = 0;
  for (let i = 1; i < distinct.length; i++) {
    q = gcd(q, Math.abs(distinct[i] - distinct[i - 1]));
  }
  return q > 0 ? q : null;
}

/**
 * Relative tolerance for calling a heap reading constant.
 *
 * WHY A TOLERANCE, AND WHY THIS NUMBER
 * ------------------------------------
 * Requiring sd === 0 exactly makes the verdict hostage to the counter's own
 * quantisation. The first debug run reported JSON sd = 14.39 B on a mean of
 * 1,264,447 B — a 32-byte range, one quantum, a coefficient of variation of
 * 0.0011%. Calling that non-deterministic describes the instrument's
 * granularity, not the decoder.
 *
 * 1e-4 (0.01%) sits between the two magnitudes that matter:
 *
 *   - about 9x ABOVE the largest quantisation artefact observed (0.0011%), so
 *     one or two quanta on a megabyte cannot trip it;
 *   - about 270x BELOW the smallest real between-format difference in the data
 *     (msgpack vs protobuf at the low tier, 2.7%), so no effect the study cares
 *     about can hide underneath it.
 *
 * The threshold is recorded in every manifest, and the exact-equality result is
 * reported beside it, so a reader can apply either standard.
 */
export const DETERMINISM_CV_TOLERANCE = 1e-4;

export interface Constancy {
  /** sd === 0: every repeat returned the identical value. */
  exact: boolean;
  /** sd / |mean|. */
  cv: number;
  /** max - min, in bytes. */
  rangeBytes: number;
  /** The range in inferred quanta, when a quantum could be inferred. */
  rangeQuanta: number | null;
  /** Distinct values observed; 1 means perfectly constant. */
  distinctValues: number;
  /** exact, or cv within DETERMINISM_CV_TOLERANCE. */
  constant: boolean;
}

export function assessConstancy(values: number[], quantum: number | null): Constancy | null {
  const stats = describeSeries(values);
  if (stats === null) return null;

  const cv = stats.mean === 0 ? 0 : stats.sd / Math.abs(stats.mean);
  const rangeBytes = stats.max - stats.min;

  return {
    exact: stats.sd === 0,
    cv,
    rangeBytes,
    rangeQuanta: quantum === null || quantum === 0 ? null : rangeBytes / quantum,
    distinctValues: new Set(values).size,
    constant: stats.sd === 0 || cv <= DETERMINISM_CV_TOLERANCE,
  };
}

export interface BracketOffset {
  /** The offset to subtract, in bytes. null when the instrument is unavailable. */
  offsetBytes: number | null;
  before: Stats | null;
  after: Stats | null;
  /**
   * True when the two readings agree to within one allocation quantum.
   *
   * NOT exact equality. The first debug run measured 320 B before and 352 B
   * after and flagged it as drift; the difference is exactly 32 B, the same
   * quantum the JSON determinism spread showed. A one-quantum difference between
   * two readings of a quantised counter is the counter's resolution, not a leak,
   * and reporting it as instability was a false flag.
   */
  stable: boolean;
  /** after - before, in bytes. */
  driftBytes: number | null;
  /** The same difference in quanta. At most 1 is resolution, not drift. */
  driftQuanta: number | null;
  /** The quantum inferred from every offset sample collected. */
  quantumBytes: number | null;
  repeats: number;
  /** Plain-language account of what the numbers above mean. */
  explanation: string;
}

/**
 * A pre-allocated result returned by the no-op "decode". Allocating inside the
 * no-op would measure the allocation instead of the bracket.
 */
const NOOP_RESULT: object = {};

/** Runs the real bracket around a function that does no work. */
export function calibrateBracket(
  repeats: number,
  warmups = 5
): { stats: Stats | null; samples: number[] } {
  const deltas: number[] = [];

  for (let i = 0; i < warmups; i++) sink = measureDecode(() => NOOP_RESULT).result;

  for (let i = 0; i < repeats; i++) {
    const m = measureDecode(() => NOOP_RESULT);
    sink = m.result;
    if (m.heapDeltaBytes !== null) deltas.push(m.heapDeltaBytes);
  }

  return { stats: describeSeries(deltas), samples: deltas };
}

/**
 * Combine a before/after pair into the offset actually used for correction.
 *
 * `samples` carries every individual offset reading from both passes, so the
 * quantum is inferred from the instrument's own behaviour rather than assumed.
 */
export function resolveOffset(
  before: Stats | null,
  after: Stats | null,
  repeats: number,
  samples: number[]
): BracketOffset {
  const quantumBytes = inferQuantum(samples);
  const driftBytes = before === null || after === null ? null : after.mean - before.mean;
  const driftQuanta =
    driftBytes === null || quantumBytes === null || quantumBytes === 0
      ? null
      : driftBytes / quantumBytes;

  const stable =
    driftBytes !== null &&
    (driftBytes === 0 || (driftQuanta !== null && Math.abs(driftQuanta) <= 1));

  let explanation: string;
  if (before === null || after === null) {
    explanation = 'No offset could be measured: the heap counter was unavailable.';
  } else if (driftBytes === 0) {
    explanation =
      `The empty bracket allocated ${before.mean} B before and after the run - identical. The ` +
      'offset is a constant of this build and can be cited as one.';
  } else if (stable) {
    explanation =
      `The empty bracket allocated ${before.mean} B before the run and ${after.mean} B after, a ` +
      `difference of ${driftBytes} B. The counter's inferred allocation quantum is ` +
      `${quantumBytes} B, so that difference is ${driftQuanta === null ? '?' : Math.abs(driftQuanta)} ` +
      "quantum: the instrument resolution limit, not drift and not a leak, because this counter " +
      "cannot " +
      'report a change smaller than one quantum. Treated as stable; the before-run value is used ' +
      'for correction. The offset is identical for all three formats either way, so it cancels out ' +
      'of every between-format comparison and affects only absolute allocation figures.';
  } else {
    explanation =
      `The empty bracket allocated ${before.mean} B before the run and ${after.mean} B after, ` +
      `${driftBytes} B apart, which exceeds one ${quantumBytes ?? '?'} B quantum. That is real ` +
      'drift and must be investigated before absolute allocation figures are quoted. ' +
      'Between-format comparisons are unaffected: the offset applies equally to all three.';
  }

  return {
    offsetBytes: before?.mean ?? null,
    before,
    after,
    stable,
    driftBytes,
    driftQuanta,
    quantumBytes,
    repeats,
    explanation,
  };
}

/**
 * Written, never read, on purpose: keeps a decode from being eliminated as dead
 * code. Module scope because a local would be provably unused.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- deliberate sink.
let sink: unknown = null;
