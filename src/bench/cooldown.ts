/**
 * src/bench/cooldown.ts
 *
 * Has the device been idle long enough to start a run?
 *
 * Type-only imports, so scripts/test-comparability.ts can load it under Node's
 * type stripping. runner.ts and the benchmark screen gather the activity list.
 */

import type { CooldownRecord } from './types';

/**
 * Minimum idle time between anything that loads the device and the start of a
 * run: 10 minutes.
 *
 * Why 10 minutes:
 *  - The only observed failure is a run started 57 s after the previous one
 *    finished, with a profile in between. It drifted +25.6% to +37.2%. Any
 *    floor of a few minutes would have caught it; the question is how much more
 *    margin to buy.
 *  - A run is about four to five minutes of sustained load on every core. A
 *    phone dissipates heat passively, through its body, and takes several
 *    minutes to shed what that much load deposits. Ten minutes, roughly twice
 *    the load it follows, is an engineering margin, NOT a figure measured on
 *    this device.
 *  - The cost is asymmetric. Ten idle minutes are cheap; a thermally
 *    contaminated run costs a run and, if it slipped through, the between-run
 *    variation the study reports.
 *  - It is checkable. Every run records its gap, and every run's drift is
 *    measured by its sentinels, so once the runs exist, drift against gap shows
 *    whether ten minutes was enough or more than needed.
 *
 * This guard WARNS and RECORDS; it does not refuse. Refusal acts on the measured
 * effect — sentinel drift, see comparability.DRIFT_LIMIT_PERCENT — not on the
 * cause.
 */
export const MIN_COOLDOWN_SECONDS = 600;

/** Something that loaded the device, and when it stopped. */
export interface DeviceActivity {
  kind: 'run' | 'cold-profile' | 'per-cell-profile';
  id: string;
  /** ISO timestamp at which the activity ended. */
  endedAt: string;
}

/**
 * The cooldown record for a run starting at `nowMs`.
 *
 * Takes the most recent activity that ended at or before `nowMs`. Activities
 * with unparseable timestamps are ignored rather than allowed to throw.
 */
export function assessCooldown(
  activities: DeviceActivity[],
  nowMs: number,
  overridden = false,
  minimumSeconds: number = MIN_COOLDOWN_SECONDS
): CooldownRecord {
  let latest: DeviceActivity | null = null;
  let latestMs = Number.NEGATIVE_INFINITY;
  for (const a of activities) {
    const t = Date.parse(a.endedAt);
    if (!Number.isFinite(t) || t > nowMs) continue;
    if (t > latestMs) {
      latest = a;
      latestMs = t;
    }
  }

  if (latest === null) {
    return {
      previousActivity: null,
      previousId: null,
      previousEndedAt: null,
      gapSeconds: null,
      minimumSeconds,
      satisfied: true,
      overridden: false,
    };
  }

  const gapSeconds = Math.round((nowMs - latestMs) / 1000);
  const satisfied = gapSeconds >= minimumSeconds;
  return {
    previousActivity: latest.kind,
    previousId: latest.id,
    previousEndedAt: latest.endedAt,
    gapSeconds,
    minimumSeconds,
    satisfied,
    // An override only means something when the guard actually objected.
    overridden: !satisfied && overridden,
  };
}

/** The fields of a run checkpoint this module needs. */
export interface RunTimes {
  runId: string;
  startedAt: string;
  finishedAt: string | null;
  lastCheckpointAt?: string;
}

/**
 * When a run stopped loading the device.
 *
 * Finished: its finish time. Not finished — stopped or killed — its LAST
 * CHECKPOINT: a killed run has no knowable elapsed duration, since nothing runs
 * after the kill to record one, whereas a checkpoint time is a recorded fact.
 * Falls back to the checkpoint file's modification time (`modifiedAt`, the same
 * fact read from the file system) for checkpoints written before the stamp
 * existed, and only then to the start time. A stopped run therefore always
 * counts; it can no longer walk through the guard.
 */
export function runActivity(run: RunTimes, modifiedAt: string | null): DeviceActivity {
  if (run.finishedAt !== null) return { kind: 'run', id: run.runId, endedAt: run.finishedAt };
  return {
    kind: 'run',
    id: `${run.runId} (stopped)`,
    endedAt: run.lastCheckpointAt ?? modifiedAt ?? run.startedAt,
  };
}

/** Seconds still to wait, 0 when the cooldown is satisfied. */
export function secondsRemaining(record: CooldownRecord): number {
  if (record.gapSeconds === null || record.satisfied) return 0;
  return record.minimumSeconds - record.gapSeconds;
}
