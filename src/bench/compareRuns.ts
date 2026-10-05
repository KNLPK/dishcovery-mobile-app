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
import { COMPLEXITY_TIERS, SERIALIZATION_FORMATS } from '../../shared/contract';
import { describeSeries } from './calibration';
import { listRuns, readAggregate } from './storage';
import type { RunAggregate } from './types';

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
  runIds: string[];
  /** Runs excluded because their environment differs from the first run's. */
  excluded: { runId: string; reason: string }[];
  cells: CrossRunCell[];
  notes: string[];
}

/** Two runs are comparable only if they measured the same thing on the same thing. */
function environmentKey(a: RunAggregate): string {
  const e = a.environment;
  return [
    e.buildType,
    e.executionEnvironment,
    e.device.model ?? '?',
    e.runtime.reactNativeVersion ?? '?',
    e.runtime.hermesVersion ?? '?',
    e.libraries.protobufjs ?? '?',
    e.libraries.msgpack ?? '?',
    a.config.measuredIterations,
  ].join('|');
}

export async function compareRuns(): Promise<CrossRunReport> {
  const states = await listRuns();
  const loaded: RunAggregate[] = [];
  for (const state of states) {
    if (state.finishedAt === null) continue;
    const aggregate = await readAggregate(state.runId);
    if (aggregate !== null) loaded.push(aggregate);
  }

  // Oldest first, so "run order" reads chronologically.
  loaded.sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  const excluded: CrossRunReport['excluded'] = [];
  if (loaded.length === 0) {
    return { runIds: [], excluded, cells: [], notes: ['No completed runs on this device yet.'] };
  }

  const reference = environmentKey(loaded[0]);
  const comparable = loaded.filter((a) => {
    if (environmentKey(a) === reference) return true;
    excluded.push({
      runId: a.runId,
      reason: 'environment differs from the first run (build type, device, engine or library version)',
    });
    return false;
  });

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
  if (excluded.length > 0) {
    notes.push(`${excluded.length} run(s) excluded for a differing environment — see 'excluded'.`);
  }

  return { runIds: comparable.map((a) => a.runId), excluded, cells, notes };
}
