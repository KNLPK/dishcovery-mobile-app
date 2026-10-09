/**
 * src/bench/compareRuns.ts
 *
 * Between-run variation.
 *
 * A single run cannot distinguish a real effect from one lucky execution. The
 * within-run sd describes spread across repeats of the same decode on a warm
 * device in one thermal state; it says nothing about whether tomorrow's run
 * lands in the same place. Only repeated complete runs answer that.
 *
 * So each cell gets two spreads, reported side by side:
 *
 *   within-run  — sd over repeats inside one run (already in each aggregate)
 *   between-run — sd over the RUN MEANS, n = number of runs
 *
 * If the between-run sd is comparable to the difference between formats, the
 * ranking is not established no matter how tight any single run looked.
 */

import type { ComplexityTier, SerializationFormat } from '../../shared/contract';
import { BENCHMARK_CONFIG, COMPLEXITY_TIERS, SERIALIZATION_FORMATS } from '../../shared/contract';
import { describeSeries } from './calibration';
import {
  DRIFT_LIMIT_PERCENT,
  assessDrift,
  partitionRuns,
  runGaps,
  type ComparisonReference,
  type DriftReading,
  type ExcludedRun,
  type RunGap,
} from './comparability';
import { MIN_COOLDOWN_SECONDS } from './cooldown';
import { captureEnvironment } from './environment';
import { listRuns, readAggregate, readExclusion } from './storage';
import type { RunAggregate, RunExclusion } from './types';

export type { ComparisonReference, DriftReading, ExcludedRun, RunGap } from './comparability';

export interface CrossRunCell {
  format: SerializationFormat;
  tier: ComplexityTier;
  /** How many complete runs contributed. */
  runs: number;

  /** Each run's mean, in run order — the raw material for the figures below. */
  runMeanMs: number[];
  meanOfRunMeansMs: number;
  /** sd over run means, n−1, n = runs. */
  betweenRunSdMs: number;
  /** Mean of the within-run sds, for comparison against the line above. */
  meanWithinRunSdMs: number;
  /** betweenRunSd / meanOfRunMeans, as a percentage. */
  betweenRunCvPercent: number;

  runMeanHeapBytes: number[];
  meanOfRunMeansHeapBytes: number | null;
  betweenRunSdHeapBytes: number | null;
}

export interface CrossRunReport {
  /** The build every pooled run was checked against. */
  reference: ComparisonReference;
  runIds: string[];
  /** Runs left out of the pool, each with every specific mismatch named. */
  excluded: ExcludedRun[];
  /** Thermal state of EVERY completed run, pooled or not, so it can be read side by side. */
  thermal: { runId: string; gap: RunGap; drift: DriftReading[] | null }[];
  cells: CrossRunCell[];
  notes: string[];
}

/**
 * The reference is THIS BUILD, not the oldest run on the device.
 *
 * Using the first run as the reference was a defect: the oldest run on the
 * study phone is the 2026-09-26 debug pass, so once the real runs existed the
 * debug run would have become the reference, the three release runs would have
 * been excluded against it, and the invalid run would have been the one kept.
 * Anchoring on the running build makes the outcome independent of run order.
 */
export function currentReference(): ComparisonReference {
  const env = captureEnvironment(null);
  return {
    config: {
      prewarmDecodes: BENCHMARK_CONFIG.prewarmDecodes,
      warmupIterations: BENCHMARK_CONFIG.warmupIterations,
      measuredIterations: BENCHMARK_CONFIG.measuredIterations,
    },
    environment: {
      buildType: env.buildType,
      executionEnvironment: env.executionEnvironment,
      deviceModel: env.device.model,
      reactNativeVersion: env.runtime.reactNativeVersion,
      hermesVersion: env.runtime.hermesVersion,
      protobufjs: env.libraries.protobufjs,
      msgpack: env.libraries.msgpack,
    },
  };
}

export async function compareRuns(
  reference: ComparisonReference = currentReference()
): Promise<CrossRunReport> {
  const states = await listRuns();
  const loaded: RunAggregate[] = [];
  for (const state of states) {
    if (state.finishedAt === null) continue;
    const aggregate = await readAggregate(state.runId);
    if (aggregate !== null) loaded.push(aggregate);
  }

  // Oldest first, so "run order" reads chronologically.
  loaded.sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  if (loaded.length === 0) {
    return {
      reference,
      runIds: [],
      excluded: [],
      thermal: [],
      cells: [],
      notes: ['No completed runs on this device yet.'],
    };
  }

  const manual: RunExclusion[] = [];
  for (const a of loaded) {
    const m = await readExclusion(a.runId);
    if (m !== null) manual.push(m);
  }

  const { comparable, excluded } = partitionRuns(loaded, reference, manual);
  const gaps = runGaps(loaded);
  const thermal = loaded.map((a, i) => ({ runId: a.runId, gap: gaps[i], drift: assessDrift(a) }));

  const cells: CrossRunCell[] = [];
  for (const tier of COMPLEXITY_TIERS) {
    for (const format of SERIALIZATION_FORMATS) {
      const picked = comparable
        .map((a) => a.cells.find((c) => c.tier === tier && c.format === format))
        .filter((c): c is NonNullable<typeof c> => c !== undefined);
      if (picked.length === 0) continue;

      const means = picked.map((c) => c.meanMs);
      const msStats = describeSeries(means)!;
      const heapMeans = picked
        .map((c) => c.meanHeapBytesCorrected)
        .filter((v): v is number => v !== null);
      const heapStats = heapMeans.length > 0 ? describeSeries(heapMeans) : null;

      cells.push({
        format,
        tier,
        runs: picked.length,
        runMeanMs: means,
        meanOfRunMeansMs: msStats.mean,
        betweenRunSdMs: msStats.sd,
        meanWithinRunSdMs: picked.reduce((sum, c) => sum + c.sdMs, 0) / picked.length,
        betweenRunCvPercent: msStats.mean === 0 ? NaN : (msStats.sd / msStats.mean) * 100,
        runMeanHeapBytes: heapMeans,
        meanOfRunMeansHeapBytes: heapStats?.mean ?? null,
        betweenRunSdHeapBytes: heapStats?.sd ?? null,
      });
    }
  }

  const notes: string[] = [];
  if (comparable.length < 3) {
    notes.push(
      `Only ${comparable.length} comparable complete run${comparable.length === 1 ? '' : 's'}. ` +
        'Three are needed before between-run variation means anything; with one, the between-run ' +
        'sd is undefined and is reported as 0.'
    );
  }
  for (const ex of excluded) {
    notes.push(`Excluded ${ex.runId} (started ${ex.startedAt}): ${ex.reasons.join('; ')}.`);
  }
  notes.push(
    `Runs are refused when any format's sentinel drift exceeds ${DRIFT_LIMIT_PERCENT}%. The idle gap ` +
      `before each run is reported against a ${MIN_COOLDOWN_SECONDS / 60}-minute guideline but does ` +
      'not refuse on its own: the gap is the cause, drift is the measured effect.'
  );

  return {
    reference,
    runIds: comparable.map((a) => a.runId),
    excluded,
    thermal,
    cells,
    notes,
  };
}
