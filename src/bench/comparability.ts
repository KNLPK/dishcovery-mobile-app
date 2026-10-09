/**
 * src/bench/comparability.ts
 *
 * Which runs may be pooled for between-run variation, and why the others may not.
 *
 * Kept free of runtime imports — every import here is type-only — so that
 * scripts/test-comparability.ts can load it under Node's type stripping and test
 * the refusal rule directly, without Expo, React Native or the file system.
 * compareRuns.ts supplies the reference for the running build and the storage.
 */

import type { RunEnvironment } from './environment';
import type { RunAggregate, RunExclusion } from './types';

/**
 * Largest end-to-start sentinel drift, in percent, a run may show and still be
 * pooled. Applied to every format; one format over the limit refuses the run.
 *
 * Why 5%:
 *  - A drift d that builds roughly linearly over a run shifts that run's mean by
 *    about d/2. At 5% that is ~2.5%, still below the smallest between-format
 *    difference in the pilot data (2.7%, msgpack against protobuf at the low
 *    tier). A larger drift could, on its own, move a cell by as much as the
 *    smallest effect the study reports.
 *  - Ratios between formats are protected further, because the three formats are
 *    interleaved payload by payload and a drift common to all of them cancels.
 *    Only the DIFFERENCE between formats' drifts biases a ratio, and that
 *    difference is bounded by the limit.
 *  - It sits far from both observed cases: a clean run drifted about 1.5%, the
 *    run that started 57 s after another drifted 25.6% to 37.2%.
 *
 * The sentinel is 30 decodes per format, so the drift estimate carries its own
 * noise. Its standard error and z are reported with every reason, so a refusal
 * close to the limit can be read for what it is. Erring toward refusal is
 * deliberate: a wrongly refused run costs one re-run, a wrongly pooled one
 * contaminates the between-run variation the study reports.
 */
export const DRIFT_LIMIT_PERCENT = 5;

/**
 * Measured decodes per format in each sentinel reading: 150.
 *
 * The limit above is only meaningful if the sentinel can resolve it. The drift
 * SE scales as 1/sqrt(n): at the original 30 decodes it was about 2.3% (sd
 * 0.75 ms on 8.4 ms), so 5% sat only ~2.2 SE out and a clean run crossed it by
 * noise about 3% of the time per format — across three formats and three runs,
 * roughly a one-in-four chance of discarding a good run for nothing. At 150 the
 * SE falls to about 1.0% and the limit sits about 4.9 SE out.
 *
 * The instrument is lengthened, not the threshold loosened. Cost: 120 extra
 * decodes x 3 formats x 3 readings = 1,080 over the old sentinel, 1,350 in all —
 * seconds. The sentinel is not part of the measured data, so this does not
 * change what any cell measures.
 */
export const SENTINEL_DECODES = 150;

/** What every pooled run must match. */
export interface ComparisonReference {
  config: { prewarmDecodes: number; warmupIterations: number; measuredIterations: number };
  environment: Pick<RunEnvironment, 'buildType' | 'executionEnvironment'> & {
    deviceModel: string | null;
    reactNativeVersion: string | null;
    hermesVersion: string | null;
    protobufjs: string | null;
    msgpack: string | null;
  };
}

export interface ExcludedRun {
  runId: string;
  startedAt: string;
  /** Every specific mismatch, each naming the field and both values. */
  reasons: string[];
}

/** One format's drift between the start and end sentinels, with its own noise. */
export interface DriftReading {
  format: string;
  startMeanMs: number;
  endMeanMs: number;
  driftPercent: number;
  /** Standard error of driftPercent from the two sentinels' sds, n = measured iterations. */
  standardErrorPercent: number;
  /** driftPercent / standardErrorPercent. */
  z: number;
  /** Decodes behind the smaller of the two readings. */
  sentinelDecodes: number;
}

/** Idle time before a run, as derived for the comparison. */
export interface RunGap {
  runId: string;
  /** null when no earlier activity is on record. */
  gapSeconds: number | null;
  previousActivity: string | null;
  previousId: string | null;
  /** 'recorded' when the run wrote its own cooldown block; 'derived' from run timestamps otherwise. */
  source: 'recorded' | 'derived';
}

/** Render a value read from a stored aggregate, which older code may not have written. */
function shown(value: unknown): string {
  return value === undefined ? 'absent' : value === null ? 'unknown' : String(value);
}

/**
 * Drift between the start and end sentinels, per format.
 *
 * Recomputed from the stored sentinels rather than read from the aggregate's own
 * drift block, because the standard error needs the sentinels' sds. Returns null
 * when the start or end sentinel is missing: drift unknown is not drift absent.
 */
export function assessDrift(run: RunAggregate): DriftReading[] | null {
  return driftFromSentinels(run.sentinels ?? [], run.config?.measuredIterations ?? 0);
}

/**
 * Drift and its standard error from start and end sentinel readings.
 *
 * The decode count comes from each reading itself; `fallbackDecodes` is used
 * only for readings written before the count was recorded (they used
 * measuredIterations). The runner uses this same function for the aggregate,
 * so the drift in the file and the drift the comparison acts on cannot differ.
 */
export function driftFromSentinels(
  sentinels: RunAggregate['sentinels'],
  fallbackDecodes: number
): DriftReading[] | null {
  const start = sentinels.find((x) => x.at === 'start');
  const end = sentinels.find((x) => x.at === 'end');
  if (start === undefined || end === undefined) return null;

  const n0 = start.decodes ?? fallbackDecodes;
  const n1 = end.decodes ?? fallbackDecodes;
  const readings: DriftReading[] = [];
  for (const s0 of start.perFormat) {
    const s1 = end.perFormat.find((f) => f.format === s0.format);
    if (s1 === undefined || s0.meanMs === 0 || !Number.isFinite(s0.meanMs)) continue;
    const driftPercent = ((s1.meanMs - s0.meanMs) / s0.meanMs) * 100;
    const se =
      n0 > 0 && n1 > 0
        ? (Math.sqrt(s0.sd ** 2 / n0 + s1.sd ** 2 / n1) / s0.meanMs) * 100
        : Number.NaN;
    readings.push({
      format: s0.format,
      startMeanMs: s0.meanMs,
      endMeanMs: s1.meanMs,
      driftPercent,
      standardErrorPercent: se,
      z: se > 0 ? driftPercent / se : Number.NaN,
      sentinelDecodes: Math.min(n0, n1),
    });
  }
  return readings;
}

/** Thermal reasons to refuse a run. Empty when its drift is within the limit. */
export function driftReasons(run: RunAggregate): string[] {
  const readings = assessDrift(run);
  if (readings === null) {
    return ['no start and end sentinel, so thermal drift is unknown and cannot be shown to be within limits'];
  }
  return readings
    .filter((r) => Math.abs(r.driftPercent) > DRIFT_LIMIT_PERCENT)
    .map(
      (r) =>
        `drift ${r.format} ${r.driftPercent >= 0 ? '+' : ''}${r.driftPercent.toFixed(1)}% ` +
        `(sentinel ${r.startMeanMs.toFixed(2)} -> ${r.endMeanMs.toFixed(2)} ms, ` +
        `SE ${r.standardErrorPercent.toFixed(1)}%, z ${r.z.toFixed(1)}) exceeds the ` +
        `${DRIFT_LIMIT_PERCENT}% limit`
    );
}

/**
 * Idle time before each run.
 *
 * A run that recorded its own cooldown block is reported from that, because it
 * also knows about profiles run in the gap. Older runs fall back to the gap
 * between their start and the latest earlier run's finish. Recorded, not a
 * refusal criterion on its own: the gap is the cause, drift is the measured
 * effect, and it is the effect the comparison acts on.
 */
export function runGaps(runs: RunAggregate[]): RunGap[] {
  return runs.map((run) => {
    const recorded = run.cooldown;
    if (recorded !== undefined && recorded !== null) {
      return {
        runId: run.runId,
        gapSeconds: recorded.gapSeconds,
        previousActivity: recorded.previousActivity,
        previousId: recorded.previousId,
        source: 'recorded' as const,
      };
    }
    const started = Date.parse(run.startedAt);
    let previous: RunAggregate | null = null;
    for (const other of runs) {
      if (other.runId === run.runId || !other.finishedAt) continue;
      const finished = Date.parse(other.finishedAt);
      if (finished > started) continue;
      if (previous === null || finished > Date.parse(previous.finishedAt)) previous = other;
    }
    return {
      runId: run.runId,
      gapSeconds: previous === null ? null : Math.round((started - Date.parse(previous.finishedAt)) / 1000),
      previousActivity: previous === null ? null : 'run',
      previousId: previous?.runId ?? null,
      source: 'derived' as const,
    };
  });
}

/**
 * Every way a run differs from the reference. Empty means it may be pooled.
 *
 * CONFIG IS A REFUSAL CRITERION, NOT ONLY ENVIRONMENT. The 2026-10-08 run is a
 * release build on the study device with warmupIterations 3 and no pre-warm: an
 * environment-only check passes it, and it would then be pooled with runs that
 * used a different warm-up. Its cold-start bias would enter the between-run sd
 * and read as run-to-run variation. A field missing from an older aggregate is a
 * mismatch too, never a pass: a run written before prewarmDecodes existed had
 * no pre-warm at all.
 *
 * Each reason names the field and both values, so an exclusion can be checked
 * against the stored file rather than taken on trust.
 */
export function comparabilityReasons(run: RunAggregate, ref: ComparisonReference): string[] {
  const reasons: string[] = [];
  const config = (run.config ?? {}) as Partial<ComparisonReference['config']>;

  for (const field of ['prewarmDecodes', 'warmupIterations', 'measuredIterations'] as const) {
    if (config[field] !== ref.config[field]) {
      reasons.push(
        `config.${field} ${shown(config[field])} vs ${ref.config[field]} on this build` +
          (config[field] === undefined && field === 'prewarmDecodes'
            ? ' (written before pre-warm existed, so this run had none)'
            : '')
      );
    }
  }

  // Optional chaining throughout: an aggregate written by older code may be
  // missing whole blocks, and that must refuse rather than throw.
  const e = run.environment as Partial<RunEnvironment> | undefined;
  const checks: [string, unknown, unknown][] = [
    ['buildType', e?.buildType, ref.environment.buildType],
    ['executionEnvironment', e?.executionEnvironment, ref.environment.executionEnvironment],
    ['device.model', e?.device?.model, ref.environment.deviceModel],
    ['runtime.reactNativeVersion', e?.runtime?.reactNativeVersion, ref.environment.reactNativeVersion],
    ['runtime.hermesVersion', e?.runtime?.hermesVersion, ref.environment.hermesVersion],
    ['libraries.protobufjs', e?.libraries?.protobufjs, ref.environment.protobufjs],
    ['libraries.msgpack', e?.libraries?.msgpack, ref.environment.msgpack],
  ];
  for (const [field, theirs, ours] of checks) {
    if (theirs !== ours) reasons.push(`${field} ${shown(theirs)} vs ${shown(ours)} on this build`);
  }

  // Thermal: a run with 37% drift is not comparable to one with 1.5% whatever
  // its config says.
  reasons.push(...driftReasons(run));

  return reasons;
}

/**
 * Split runs into those that may be pooled and those that may not.
 *
 * Every run is judged against the same fixed reference, never against another
 * run, so the outcome cannot depend on which run happens to be oldest.
 */
export function partitionRuns(
  runs: RunAggregate[],
  ref: ComparisonReference,
  manual: RunExclusion[] = []
): { comparable: RunAggregate[]; excluded: ExcludedRun[] } {
  const comparable: RunAggregate[] = [];
  const excluded: ExcludedRun[] = [];
  const byId = new Map(manual.map((m) => [m.runId, m]));
  for (const run of runs) {
    const reasons: string[] = [];
    // A manual exclusion is listed first: it is the decision on record, and any
    // automatic reasons below it are corroboration.
    const m = byId.get(run.runId);
    if (m !== undefined) reasons.push(`excluded by hand on ${m.excludedAt}: ${m.reason}`);
    reasons.push(...comparabilityReasons(run, ref));
    if (reasons.length === 0) comparable.push(run);
    else excluded.push({ runId: run.runId, startedAt: run.startedAt, reasons });
  }
  return { comparable, excluded };
}
