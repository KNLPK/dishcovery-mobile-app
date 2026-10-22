/**
 * src/quick/quickTest.ts
 *
 * The Quick test: a short benchmark anyone can run in under a minute.
 *
 * NOT THE PAPER PROTOCOL. It is a smaller version for demonstration:
 *
 *                           Quick test              Paper protocol
 *   payloads                30 (10 per tier,        250 (150 low, 50 medium,
 *                           generated only)          50 high; 100 Spoonacular)
 *   engine pre-warm         50 decodes per format   200 per format
 *   per payload x format    3 warm-up + 10 measured 10 warm-up + 30 measured
 *   drift sentinel          none                    start, middle, end
 *   cooldown, warm-up gate  none                    enforced and recorded
 *   protobuf toObject       not measured            measured separately
 *
 * The measurement itself is the paper's, unchanged: every decode goes through
 * the frozen measureDecode() and the frozen codecs from getCodec(), heap deltas
 * are corrected by the bracket offset from the frozen calibrateBracket(), and
 * summaries use the definitions of the paper's main table (time over decodes,
 * size and heap over payloads, % against JSON). This file imports that code and
 * changes none of it. Nothing here touches src/bench's run storage, so a Quick
 * test is never mixed into the paper runs or their comparison.
 */

import { getCodec } from '../api/codecs/types';
import { measureDecode } from '../api/measure';
import { calibrateBracket } from '../bench/calibration';
import { captureEnvironment, type RunEnvironment } from '../bench/environment';
import { COMPLEXITY_TIERS, ROUTES, SERIALIZATION_FORMATS } from '../../shared/contract';
import type { ComplexityTier, SerializationFormat } from '../../shared/contract';
import { loadOfflineDataset, type OfflineEntry } from '../offline/payloads';
import { setMeasuring } from '../ui/motionGate';
import { selectPayloads } from './selection';

export const QUICK_TEST_CONFIG = {
  payloadsPerTier: 10,
  prewarmDecodesPerFormat: 50,
  warmupIterations: 3,
  measuredIterations: 10,
  /** Same as the paper runner's bracket calibration. */
  calibrationRepeats: 30,
} as const;

export const QUICK_TEST_LABEL = 'Quick test — not the paper protocol';

export type QuickTestSource = { kind: 'offline' } | { kind: 'server'; baseUrl: string };

export interface QuickCell {
  tier: ComplexityTier;
  format: SerializationFormat;
  payloads: number;
  decodes: number;
  /** Wire size in kB (1000 bytes), mean over payloads. */
  kbMean: number;
  /** Decode time, ms, mean and sd over every measured decode. */
  msMean: number;
  msSd: number;
  /** Heap allocated per decode in MB (10^6 bytes), mean over payloads; null without the counter. */
  mbMean: number | null;
  kbPctVsJson: number | null;
  msPctVsJson: number | null;
  mbPctVsJson: number | null;
}

export interface QuickTestResult {
  protocol: 'quick-test';
  label: typeof QUICK_TEST_LABEL;
  id: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  source: { kind: 'offline'; bundleCommit: string } | { kind: 'server'; baseUrl: string };
  config: typeof QUICK_TEST_CONFIG;
  environment: RunEnvironment;
  bracketOffsetBytes: number | null;
  payloadIds: number[];
  cells: QuickCell[];
}

export interface QuickProgress {
  phase: 'loading' | 'prewarming' | 'calibrating' | 'measuring';
  done: number;
  total: number;
  label: string;
  /** Overall progress, 0 to 1, across all phases. */
  fraction: number;
  /** While measuring: the tier and format being decoded now. */
  tier?: ComplexityTier;
  format?: SerializationFormat;
}

/** Share of the progress bar each phase fills before measuring starts. */
const LOADED_AT = 0.05;
const PREWARMED_AT = 0.15;
const CALIBRATED_AT = 0.2;

/** Keeps decoded results reachable so the engine cannot skip the work. */
let sink: unknown = null;

const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
function sd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Request failed with status ${response.status} — ${url}`);
    return await response.arrayBuffer();
  } catch (err) {
    if (controller.signal.aborted) throw new Error(`Request timed out after 20 s — ${url}`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export type QuickTestOptions = {
  source: QuickTestSource;
  onProgress?: (p: QuickProgress) => void;
  shouldStop?: () => boolean;
};

/**
 * Runs the Quick test with the motion gate closed (src/ui/motionGate.ts): no
 * animation, toast or haptic starts from the first payload load to the last
 * measured decode, whether the run finishes, is stopped or fails.
 */
export async function runQuickTest(options: QuickTestOptions): Promise<QuickTestResult | null> {
  setMeasuring(true);
  try {
    return await run(options);
  } finally {
    setMeasuring(false);
  }
}

async function run(options: QuickTestOptions): Promise<QuickTestResult | null> {
  const { source, onProgress, shouldStop } = options;
  const startedAt = new Date();
  const config = QUICK_TEST_CONFIG;

  // ── Payloads: all bytes in memory before anything is measured ──
  onProgress?.({ phase: 'loading', done: 0, total: 1, label: 'loading payloads', fraction: 0 });
  await yieldToUi();
  const offline = loadOfflineDataset();
  const selected = selectPayloads(offline.entries, config.payloadsPerTier);
  const buffers = new Map<string, ArrayBuffer>();
  const k = (id: number, f: SerializationFormat) => `${id}:${f}`;

  let fetched = 0;
  for (const entry of selected) {
    for (const format of SERIALIZATION_FORMATS) {
      if (source.kind === 'offline') {
        buffers.set(k(entry.recipeId, format), offline.bytes(entry.recipeId, format));
      } else {
        buffers.set(
          k(entry.recipeId, format),
          await fetchBytes(`${source.baseUrl}${ROUTES.recipe(entry.recipeId, format)}`)
        );
        fetched++;
        if (fetched % 9 === 0) {
          onProgress?.({
            phase: 'loading',
            done: fetched,
            total: selected.length * 3,
            label: 'downloading payloads',
            fraction: (LOADED_AT * fetched) / (selected.length * 3),
          });
        }
      }
    }
  }
  if (shouldStop?.() === true) return null;

  // ── Engine pre-warm: one payload per tier, in turn, for each format ──
  const samples = COMPLEXITY_TIERS.map((tier) => selected.find((e) => e.tier === tier)!);
  for (const format of SERIALIZATION_FORMATS) {
    const codec = getCodec(format);
    for (let i = 0; i < config.prewarmDecodesPerFormat; i++) {
      const bytes = buffers.get(k(samples[i % samples.length].recipeId, format))!;
      sink = measureDecode(() => codec.decode(bytes)).result;
    }
    onProgress?.({
      phase: 'prewarming',
      done: SERIALIZATION_FORMATS.indexOf(format) + 1,
      total: SERIALIZATION_FORMATS.length,
      label: `${format} x ${config.prewarmDecodesPerFormat}`,
      fraction:
        LOADED_AT +
        ((PREWARMED_AT - LOADED_AT) * (SERIALIZATION_FORMATS.indexOf(format) + 1)) / SERIALIZATION_FORMATS.length,
      format,
    });
    await yieldToUi();
  }

  // ── Bracket offset, as in the paper runner ──
  onProgress?.({
    phase: 'calibrating',
    done: 0,
    total: 1,
    label: 'measuring the heap counter offset',
    fraction: PREWARMED_AT,
  });
  await yieldToUi();
  const offset = calibrateBracket(config.calibrationRepeats).stats?.mean ?? null;

  // ── Measurement ──
  interface Obs {
    entry: OfflineEntry;
    format: SerializationFormat;
    wire: number;
    ms: number[];
    heap: number[];
  }
  const observations: Obs[] = [];

  const units = selected.length * SERIALIZATION_FORMATS.length;
  for (let i = 0; i < selected.length; i++) {
    if (shouldStop?.() === true) return null;
    const entry = selected[i];
    for (const format of SERIALIZATION_FORMATS) {
      // Reported, and the UI given a frame, between blocks only: never inside
      // the warm-up + measured decodes of a block.
      const unit = i * SERIALIZATION_FORMATS.length + SERIALIZATION_FORMATS.indexOf(format);
      onProgress?.({
        phase: 'measuring',
        done: i,
        total: selected.length,
        label: `${entry.tier} ${entry.recipeId}`,
        fraction: CALIBRATED_AT + ((1 - CALIBRATED_AT) * unit) / units,
        tier: entry.tier,
        format,
      });
      await yieldToUi();
      if (shouldStop?.() === true) return null;
      const codec = getCodec(format);
      const bytes = buffers.get(k(entry.recipeId, format))!;
      for (let w = 0; w < config.warmupIterations; w++) {
        sink = measureDecode(() => codec.decode(bytes)).result;
      }
      const obs: Obs = { entry, format, wire: bytes.byteLength, ms: [], heap: [] };
      for (let m = 0; m < config.measuredIterations; m++) {
        const r = measureDecode(() => codec.decode(bytes));
        sink = r.result;
        obs.ms.push(r.deserializationMs);
        if (r.heapDeltaBytes !== null && offset !== null) obs.heap.push(r.heapDeltaBytes - offset);
      }
      observations.push(obs);
    }
  }
  onProgress?.({ phase: 'measuring', done: selected.length, total: selected.length, label: 'done', fraction: 1 });
  void sink;

  // ── Summary, with the paper table's definitions ──
  const cells: QuickCell[] = [];
  for (const tier of COMPLEXITY_TIERS) {
    let base: QuickCell | null = null;
    for (const format of SERIALIZATION_FORMATS) {
      const obs = observations.filter((o) => o.entry.tier === tier && o.format === format);
      if (obs.length === 0) continue;
      const allMs = obs.flatMap((o) => o.ms);
      const heapPerPayload = obs.filter((o) => o.heap.length > 0).map((o) => mean(o.heap));
      const cell: QuickCell = {
        tier,
        format,
        payloads: obs.length,
        decodes: allMs.length,
        kbMean: mean(obs.map((o) => o.wire)) / 1000,
        msMean: mean(allMs),
        msSd: sd(allMs),
        mbMean: heapPerPayload.length === obs.length ? mean(heapPerPayload) / 1e6 : null,
        kbPctVsJson: null,
        msPctVsJson: null,
        mbPctVsJson: null,
      };
      if (format === 'json') base = cell;
      else if (base !== null) {
        cell.kbPctVsJson = 100 * (cell.kbMean / base.kbMean - 1);
        cell.msPctVsJson = 100 * (cell.msMean / base.msMean - 1);
        cell.mbPctVsJson =
          cell.mbMean === null || base.mbMean === null ? null : 100 * (cell.mbMean / base.mbMean - 1);
      }
      cells.push(cell);
    }
  }

  const finishedAt = new Date();
  return {
    protocol: 'quick-test',
    label: QUICK_TEST_LABEL,
    id: `quick-${startedAt.toISOString().replace(/[:.]/g, '-')}`,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    source:
      source.kind === 'offline'
        ? { kind: 'offline', bundleCommit: offline.builtFromCommit }
        : { kind: 'server', baseUrl: source.baseUrl },
    config,
    environment: captureEnvironment(null),
    bracketOffsetBytes: offset,
    payloadIds: selected.map((e) => e.recipeId),
    cells,
  };
}
