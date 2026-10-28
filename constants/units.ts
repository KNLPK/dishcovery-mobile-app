/**
 * constants/units.ts
 *
 * How sizes and times are written everywhere in the app, so a number reads the
 * same on Home, in the session summary and next to the paper's.
 *
 *   KB   1 KB = 1,000 bytes, as in the paper (scripts/build-paper-results.ts
 *        and the Quick test both divide by 1000). One decimal: "4.9 KB".
 *   ms   two decimals: "2.08 ms". Anything under 0.01 ms is "< 0.01 ms",
 *        never "0.00 ms" (an empty list decodes in next to nothing).
 *
 * Display only: the frozen instruments in src/api/measure.ts keep their own
 * conversions, and nothing measured is rounded before it is stored.
 */

export const BYTES_PER_KB = 1000;

/** Decimals for a value in KB, wherever it is shown (charts included). */
export const KB_DIGITS = 1;
/** Decimals for a time in ms. */
export const MS_DIGITS = 2;

export function formatKB(bytes: number): string {
  return `${(bytes / BYTES_PER_KB).toFixed(KB_DIGITS)} KB`;
}

export function formatMs(ms: number): string {
  if (ms < 0.01) return '< 0.01 ms';
  return `${ms.toFixed(MS_DIGITS)} ms`;
}
