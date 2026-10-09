/**
 * src/bench/warmupRules.ts
 *
 * When has a decoder settled, and what does a set of cold profiles add up to?
 *
 * Kept free of runtime imports — every import here is type-only — so that
 * scripts/test-warmup.ts can load it under Node's type stripping. runner.ts does
 * the measuring and passes the format list and current config in.
 */

import type { SerializationFormat } from '../../shared/contract';
import type {
  OutlierWindow,
  WarmupFormatSummary,
  WarmupProfileReport,
  WarmupProfileSeries,
  WarmupWindow,
} from './types';

export type { OutlierWindow } from './types';

/** A window whose mean is within this fraction of steady state counts as settled. */
export const WARMUP_MEAN_BAND = 0.05;
/** ...and whose sd is within this multiple of the steady-state sd. */
export const WARMUP_SD_BAND = 1.5;
/** Absolute slack on the sd band, so a near-zero steady-state sd cannot make every window fail. */
export const WARMUP_SD_FLOOR_MS = 0.05;

/**
 * How many CONSECUTIVE out-of-band windows count as "not settled" rather than
 * as an interruption.
 *
 * A system interruption — a GC pause, a scheduler preemption, a background sync
 * — lands in one window, occasionally two adjacent ones. A decoder that has not
 * finished warming stays out of band for a sustained stretch. Three windows of
 * ten decodes is thirty consecutive decodes, longer than any interruption seen
 * in the profiles (the longest was two adjacent windows, json at 61 and 71 in
 * the msgpack-led session), and short enough that a genuine slow warm-up still
 * registers.
 */
export const ROBUST_RUN_LENGTH = 3;

/**
 * Multiple applied to the cold requirement to get prewarmDecodes. Pre-warm is
 * paid once per run, so headroom costs seconds.
 */
export const PREWARM_HEADROOM = 2;
/** Pre-warm is reported in round numbers; nothing turns on the last few decodes. */
export const PREWARM_ROUNDING = 50;

export interface SettleAnalysis {
  /**
   * STRICT, the original rule: the first window from which EVERY later window is
   * in band, judged against the single final window. One stray window anywhere
   * in the pass inflates it, and a stray FINAL window shifts the reference for
   * every other window too.
   */
  strict: number | null;
  /**
   * ROBUST: judged against the median of the second half of the pass, and
   * tolerating isolated excursions shorter than ROBUST_RUN_LENGTH windows.
   */
  robust: number | null;
  /** strict - robust: what the outliers were costing. null if either is null. */
  outlierCost: number | null;
  /** The robust steady state: medians over the second half of the windows. */
  referenceMeanMs: number | null;
  referenceSdMs: number | null;
  /** Out-of-band windows at or after the robust settle point — the interruptions. */
  outliers: OutlierWindow[];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function inBand(w: WarmupWindow, refMean: number, refSd: number): boolean {
  const meanOk = refMean === 0 ? true : Math.abs(w.meanMs - refMean) / refMean <= WARMUP_MEAN_BAND;
  const sdOk = w.sdMs <= Math.max(refSd * WARMUP_SD_BAND, refSd + WARMUP_SD_FLOOR_MS);
  return meanOk && sdOk;
}

/** Iterations to discard if settling begins at window i. */
function warmupAt(windows: WarmupWindow[], i: number): number {
  return windows[i].fromIteration - 1;
}

/**
 * Both settle points for one profile, computed from its windows alone.
 *
 * Works on stored windows, so profiles saved before this rule existed are
 * re-judged without being re-run.
 */
export function analyseSettling(windows: WarmupWindow[]): SettleAnalysis {
  const empty: SettleAnalysis = {
    strict: null,
    robust: null,
    outlierCost: null,
    referenceMeanMs: null,
    referenceSdMs: null,
    outliers: [],
  };
  if (windows.length === 0) return empty;

  // ── Strict: unchanged from the original rule, so the two can be compared. ──
  const final = windows[windows.length - 1];
  let strict: number | null = null;
  for (let i = 0; i < windows.length; i++) {
    const ok = windows.slice(i).every((w) => inBand(w, final.meanMs, final.sdMs));
    if (ok) {
      strict = warmupAt(windows, i);
      break;
    }
  }

  // ── Robust reference: medians over the second half. ──
  // The second half, because the first half is where warm-up lives; the median,
  // because one spike cannot move it.
  const tail = windows.slice(Math.floor(windows.length / 2));
  const referenceMeanMs = median(tail.map((w) => w.meanMs));
  const referenceSdMs = median(tail.map((w) => w.sdMs));
  const ok = windows.map((w) => inBand(w, referenceMeanMs, referenceSdMs));

  // First window that is itself in band and is followed by no run of
  // ROBUST_RUN_LENGTH or more consecutive out-of-band windows. Isolated spikes
  // are tolerated; a sustained shift, which is what unfinished warm-up looks
  // like, is not.
  let robust: number | null = null;
  let robustIndex = -1;
  for (let i = 0; i < windows.length; i++) {
    if (!ok[i]) continue;
    let run = 0;
    let sustained = false;
    for (let j = i; j < windows.length; j++) {
      run = ok[j] ? 0 : run + 1;
      if (run >= ROBUST_RUN_LENGTH) {
        sustained = true;
        break;
      }
    }
    if (!sustained) {
      robust = warmupAt(windows, i);
      robustIndex = i;
      break;
    }
  }

  const outliers: OutlierWindow[] =
    robustIndex < 0
      ? []
      : windows
          .slice(robustIndex)
          .filter((_, k) => !ok[robustIndex + k])
          .map((w) => ({
            fromIteration: w.fromIteration,
            meanMs: w.meanMs,
            sdMs: w.sdMs,
            percentVsReference:
              referenceMeanMs === 0 ? 0 : ((w.meanMs - referenceMeanMs) / referenceMeanMs) * 100,
          }));

  return {
    strict,
    robust,
    outlierCost: strict !== null && robust !== null ? strict - robust : null,
    referenceMeanMs,
    referenceSdMs,
    outliers,
  };
}

const maxOrNull = (values: (number | null)[]): number | null => {
  const present = values.filter((v): v is number => v !== null);
  return present.length > 0 ? Math.max(...present) : null;
};

/**
 * Combine every ordering into the figure that sizes prewarmDecodes.
 *
 * Both settle points are recomputed from each profile's stored windows. The
 * ROBUST maximum is what sizes the pre-warm; the strict maximum is reported
 * beside it so the cost of the interruptions is visible rather than hidden.
 * Either way the rule across profiles is the maximum, never a mean: a mean would
 * let an ordering that understated a format pull the figure down.
 */
export function combineProfileReports(
  reports: WarmupProfileReport[],
  formats: readonly SerializationFormat[],
  current: { warmupIterations: number; prewarmDecodes: number }
): WarmupProfileSeries {
  const perFormat: WarmupFormatSummary[] = formats.map((format) => {
    const observations = reports.flatMap((report) => {
      const profile = report.profiles.find((p) => p.format === format);
      if (profile === undefined) return [];
      const analysis = analyseSettling(profile.windows);
      const first = profile.windows[0];
      return [
        {
          leadFormat: report.leadFormat,
          positionInOrder: profile.positionInOrder,
          strictWarmup: analysis.strict,
          robustWarmup: analysis.robust,
          outliers: analysis.outliers,
          firstWindowMeanMs: first?.meanMs ?? null,
          firstWindowSdMs: first?.sdMs ?? null,
        },
      ];
    });

    const cold = observations.find((o) => o.positionInOrder === 1);
    return {
      format,
      observations,
      maxRecommended: maxOrNull(observations.map((o) => o.robustWarmup)),
      maxStrict: maxOrNull(observations.map((o) => o.strictWarmup)),
      coldRecommended: cold?.robustWarmup ?? null,
      coldStrict: cold?.strictWarmup ?? null,
    };
  });

  const seenLeads = new Set(reports.map((r) => r.leadFormat));
  const missingLeads = formats.filter((f) => !seenLeads.has(f));

  const coldRequirement = maxOrNull(perFormat.map((f) => f.maxRecommended));
  const coldRequirementStrict = maxOrNull(perFormat.map((f) => f.maxStrict));

  // The cold requirement sizes the PRE-WARM, never warmupIterations.
  const recommendedPrewarm =
    coldRequirement === null
      ? null
      : Math.max(
          current.prewarmDecodes,
          Math.ceil((coldRequirement * PREWARM_HEADROOM) / PREWARM_ROUNDING) * PREWARM_ROUNDING
        );

  const neverSettled = perFormat.filter(
    (f) => f.observations.length > 0 && f.observations.every((o) => o.robustWarmup === null)
  );
  const outlierCount = perFormat.reduce(
    (sum, f) => sum + f.observations.reduce((s, o) => s + o.outliers.length, 0),
    0
  );

  const parts: string[] = [];
  parts.push(
    missingLeads.length === 0
      ? `All ${formats.length} orderings are present, so every format has one cold ` +
          'measurement and the ordering confound is removed.'
      : `INCOMPLETE — no session has led with ${missingLeads.join(' or ')}, so ` +
          `${missingLeads.join(' and ')} ${missingLeads.length === 1 ? 'has' : 'have'} not been ` +
          'measured from cold and the figure below is a lower bound.'
  );
  parts.push(
    `Settling is judged ROBUSTLY: against the median of the second half of each pass, tolerating ` +
      `isolated excursions shorter than ${ROBUST_RUN_LENGTH} consecutive windows, which are ` +
      `interruptions rather than warm-up. Robust requirement ${coldRequirement ?? '—'}; the strict ` +
      `rule (every later window in band, against the final window) gives ` +
      `${coldRequirementStrict ?? '—'}. ${outlierCount} outlier window(s) account for the ` +
      'difference and are listed per profile.'
  );
  parts.push(
    'The value taken is the MAXIMUM across every format in every ordering, applied identically to ' +
      'all three formats. It is an ENGINE figure and sizes prewarmDecodes, paid once per run; it is ' +
      'NOT warmupIterations, which is paid on all 750 cells with the engine already warm.'
  );
  if (neverSettled.length > 0) {
    parts.push(
      `${neverSettled.map((f) => f.format).join(', ')} never settled within the pass in any ` +
        'ordering, even robustly — raise the iteration count before trusting any recommendation.'
    );
  }

  return {
    reports,
    perFormat,
    missingLeads,
    coldRequirement,
    coldRequirementStrict,
    recommendedPrewarm,
    prewarmHeadroom: PREWARM_HEADROOM,
    currentPrewarm: current.prewarmDecodes,
    currentWarmup: current.warmupIterations,
    note: parts.join(' '),
  };
}
