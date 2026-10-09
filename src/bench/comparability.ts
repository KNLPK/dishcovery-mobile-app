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
import type { RunAggregate } from './types';

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

/** Render a value read from a stored aggregate, which older code may not have written. */
function shown(value: unknown): string {
  return value === undefined ? 'absent' : value === null ? 'unknown' : String(value);
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
  ref: ComparisonReference
): { comparable: RunAggregate[]; excluded: ExcludedRun[] } {
  const comparable: RunAggregate[] = [];
  const excluded: ExcludedRun[] = [];
  for (const run of runs) {
    const reasons = comparabilityReasons(run, ref);
    if (reasons.length === 0) comparable.push(run);
    else excluded.push({ runId: run.runId, startedAt: run.startedAt, reasons });
  }
  return { comparable, excluded };
}
