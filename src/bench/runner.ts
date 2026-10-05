/**
 * src/bench/runner.ts
 *
 * The benchmark runner: 250 payloads × 3 formats × (3 warm-up + 30 measured).
 *
 * ACQUISITION IS SEPARATE FROM MEASUREMENT
 * ----------------------------------------
 * Every payload is fetched once per format BEFORE any measurement begins, and
 * the raw ArrayBuffers are held in memory (~5 MB for the whole dataset). The
 * measurement phase then makes zero network calls. That is how the declared
 * control variable — a fixed local connection with network variability
 * eliminated — is actually honoured, rather than merely asserted. Acquisition
 * failures are collected and reported separately; they never appear as
 * measurement noise.
 *
 * WHAT THIS FILE MAY NOT DO
 * -------------------------
 * It may not time anything itself. Every reading comes from measureDecode() in
 * src/api/measure.ts, unchanged, which is the same instrument the production
 * screens use. This file decides WHAT to measure and WHEN; it never decides HOW.
 */

import {
  BENCHMARK_CONFIG,
  COMPLEXITY_TIERS,
  ROUTES,
  SERIALIZATION_FORMATS,
  type ComplexityTier,
  type DatasetEntry,
  type DatasetResponse,
  type SerializationFormat,
} from '../../shared/contract';
import { resolveBaseUrl } from '../api/baseUrl';
import { getCodec } from '../api/codecs/types';
import { measureDecode, timeSync } from '../api/measure';
import {
  DETERMINISM_CV_TOLERANCE,
  assessConstancy,
  calibrateBracket,
  describeSeries,
  inferQuantum,
  resolveOffset,
} from './calibration';
import { captureEnvironment, type RunEnvironment } from './environment';
import {
  CHUNK_PAYLOADS,
  ensureRunDir,
  listWarmupProfiles,
  readCheckpoint,
  readChunk,
  readPerCellProfile,
  savePerCellProfile,
  saveWarmupProfile,
  writeAggregate,
  writeChunk,
  writeCheckpoint,
} from './storage';
import type {
  AcquisitionFailure,
  PerCellBias,
  ProfileEnvironment,
  WarmupSufficiency,
  PerCellIteration,
  PerCellProfile,
  PerCellProfileReport,
  WarmupFormatSummary,
  WarmupProfile,
  WarmupProfileReport,
  WarmupProfileSeries,
  WarmupWindow,
  CellAggregate,
  DecodeRow,
  DeterminismCheck,
  RunAggregate,
  RunCheckpoint,
  SentinelDrift,
  SentinelReading,
} from './types';

/** Repeats used for the bracket-offset calibration. */
const CALIBRATION_REPEATS = 30;

export interface Progress {
  phase:
    | 'dataset'
    | 'acquiring'
    | 'prewarming'
    | 'calibrating'
    | 'determinism'
    | 'measuring'
    | 'writing'
    | 'done';
  done: number;
  total: number;
  label: string;
  /** Milliseconds remaining, once enough cells have run to estimate. */
  etaMs: number | null;
}

export interface RunOptions {
  /** Resume this run id instead of starting a new one. */
  resumeRunId?: string;
  onProgress?: (p: Progress) => void;
  /** Checked between payloads; returning true stops cleanly at a checkpoint. */
  shouldStop?: () => boolean;
  /**
   * Proceed even when the configured warm-up was measured insufficient HERE.
   *
   * The run refuses by default, because a run collected under known-insufficient
   * warm-up is not worth the minutes it takes. The override exists so the refusal
   * is a decision rather than a wall, and it is recorded in the manifest.
   */
  overrideInsufficientWarmup?: boolean;
}

export interface RunOutcome {
  checkpoint: RunCheckpoint;
  aggregate: RunAggregate | null;
  stoppedEarly: boolean;
}

/** Kept alive so a decode can never be eliminated as dead code. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- deliberate sink.
let sink: unknown = null;

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function newRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

// ─── Acquisition ──────────────────────────────────────────────────────────────

type Buffers = Map<string, ArrayBuffer>;

const key = (id: number, format: SerializationFormat) => `${id}:${format}`;

async function acquire(
  entries: DatasetEntry[],
  onProgress: RunOptions['onProgress']
): Promise<{ buffers: Buffers; failures: AcquisitionFailure[] }> {
  const buffers: Buffers = new Map();
  const failures: AcquisitionFailure[] = [];
  const base = resolveBaseUrl();
  const total = entries.length * SERIALIZATION_FORMATS.length;
  let done = 0;

  for (const entry of entries) {
    for (const format of SERIALIZATION_FORMATS) {
      try {
        const response = await fetch(`${base}${ROUTES.recipe(entry.recipeId, format)}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        buffers.set(key(entry.recipeId, format), await response.arrayBuffer());
      } catch (err) {
        failures.push({
          payloadId: entry.recipeId,
          format,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      done++;
      if (done % 15 === 0) {
        onProgress?.({ phase: 'acquiring', done, total, label: `${done}/${total} payloads`, etaMs: null });
        await yieldToUi();
      }
    }
  }

  onProgress?.({ phase: 'acquiring', done: total, total, label: 'acquired', etaMs: null });
  return { buffers, failures };
}

// ─── One measured cell ────────────────────────────────────────────────────────

/**
 * Warm up, then measure, decoding the SAME buffer every time. Nothing but
 * decoding varies between iterations.
 */
function measureCell(
  entry: DatasetEntry,
  format: SerializationFormat,
  bytes: ArrayBuffer,
  runId: string,
  offsetBytes: number | null
): DecodeRow[] {
  const codec = getCodec(format);
  const materialize = codec.toPlainObject;
  const cellStartedAt = Date.now();

  for (let i = 0; i < BENCHMARK_CONFIG.warmupIterations; i++) {
    sink = measureDecode(() => codec.decode(bytes)).result;
  }

  const rows: DecodeRow[] = [];
  for (let i = 0; i < BENCHMARK_CONFIG.measuredIterations; i++) {
    const m = measureDecode(() => codec.decode(bytes));
    sink = m.result;

    // SECONDARY, protobuf only: an independent decode followed by toObject, in
    // one bracket. Run after the primary so the primary reading and its heap
    // delta are untouched, and recorded in its own column — never substituted.
    let withMaterialization: number | null = null;
    if (materialize !== undefined) {
      withMaterialization = timeSync(() => materialize.call(codec, codec.decode(bytes))).elapsedMs;
    }

    rows.push({
      runId,
      payloadId: entry.recipeId,
      source: entry.source,
      tier: entry.tier,
      byteLength: entry.byteLength,
      format,
      wireBytes: bytes.byteLength,
      iteration: i + 1,
      deserializationMs: m.deserializationMs,
      heapDeltaBytesRaw: m.heapDeltaBytes,
      heapDeltaBytesCorrected:
        m.heapDeltaBytes === null || offsetBytes === null ? null : m.heapDeltaBytes - offsetBytes,
      deserializationWithMaterializationMs: withMaterialization,
      cellStartedAt,
    });
  }

  return rows;
}

// ─── Global pre-warm ──────────────────────────────────────────────────────────

/**
 * Bring every decoder to steady state ONCE, before anything is measured.
 *
 * Per-cell warm-up cannot do this. Whatever the per-cell count, the first cells
 * of a run execute while the engine is still cold, so their timings are biased
 * slow — which is exactly what the first run showed: the start sentinel gave
 * protobuf an sd of 2.389 ms against 0.747 ms at the midpoint, and that was read
 * as thermal drift when it was protobufjs still warming.
 *
 * Runs on one payload per tier so each decoder sees the range of document shapes
 * it will meet, and discards everything.
 */
function prewarm(
  entries: DatasetEntry[],
  buffers: Buffers,
  decodesPerFormat: number,
  onProgress: RunOptions['onProgress']
): void {
  const samples = COMPLEXITY_TIERS.map((tier) => entries.find((e) => e.tier === tier)).filter(
    (e): e is DatasetEntry => e !== undefined
  );
  if (samples.length === 0) return;

  const perSample = Math.max(1, Math.round(decodesPerFormat / samples.length));

  for (const format of SERIALIZATION_FORMATS) {
    const codec = getCodec(format);
    for (const entry of samples) {
      const bytes = buffers.get(key(entry.recipeId, format));
      if (bytes === undefined) continue;
      for (let i = 0; i < perSample; i++) {
        sink = measureDecode(() => codec.decode(bytes)).result;
      }
    }
    onProgress?.({
      phase: 'prewarming',
      done: SERIALIZATION_FORMATS.indexOf(format) + 1,
      total: SERIALIZATION_FORMATS.length,
      label: `${format} x ${perSample * samples.length}`,
      etaMs: null,
    });
  }
}

// ─── Environment stamp ───────────────────────────────────────────

/**
 * Stamp every profile with where it was measured.
 *
 * A warm-up requirement measured under Expo Go, where Hermes compiles bytecode
 * lazily, is not the same quantity as one measured in an APK, where it ships
 * precompiled. Recording the environment in the file means the provenance cannot
 * be lost or misremembered between the deriving session and the verifying one.
 */
function stampEnvironment(): ProfileEnvironment {
  const env = captureEnvironment(null);
  return {
    buildType: env.buildType,
    executionEnvironment: env.executionEnvironment,
    standalone: env.standalone,
    hermesVersion: env.runtime.hermesVersion,
    reactNativeVersion: env.runtime.reactNativeVersion,
    device:
      env.device.brand === null && env.device.model === null
        ? null
        : `${env.device.brand ?? '?'} ${env.device.model ?? '?'}`,
  };
}

/** Short label used when comparing where one figure came from against another. */
export function describeProfileEnvironment(env: ProfileEnvironment): string {
  return (
    `${env.buildType}/${env.executionEnvironment}` +
    `${env.standalone ? ' (bytecode precompiled)' : ' (bytecode compiled lazily)'}`
  );
}

// ─── Warm-up profile ──────────────────────────────────────────────────────────

/** Mean within this fraction of the final window counts as settled. */
const WARMUP_MEAN_BAND = 0.05;
/** sd within this multiple of the final window's sd counts as settled. */
const WARMUP_SD_BAND = 1.5;

/**
 * Multiple applied to the measured cold requirement to get prewarmDecodes.
 *
 * Pre-warm is paid ONCE per run, so 2x costs a few seconds on a run of several
 * minutes while buying protection against a launch that warms more slowly than
 * the profiled one. Cheap insurance against the exact failure that produced the
 * spurious "-10.3% thermal drift" in the first run.
 */
const PREWARM_HEADROOM = 2;
/** Pre-warm is reported in round numbers; nothing turns on the last few decodes. */
const PREWARM_ROUNDING = 50;

/**
 * Residual-bias limit for choosing warmupIterations.
 *
 * A candidate warm-up is acceptable when the mean of the iterations it would
 * leave MEASURED sits within this fraction of steady state. 0.5% is roughly 5x
 * below the smallest real between-format difference in the pilot data (2.7%,
 * msgpack against protobuf at the low tier), so a bias inside it cannot change
 * any ranking, while a looser limit could.
 */
const PER_CELL_BIAS_TOLERANCE = 0.005;
/** Candidate warm-up counts tested. Small values, deliberately. */
const PER_CELL_CANDIDATES = [0, 1, 2, 3, 4, 5, 8, 10, 15];

/**
 * Minimum per-cell warm-up, applied on top of whatever is measured.
 *
 * A CHOSEN MARGIN, NOT A MEASUREMENT. The per-cell profile reports average
 * behaviour across 24 payloads per format; one payload with an unusual shape
 * could carry a larger transient than that average. Two discarded decodes cost
 * 1,500 decodes across the whole run — about 1.5 seconds — and remove that tail
 * risk. Recorded separately from the measured figure so a reader can see exactly
 * which part of the number is evidence and which part is judgement.
 */
const PER_CELL_FLOOR = 2;

function profileFormat(
  format: SerializationFormat,
  bytes: ArrayBuffer,
  iterations: number,
  windowSize: number,
  positionInOrder: number
): WarmupProfile {
  const codec = getCodec(format);

  // No warm-up at all: the point is to see the cold start.
  const ms: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const m = measureDecode(() => codec.decode(bytes));
    sink = m.result;
    ms.push(m.deserializationMs);
  }

  const windows: WarmupWindow[] = [];
  for (let start = 0; start + windowSize <= ms.length; start += windowSize) {
    const slice = ms.slice(start, start + windowSize);
    const stats = describeSeries(slice)!;
    windows.push({
      fromIteration: start + 1,
      meanMs: stats.mean,
      sdMs: stats.sd,
      cv: stats.mean === 0 ? 0 : stats.sd / stats.mean,
      percentVsFinal: 0,
    });
  }
  if (windows.length === 0) return { format, windows, recommendedWarmup: null, positionInOrder };

  const final = windows[windows.length - 1];
  for (const w of windows) {
    w.percentVsFinal = final.meanMs === 0 ? 0 : ((w.meanMs - final.meanMs) / final.meanMs) * 100;
  }

  // The first window from which EVERY later window is inside both bands.
  let recommended: number | null = null;
  for (let i = 0; i < windows.length; i++) {
    const settled = windows
      .slice(i)
      .every(
        (w) =>
          Math.abs(w.percentVsFinal) <= WARMUP_MEAN_BAND * 100 &&
          w.sdMs <= Math.max(final.sdMs * WARMUP_SD_BAND, final.sdMs + 0.05)
      );
    if (settled) {
      recommended = windows[i].fromIteration - 1;
      break;
    }
  }

  return { format, windows, recommendedWarmup: recommended, positionInOrder };
}

/**
 * The order formats are profiled in, with `lead` first.
 *
 * Only the leading format meets a genuinely cold engine. The others inherit
 * engine-wide warm-up — property-cache population, bytecode paging, allocator
 * growth — that the leader already paid for, so their measured requirement comes
 * out SMALLER than the truth. The bias runs one way only, which is why the
 * profile is run once per leading format rather than once in declared order.
 */
export function profilingOrder(lead: SerializationFormat): SerializationFormat[] {
  return [lead, ...SERIALIZATION_FORMATS.filter((f) => f !== lead)];
}

/**
 * Measure, from cold, how many decodes each format needs before its timings
 * settle. Run this as the FIRST thing after launching the app: anything done
 * beforehand warms the engine and flatters the result.
 *
 * The report is persisted under its leading format, so the orderings accumulate
 * across separate cold launches instead of being lost to the force-stop.
 */
export async function runWarmupProfile(
  iterations = 150,
  windowSize = 10,
  onProgress?: (p: Progress) => void,
  leadFormat: SerializationFormat = SERIALIZATION_FORMATS[0]
): Promise<WarmupProfileReport> {
  const order = profilingOrder(leadFormat);

  onProgress?.({ phase: 'dataset', done: 0, total: 1, label: 'loading dataset', etaMs: null });
  const response = await fetch(`${resolveBaseUrl()}${ROUTES.dataset()}`);
  if (!response.ok) throw new Error(`Dataset request failed: HTTP ${response.status}`);
  const dataset = (await response.json()) as DatasetResponse;

  // The heaviest tier, because it has the most work per decode and showed the
  // inflated sd in the first run.
  const high = dataset.entries
    .filter((e) => e.tier === 'high')
    .sort((a, b) => a.byteLength - b.byteLength);
  const entry = high[Math.floor(high.length / 2)] ?? dataset.entries[0];

  // Fetch in the SAME order the formats are profiled in, so no format's decode
  // path is touched before its turn.
  const buffers: Buffers = new Map();
  for (const format of order) {
    const r = await fetch(`${resolveBaseUrl()}${ROUTES.recipe(entry.recipeId, format)}`);
    if (!r.ok) throw new Error(`Payload ${entry.recipeId} ${format}: HTTP ${r.status}`);
    buffers.set(key(entry.recipeId, format), await r.arrayBuffer());
  }

  const profiles: WarmupProfile[] = [];
  for (const format of order) {
    onProgress?.({
      phase: 'prewarming',
      done: profiles.length,
      total: order.length,
      label: `profiling ${format} (position ${profiles.length + 1} of ${order.length})`,
      etaMs: null,
    });
    profiles.push(
      profileFormat(
        format,
        buffers.get(key(entry.recipeId, format))!,
        iterations,
        windowSize,
        profiles.length + 1
      )
    );
    await yieldToUi();
  }

  const recommendations = profiles
    .map((p) => p.recommendedWarmup)
    .filter((v): v is number => v !== null);
  const recommendedWarmup = recommendations.length > 0 ? Math.max(...recommendations) : null;

  const report: WarmupProfileReport = {
    leadFormat,
    environment: stampEnvironment(),
    order,
    startedAt: new Date().toISOString(),
    payloadId: entry.recipeId,
    tier: entry.tier,
    iterations,
    windowSize,
    profiles,
    recommendedWarmup,
    currentWarmup: BENCHMARK_CONFIG.warmupIterations,
    note:
      `Profiled in the order ${order.join(' -> ')}. Only ${leadFormat} met a cold engine; the ` +
      'other two inherit warm-up it paid for, so their figures in THIS report are lower bounds. ' +
      'Run the profile once per leading format, each from a freshly launched app, and take the ' +
      'maximum across every format in every ordering. Bands: window mean within ' +
      `${WARMUP_MEAN_BAND * 100}% of the final window, sd within ${WARMUP_SD_BAND}x the final sd.`,
  };

  await saveWarmupProfile(report);
  onProgress?.({ phase: 'done', done: 1, total: 1, label: 'profiled', etaMs: 0 });
  return report;
}

/**
 * Combine every ordering into the single number that goes into BENCHMARK_CONFIG.
 *
 * The rule is the maximum over every format in every ordering. A mean would let
 * an ordering that understated a format's requirement pull the value down, and
 * under-warming is precisely the failure that produced the spurious "-10.3%
 * thermal drift" in the first run. Over-warming costs seconds; under-warming
 * costs the finding.
 */
export function combineWarmupProfiles(
  reports: WarmupProfileReport[],
  currentWarmup: number = BENCHMARK_CONFIG.warmupIterations,
  currentPrewarm: number = BENCHMARK_CONFIG.prewarmDecodes
): WarmupProfileSeries {
  const perFormat: WarmupFormatSummary[] = SERIALIZATION_FORMATS.map((format) => {
    const observations = reports.flatMap((report) => {
      const profile = report.profiles.find((p) => p.format === format);
      if (profile === undefined) return [];
      const first = profile.windows[0];
      return [
        {
          leadFormat: report.leadFormat,
          positionInOrder: profile.positionInOrder,
          recommendedWarmup: profile.recommendedWarmup,
          firstWindowMeanMs: first?.meanMs ?? null,
          firstWindowSdMs: first?.sdMs ?? null,
        },
      ];
    });

    const values = observations
      .map((o) => o.recommendedWarmup)
      .filter((v): v is number => v !== null);
    const cold = observations.find((o) => o.positionInOrder === 1);

    return {
      format,
      observations,
      maxRecommended: values.length > 0 ? Math.max(...values) : null,
      coldRecommended: cold?.recommendedWarmup ?? null,
    };
  });

  const seenLeads = new Set(reports.map((r) => r.leadFormat));
  const missingLeads = SERIALIZATION_FORMATS.filter((f) => !seenLeads.has(f));

  const all = perFormat.map((f) => f.maxRecommended).filter((v): v is number => v !== null);
  const coldRequirement = all.length > 0 ? Math.max(...all) : null;

  // The cold requirement sets the PRE-WARM, not the per-cell warm-up. Pre-warm is
  // paid once per run, so headroom is nearly free; per-cell warm-up is paid on
  // every one of the 750 cells, and the engine is already warm by then.
  const recommendedPrewarm =
    coldRequirement === null
      ? null
      : Math.max(
          currentPrewarm,
          Math.ceil((coldRequirement * PREWARM_HEADROOM) / PREWARM_ROUNDING) * PREWARM_ROUNDING
        );

  // A format that never settled inside the pass is a louder signal than any
  // number, so it is called out rather than passed off as null.
  const neverSettled = perFormat.filter(
    (f) => f.observations.length > 0 && f.observations.every((o) => o.recommendedWarmup === null)
  );

  const parts: string[] = [];
  parts.push(
    missingLeads.length === 0
      ? `All ${SERIALIZATION_FORMATS.length} orderings are present, so every format has one cold ` +
          'measurement and the ordering confound is removed.'
      : `INCOMPLETE — no session has led with ${missingLeads.join(' or ')}, so ` +
          `${missingLeads.join(' and ')} ${missingLeads.length === 1 ? 'has' : 'have'} not been ` +
          'measured from cold and the figure below is a lower bound.'
  );
  parts.push(
    'The value taken is the MAXIMUM across every format in every ordering, applied identically to ' +
      'all three formats, because unequal warm-up would be unequal treatment.'
  );
  parts.push(
    'This is an ENGINE warm-up figure and it sets prewarmDecodes, which is paid once per run. It is ' +
      'NOT warmupIterations: that is paid on every one of the 750 cells, after the engine is already ' +
      'warm, and only has to absorb the per-payload transient. Using this number there would ' +
      'double-count the cold start and triple the run. The per-cell figure is a separate measurement.'
  );
  if (neverSettled.length > 0) {
    parts.push(
      `${neverSettled.map((f) => f.format).join(', ')} never settled within the pass in any ` +
        'ordering — raise the iteration count before trusting any recommendation.'
    );
  }

  return {
    reports,
    perFormat,
    missingLeads,
    coldRequirement,
    recommendedPrewarm,
    prewarmHeadroom: PREWARM_HEADROOM,
    currentPrewarm,
    currentWarmup,
    note: parts.join(' '),
  };
}

/** Every persisted ordering, combined. Survives the force-stops between launches. */
export async function loadWarmupSeries(): Promise<WarmupProfileSeries> {
  return combineWarmupProfiles(await listWarmupProfiles());
}

// ─── Per-cell profile ─────────────────────────────────────────────

/**
 * Deal fresh payloads out to the formats so each gets a DISJOINT set with the
 * same tier composition.
 *
 * Disjoint matters: if two formats decoded the same payload, the first would
 * build its object shapes and the second would measure a transient that had
 * already been paid. Same tier composition matters because a 1.2 MB document
 * builds far more shapes than a 12 KB one.
 */
function dealFreshPayloads(
  pool: DatasetEntry[],
  perFormat: number
): Map<SerializationFormat, DatasetEntry[]> {
  const byTier = new Map<ComplexityTier, DatasetEntry[]>(
    COMPLEXITY_TIERS.map((tier) => [tier, pool.filter((e) => e.tier === tier)])
  );
  const cursor = new Map<ComplexityTier, number>(COMPLEXITY_TIERS.map((t) => [t, 0]));
  const out = new Map<SerializationFormat, DatasetEntry[]>(
    SERIALIZATION_FORMATS.map((f) => [f, [] as DatasetEntry[]])
  );

  for (let i = 0; i < perFormat; i++) {
    const tier = COMPLEXITY_TIERS[i % COMPLEXITY_TIERS.length];
    for (const format of SERIALIZATION_FORMATS) {
      const list = byTier.get(tier)!;
      const at = cursor.get(tier)!;
      if (at >= list.length) continue;
      out.get(format)!.push(list[at]);
      cursor.set(tier, at + 1);
    }
  }
  return out;
}

function summarisePerCell(
  format: SerializationFormat,
  entries: DatasetEntry[],
  perPayloadMs: number[][],
  iterations: number,
  tailWindow: number
): PerCellProfile {
  // Pooled steady state: the last tailWindow iterations of every payload.
  const tail: number[] = [];
  for (const series of perPayloadMs) tail.push(...series.slice(iterations - tailWindow));
  const tailMeanMs = describeSeries(tail)?.mean ?? NaN;

  const perIteration: PerCellIteration[] = [];
  for (let j = 0; j < iterations; j++) {
    const atIndex = perPayloadMs.map((series) => series[j]);
    const stats = describeSeries(atIndex)!;
    perIteration.push({
      iteration: j + 1,
      meanMs: stats.mean,
      sdMs: stats.sd,
      percentVsTail: tailMeanMs === 0 ? 0 : ((stats.mean - tailMeanMs) / tailMeanMs) * 100,
    });
  }

  // For each candidate warm-up, what would the run's MEASURED mean have been?
  //
  // The window modelled is the real one: iterations w+1 .. w+measuredIterations,
  // exactly what a cell records. Where the profile is shorter than that, the
  // remainder is filled with the steady-state mean, which is what those
  // iterations were measured to be. Averaging over "whatever is left of the
  // profile" instead would make the answer depend on the profile's own length:
  // a longer profile would dilute the same transient into a smaller bias and
  // recommend a smaller warm-up, which is an artefact of the instrument.
  const measuredIterations = BENCHMARK_CONFIG.measuredIterations;
  const bias: PerCellBias[] = [];
  for (const w of PER_CELL_CANDIDATES) {
    if (w >= iterations) continue;

    let sum = 0;
    let n = 0;
    for (const series of perPayloadMs) {
      const observed = series.slice(w, w + measuredIterations);
      sum += observed.reduce((acc, v) => acc + v, 0);
      sum += tailMeanMs * (measuredIterations - observed.length);
      n += measuredIterations;
    }
    const mean = n === 0 ? NaN : sum / n;

    bias.push({
      warmupIterations: w,
      meanMs: mean,
      percentVsTail: tailMeanMs === 0 ? 0 : ((mean - tailMeanMs) / tailMeanMs) * 100,
      // The window starts inside the tail, so the profile holds no evidence
      // about the transient at this candidate and a bias near zero is
      // arithmetic. Reported for completeness, never eligible.
      degenerate: w >= iterations - tailWindow,
    });
  }

  const qualifying = bias.filter(
    (b) => !b.degenerate && Math.abs(b.percentVsTail) <= PER_CELL_BIAS_TOLERANCE * 100
  );
  // Smallest qualifying candidate. Degenerate ones are excluded outright rather
  // than merely outranked: when nothing genuine qualifies, the honest answer is
  // no recommendation, not a warm-up justified by a window that had collapsed
  // onto the steady state it was being compared against.
  const recommendedWarmup = qualifying.length > 0 ? qualifying[0].warmupIterations : null;

  return {
    format,
    payloadIds: entries.map((e) => e.recipeId),
    perIteration,
    tailMeanMs,
    firstIterationPercentVsTail: perIteration[0]?.percentVsTail ?? NaN,
    bias,
    recommendedWarmup,
  };
}

/**
 * Measure the per-payload transient with the engine ALREADY WARM.
 *
 * This is the evidence for warmupIterations, and it is a different experiment
 * from runWarmupProfile(): the engine cost is paid up front here on purpose, so
 * what remains is only what a new buffer and new object shapes cost. It may be
 * run in the same session as a cold profile — indeed right after one — because a
 * warm engine is the premise rather than a contaminant. Payloads the cold
 * profiles touched are excluded from the fresh sets regardless.
 */
export async function runPerCellProfile(
  payloadsPerFormat = 24,
  iterations = 25,
  tailWindow = 10,
  prewarmDecodes: number = BENCHMARK_CONFIG.prewarmDecodes,
  onProgress?: (p: Progress) => void
): Promise<PerCellProfileReport> {
  if (tailWindow >= iterations) {
    throw new Error('tailWindow must be smaller than iterations, or there is no transient to see.');
  }
  const environment = stampEnvironment();

  onProgress?.({ phase: 'dataset', done: 0, total: 1, label: 'loading dataset', etaMs: null });
  const response = await fetch(`${resolveBaseUrl()}${ROUTES.dataset()}`);
  if (!response.ok) throw new Error(`Dataset request failed: HTTP ${response.status}`);
  const dataset = (await response.json()) as DatasetResponse;
  const entries = [...dataset.entries].sort((a, b) => a.recipeId - b.recipeId);

  // Anything a cold profile already decoded is no longer fresh.
  const excludedPayloadIds = [
    ...new Set((await listWarmupProfiles()).map((r) => r.payloadId)),
  ].sort((a, b) => a - b);
  const excluded = new Set(excludedPayloadIds);

  // Pre-warm samples come first and are also spent, so they are excluded too.
  const prewarmEntries = COMPLEXITY_TIERS.map((tier) =>
    entries.find((e) => e.tier === tier && !excluded.has(e.recipeId))
  ).filter((e): e is DatasetEntry => e !== undefined);
  for (const e of prewarmEntries) excluded.add(e.recipeId);

  const pool = entries.filter((e) => !excluded.has(e.recipeId));
  const dealt = dealFreshPayloads(pool, payloadsPerFormat);

  const shortfall = SERIALIZATION_FORMATS.filter(
    (f) => (dealt.get(f)?.length ?? 0) < payloadsPerFormat
  );

  // ── Acquire: all three formats for the pre-warm payloads, but only its OWN
  // format for each fresh payload, so freshness is guaranteed by construction.
  const buffers: Buffers = new Map();
  const base = resolveBaseUrl();
  const fetchOne = async (id: number, format: SerializationFormat) => {
    const r = await fetch(`${base}${ROUTES.recipe(id, format)}`);
    if (!r.ok) throw new Error(`Payload ${id} ${format}: HTTP ${r.status}`);
    buffers.set(key(id, format), await r.arrayBuffer());
  };

  let acquired = 0;
  const totalFetches =
    prewarmEntries.length * SERIALIZATION_FORMATS.length +
    SERIALIZATION_FORMATS.reduce((sum, f) => sum + (dealt.get(f)?.length ?? 0), 0);

  for (const entry of prewarmEntries) {
    for (const format of SERIALIZATION_FORMATS) {
      await fetchOne(entry.recipeId, format);
      acquired++;
    }
  }
  for (const format of SERIALIZATION_FORMATS) {
    for (const entry of dealt.get(format) ?? []) {
      await fetchOne(entry.recipeId, format);
      acquired++;
      if (acquired % 15 === 0) {
        onProgress?.({
          phase: 'acquiring',
          done: acquired,
          total: totalFetches,
          label: `${acquired}/${totalFetches} payloads`,
          etaMs: null,
        });
        await yieldToUi();
      }
    }
  }

  // ── Pay the engine cost up front. This is the whole point. ──
  prewarm(prewarmEntries, buffers, prewarmDecodes, onProgress);
  await yieldToUi();

  const profiles: PerCellProfile[] = [];
  for (const format of SERIALIZATION_FORMATS) {
    const fresh = dealt.get(format) ?? [];
    const perPayloadMs: number[][] = [];

    for (const entry of fresh) {
      const codec = getCodec(format);
      const bytes = buffers.get(key(entry.recipeId, format));
      if (bytes === undefined) continue;

      // Zero warm-up: iteration 1 IS the first sight of this buffer.
      const series: number[] = [];
      for (let i = 0; i < iterations; i++) {
        const m = measureDecode(() => codec.decode(bytes));
        sink = m.result;
        series.push(m.deserializationMs);
      }
      perPayloadMs.push(series);

      onProgress?.({
        phase: 'prewarming',
        done: perPayloadMs.length,
        total: fresh.length,
        label: `${format} payload ${entry.recipeId}`,
        etaMs: null,
      });
      await yieldToUi();
    }

    if (perPayloadMs.length > 0) {
      profiles.push(
        summarisePerCell(
          format,
          fresh.slice(0, perPayloadMs.length),
          perPayloadMs,
          iterations,
          tailWindow
        )
      );
    }
  }

  const values = profiles.map((p) => p.recommendedWarmup).filter((v): v is number => v !== null);
  const unsettled = profiles.filter((p) => p.recommendedWarmup === null);
  const recommendedWarmup = unsettled.length > 0 ? null : values.length > 0 ? Math.max(...values) : null;
  const recommendedWithFloor =
    recommendedWarmup === null ? null : Math.max(recommendedWarmup, PER_CELL_FLOOR);

  const parts: string[] = [
    `Per-payload transient measured with the engine already warm (${prewarmDecodes} pre-warm decodes ` +
      `per format). Each format used its OWN ${payloadsPerFormat} fresh payloads, disjoint from the ` +
      'other formats and from the payloads the cold profiles touched, averaged across payloads at ' +
      'each iteration index.',
    `A candidate warm-up W qualifies when the mean of the window a cell would actually measure ` +
      `(iterations W+1 to W+${BENCHMARK_CONFIG.measuredIterations}) sits within ` +
      `${PER_CELL_BIAS_TOLERANCE * 100}% of steady state, taken as the last ${tailWindow} of ` +
      `${iterations} iterations pooled across payloads. Where the profile is shorter than that ` +
      'window the remainder is filled with the steady-state mean, so the answer does not depend on ' +
      'the profile length. Candidates whose window begins inside the tail are reported but never ' +
      'recommended, since the profile holds no evidence about them. The SMALLEST qualifying ' +
      'candidate is taken, and the largest across formats is applied to all three.',
    'This figure is warmupIterations. It is NOT the cold-start figure from the warm-up profile, ' +
      'which sets prewarmDecodes: the engine cost is paid once per run, the per-payload cost 750 ' +
      'times.',
    `A floor of ${PER_CELL_FLOOR} is then applied. That floor is a CHOSEN MARGIN, not a measured ` +
      'figure: the profile reports average behaviour across the sampled payloads, and one payload ' +
      'with an unusual shape could carry a larger transient than that average. It costs about 1,500 ' +
      'decodes across the whole run. The measured value and the floored value are reported ' +
      'separately so the evidence and the judgement are never conflated.',
    `Measured in ${describeProfileEnvironment(environment)}. Hermes compiles bytecode lazily under ` +
      'Expo Go and ships it precompiled in a standalone APK, so a figure derived under Expo Go ' +
      'should be an OVER-estimate for an APK. Over-estimating is safe; it must still be verified in ' +
      'the environment the data is collected in.',
  ];
  if (unsettled.length > 0) {
    parts.push(
      `${unsettled.map((p) => p.format).join(', ')} never came inside the tolerance at any candidate ` +
        'up to ' +
        `${Math.max(...PER_CELL_CANDIDATES)} — no recommendation is made. Investigate before ` +
        'choosing a value; a per-payload transient that large would mean the measured window itself ' +
        'is not steady state.'
    );
  }
  if (shortfall.length > 0) {
    parts.push(
      `Only ${shortfall
        .map((f) => `${f}=${dealt.get(f)?.length ?? 0}`)
        .join(', ')} fresh payloads were available against the ${payloadsPerFormat} requested, so ` +
        'the tier composition may be uneven. Clear the cold profiles or lower payloadsPerFormat.'
    );
  }

  const report: PerCellProfileReport = {
    startedAt: new Date().toISOString(),
    environment,
    prewarmDecodes,
    iterations,
    tailWindow,
    payloadsPerFormat,
    excludedPayloadIds,
    profiles,
    biasTolerance: PER_CELL_BIAS_TOLERANCE,
    recommendedWarmup,
    chosenFloor: PER_CELL_FLOOR,
    recommendedWithFloor,
    currentWarmup: BENCHMARK_CONFIG.warmupIterations,
    note: parts.join(' '),
  };

  await savePerCellProfile(report);
  onProgress?.({ phase: 'done', done: 1, total: 1, label: 'profiled', etaMs: 0 });
  return report;
}

// ─── Sufficiency of the configured warm-up ──────────────────────────────

/**
 * Are the CONFIGURED numbers still enough where this is being asked?
 *
 * Both live in the JavaScript bundle, so they cannot be changed after an APK is
 * built without building again. The order of operations is therefore: derive them
 * under Expo Go, configure them, build, then re-run both profiles on the APK
 * purely to confirm they still hold. This turns that confirmation into a verdict
 * rather than something read off two tables by eye, and the verdict is written
 * into the run manifest.
 *
 * A missing profile yields 'unverified', never 'sufficient'. Absence of evidence
 * is not confirmation.
 */
export function assessSufficiency(
  series: WarmupProfileSeries | null,
  perCell: PerCellProfileReport | null,
  configuredPrewarm: number = BENCHMARK_CONFIG.prewarmDecodes,
  configuredWarmup: number = BENCHMARK_CONFIG.warmupIterations
): WarmupSufficiency {
  const current = stampEnvironment();
  const currentEnvironment = describeProfileEnvironment(current);

  const coldReports = series?.reports ?? [];
  const coldProfileEnvironments = [
    ...new Set(coldReports.map((r) => describeProfileEnvironment(r.environment))),
  ];
  const perCellProfileEnvironment =
    perCell === null ? null : describeProfileEnvironment(perCell.environment);

  const measuredColdRequirement = series?.coldRequirement ?? null;
  const measuredPerCellRequirement = perCell?.recommendedWarmup ?? null;

  const prewarmSufficient =
    measuredColdRequirement === null ? null : configuredPrewarm >= measuredColdRequirement;
  const warmupSufficient =
    measuredPerCellRequirement === null ? null : configuredWarmup >= measuredPerCellRequirement;

  const crossEnvironment = [...coldProfileEnvironments, perCellProfileEnvironment].some(
    (label) => label !== null && label !== currentEnvironment
  );

  let verdict: WarmupSufficiency['verdict'];
  if (prewarmSufficient === false || warmupSufficient === false) verdict = 'insufficient';
  else if (prewarmSufficient === true && warmupSufficient === true) verdict = 'sufficient';
  else verdict = 'unverified';

  const parts: string[] = [];
  if (verdict === 'insufficient') {
    const failing: string[] = [];
    if (prewarmSufficient === false) {
      failing.push(
        `prewarmDecodes is ${configuredPrewarm} but the cold requirement measured here is ` +
          `${measuredColdRequirement}`
      );
    }
    if (warmupSufficient === false) {
      failing.push(
        `warmupIterations is ${configuredWarmup} but the per-cell requirement measured here is ` +
          `${measuredPerCellRequirement}`
      );
    }
    parts.push(
      `INSUFFICIENT in ${currentEnvironment}: ${failing.join('; ')}. Do not collect data. Both ` +
        'numbers are compiled into the bundle, so raising either requires editing ' +
        'shared/contract.ts and rebuilding.'
    );
  } else if (verdict === 'unverified') {
    const missing: string[] = [];
    if (prewarmSufficient === null) missing.push('no cold profile');
    if (warmupSufficient === null) missing.push('no per-cell profile');
    parts.push(
      `UNVERIFIED in ${currentEnvironment}: ${missing.join(' and ')} on this device. The configured ` +
        'values may well be adequate, but nothing here demonstrates it, and an unverified ' +
        'configuration is not the same as a confirmed one.'
    );
  } else {
    parts.push(
      `Confirmed sufficient in ${currentEnvironment}: prewarmDecodes ${configuredPrewarm} covers a ` +
        `measured cold requirement of ${measuredColdRequirement}, and warmupIterations ` +
        `${configuredWarmup} covers a measured per-cell requirement of ` +
        `${measuredPerCellRequirement}.`
    );
  }

  if (crossEnvironment) {
    parts.push(
      `Profiles on this device were measured in: cold ${
        coldProfileEnvironments.length === 0 ? 'none' : coldProfileEnvironments.join(', ')
      }; per-cell ${perCellProfileEnvironment ?? 'none'}. At least one differs from the current ` +
        'environment, so clear the profiles and re-run them here if this is meant to be a ' +
        'verification of THIS environment.'
    );
  } else if (coldProfileEnvironments.length > 0 || perCellProfileEnvironment !== null) {
    parts.push(`All profiles on this device were measured in ${currentEnvironment}.`);
  }

  return {
    configuredPrewarm,
    configuredWarmup,
    measuredColdRequirement,
    measuredPerCellRequirement,
    prewarmSufficient,
    warmupSufficient,
    verdict,
    coldProfileEnvironments,
    perCellProfileEnvironment,
    currentEnvironment,
    crossEnvironment,
    note: parts.join(' '),
  };
}

/** The assessment for whatever profiles this device holds. */
export async function loadSufficiency(): Promise<WarmupSufficiency> {
  return assessSufficiency(await loadWarmupSeries(), await readPerCellProfile());
}

// ─── Determinism check ────────────────────────────────────────────────────────

/**
 * Does the heap counter still return the identical value on every repeat?
 *
 * Measured on THIS build, every time. The debug-bundle result is not inherited:
 * minification, __DEV__ stripping and precompiled bytecode all change the code
 * that runs, and determinism is a property of that code, not of the API.
 */
function checkDeterminism(
  entry: DatasetEntry,
  buffers: Buffers,
  repeats: number
): DeterminismCheck {
  const raw = SERIALIZATION_FORMATS.map((format) => {
    const bytes = buffers.get(key(entry.recipeId, format));
    if (bytes === undefined) return { format, heapValues: [] as number[], msValues: [] as number[] };

    // The same per-cell warm-up the measured phase uses. The global pre-warm has
    // already run by this point, so this check no longer sits at the coldest
    // moment of the session — which is what made the first run's JSON readings
    // straddle a quantum boundary.
    const codec = getCodec(format);
    for (let i = 0; i < BENCHMARK_CONFIG.warmupIterations; i++) {
      sink = measureDecode(() => codec.decode(bytes)).result;
    }

    const heapValues: number[] = [];
    const msValues: number[] = [];
    for (let i = 0; i < repeats; i++) {
      const m = measureDecode(() => codec.decode(bytes));
      sink = m.result;
      msValues.push(m.deserializationMs);
      if (m.heapDeltaBytes !== null) heapValues.push(m.heapDeltaBytes);
    }
    return { format, heapValues, msValues };
  });

  // Infer the quantum from every heap reading taken here, pooled.
  const quantumBytes = inferQuantum(raw.flatMap((r) => r.heapValues));

  const perFormat = raw.map((r) => ({
    format: r.format,
    heap: describeSeries(r.heapValues),
    ms: describeSeries(r.msValues),
    constancy: assessConstancy(r.heapValues, quantumBytes),
  }));

  const measured = perFormat.filter((f) => f.constancy !== null);
  const deterministic = measured.length > 0 && measured.every((f) => f.constancy!.constant);
  const exactlyIdentical = measured.length > 0 && measured.every((f) => f.constancy!.exact);

  const worst = measured.reduce<number>((max, f) => Math.max(max, f.constancy!.cv), 0);

  let note: string;
  if (!deterministic) {
    note =
      'Heap delta VARIED between repeats by more than the stated tolerance on this build ' +
      `(worst CV ${(worst * 100).toFixed(4)}% against a limit of ` +
      `${(DETERMINISM_CV_TOLERANCE * 100).toFixed(2)}%). Memory is aggregated with the observed ` +
      'spread and must not be reported as a constant.';
  } else if (exactlyIdentical) {
    note =
      'Heap delta is identical on every repeat for every format. Per-repeat variance is zero BY ' +
      'MEASUREMENT, not by assumption. All repeats are written to the CSV so this can be verified ' +
      'from the raw rows; the aggregate reports memory with n = payload count, because repeats of ' +
      'a deterministic computation are one observation, not many.';
  } else {
    note =
      'Heap delta is constant within tolerance. It is not bit-identical on every repeat: the worst ' +
      `coefficient of variation was ${(worst * 100).toFixed(4)}%, against a stated limit of ` +
      `${(DETERMINISM_CV_TOLERANCE * 100).toFixed(2)}%. ` +
      (quantumBytes === null
        ? ''
        : `The spread is a whole number of the counter's ${quantumBytes} B allocation quantum, ` +
          'which is its resolution rather than variation in the decoder. ') +
      'Per-repeat variance is therefore treated as zero, the per-payload readings in the CSV let a ' +
      'reader apply exact equality instead if they prefer, and the aggregate reports memory with ' +
      'n = payload count.';
  }

  return {
    payloadId: entry.recipeId,
    repeats,
    perFormat,
    deterministic,
    exactlyIdentical,
    cvTolerance: DETERMINISM_CV_TOLERANCE,
    quantumBytes,
    note,
  };
}

// ─── Sentinel (thermal probe) ─────────────────────────────────────────────────

function readSentinel(
  entry: DatasetEntry,
  buffers: Buffers,
  at: SentinelReading['at'],
  progressPercent: number
): SentinelReading {
  const perFormat = SERIALIZATION_FORMATS.map((format) => {
    const bytes = buffers.get(key(entry.recipeId, format));
    if (bytes === undefined) return { format, meanMs: NaN, sd: NaN };

    const codec = getCodec(format);
    for (let i = 0; i < BENCHMARK_CONFIG.warmupIterations; i++) {
      sink = measureDecode(() => codec.decode(bytes)).result;
    }
    const ms: number[] = [];
    for (let i = 0; i < BENCHMARK_CONFIG.measuredIterations; i++) {
      const m = measureDecode(() => codec.decode(bytes));
      sink = m.result;
      ms.push(m.deserializationMs);
    }
    const stats = describeSeries(ms)!;
    return { format, meanMs: stats.mean, sd: stats.sd };
  });

  return { at, progressPercent, timestamp: Date.now(), payloadId: entry.recipeId, perFormat };
}

function computeDrift(sentinels: SentinelReading[]): SentinelDrift[] {
  const find = (at: SentinelReading['at']) => sentinels.find((s) => s.at === at);
  const start = find('start');
  const middle = find('middle');
  const end = find('end');
  if (start === undefined || end === undefined) return [];

  return SERIALIZATION_FORMATS.map((format) => {
    const pick = (s: SentinelReading | undefined) =>
      s?.perFormat.find((f) => f.format === format)?.meanMs ?? NaN;
    const startMs = pick(start);
    const endMs = pick(end);
    return {
      format,
      startMeanMs: startMs,
      middleMeanMs: pick(middle),
      endMeanMs: endMs,
      driftPercent: startMs === 0 ? NaN : ((endMs - startMs) / startMs) * 100,
    };
  });
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

function percentVs(value: number | null, baseline: number | null): number | null {
  if (value === null || baseline === null || baseline === 0) return null;
  return ((value - baseline) / baseline) * 100;
}

export function aggregate(rows: DecodeRow[]): CellAggregate[] {
  const cells: CellAggregate[] = [];

  for (const tier of COMPLEXITY_TIERS) {
    const byFormat = new Map<SerializationFormat, CellAggregate>();

    for (const format of SERIALIZATION_FORMATS) {
      const cellRows = rows.filter((r) => r.tier === tier && r.format === format);
      if (cellRows.length === 0) continue;

      // ── Time: every repeat is a genuine observation. ──
      const ms = describeSeries(cellRows.map((r) => r.deserializationMs))!;

      // ── Memory: collapse each payload's repeats to ONE observation. ──
      const byPayload = new Map<number, number[]>();
      for (const r of cellRows) {
        if (r.heapDeltaBytesCorrected === null) continue;
        const list = byPayload.get(r.payloadId) ?? [];
        list.push(r.heapDeltaBytesCorrected);
        byPayload.set(r.payloadId, list);
      }

      const perPayloadHeap: number[] = [];
      let maxWithinSd = 0;
      for (const readings of byPayload.values()) {
        const stats = describeSeries(readings)!;
        perPayloadHeap.push(stats.mean);
        maxWithinSd = Math.max(maxWithinSd, stats.sd);
      }
      const heap = perPayloadHeap.length > 0 ? describeSeries(perPayloadHeap) : null;

      const wire = describeSeries(
        [...new Map(cellRows.map((r) => [r.payloadId, r.wireBytes])).values()]
      )!;

      const secondary = cellRows
        .map((r) => r.deserializationWithMaterializationMs)
        .filter((v): v is number => v !== null);
      const secondaryStats = secondary.length > 0 ? describeSeries(secondary) : null;

      const cell: CellAggregate = {
        format,
        tier,
        payloads: new Set(cellRows.map((r) => r.payloadId)).size,
        timeN: ms.n,
        meanMs: ms.mean,
        sdMs: ms.sd,
        msPercentVsJson: null,
        memoryN: perPayloadHeap.length,
        meanHeapBytesCorrected: heap?.mean ?? null,
        sdHeapBytesCorrected: heap?.sd ?? null,
        heapPercentVsJson: null,
        maxWithinPayloadHeapSd: byPayload.size > 0 ? maxWithinSd : null,
        meanWireBytes: wire.mean,
        sdWireBytes: wire.sd,
        wirePercentVsJson: null,
        meanWithMaterializationMs: secondaryStats?.mean ?? null,
        sdWithMaterializationMs: secondaryStats?.sd ?? null,
      };
      byFormat.set(format, cell);
    }

    // Percentage change against the JSON baseline of the SAME tier.
    const baseline = byFormat.get('json');
    for (const cell of byFormat.values()) {
      if (cell.format === 'json' || baseline === undefined) continue;
      cell.msPercentVsJson = percentVs(cell.meanMs, baseline.meanMs);
      cell.heapPercentVsJson = percentVs(cell.meanHeapBytesCorrected, baseline.meanHeapBytesCorrected);
      cell.wirePercentVsJson = percentVs(cell.meanWireBytes, baseline.meanWireBytes);
    }

    cells.push(...byFormat.values());
  }

  return cells;
}

// ─── The run ──────────────────────────────────────────────────────────────────

export async function runBenchmark(options: RunOptions = {}): Promise<RunOutcome> {
  const { onProgress, shouldStop } = options;

  // ── Warm-up sufficiency, before anything is measured ──
  //
  // Both counts are compiled into this bundle. If a profile run on THIS build
  // says they are too low, the only fix is to edit shared/contract.ts and build
  // again, so there is no point spending minutes collecting data first.
  const sufficiency = await loadSufficiency();
  if (sufficiency.verdict === 'insufficient' && options.overrideInsufficientWarmup !== true) {
    throw new Error(
      `Configured warm-up is insufficient on this build. ${sufficiency.note} ` +
        'Fix shared/contract.ts and rebuild, or start again with the override if you have decided ' +
        'to proceed anyway.'
    );
  }

  // ── Dataset ──
  onProgress?.({ phase: 'dataset', done: 0, total: 1, label: 'loading dataset', etaMs: null });
  const response = await fetch(`${resolveBaseUrl()}${ROUTES.dataset()}`);
  if (!response.ok) {
    throw new Error(
      `Dataset request failed: HTTP ${response.status} at ${resolveBaseUrl()}. Is the proxy running?`
    );
  }
  const dataset = (await response.json()) as DatasetResponse;
  const entries = [...dataset.entries].sort((a, b) => a.recipeId - b.recipeId);

  const environment = captureEnvironment({
    total: dataset.total,
    thresholds: dataset.thresholds,
    bySource: dataset.bySource ?? null,
  });

  // ── Resume or start ──
  const prior = options.resumeRunId ? await readCheckpoint(options.resumeRunId) : null;
  const runId = prior?.runId ?? newRunId();
  await ensureRunDir(runId);

  const state: RunCheckpoint = prior ?? {
    runId,
    startedAt: new Date().toISOString(),
    environment,
    config: { ...BENCHMARK_CONFIG },
    calibration: null,
    determinism: null,
    completedPayloadIds: [],
    chunkFiles: [],
    sentinels: [],
    acquisitionFailures: [],
    rowCount: 0,
    finishedAt: null,
  };

  // ── Acquisition: all buffers, before any measurement ──
  const { buffers, failures } = await acquire(entries, onProgress);
  state.acquisitionFailures = failures;

  const measurable = entries.filter((e) =>
    SERIALIZATION_FORMATS.every((f) => buffers.has(key(e.recipeId, f)))
  );

  // ── Global pre-warm, before ANY measurement ──
  prewarm(measurable, buffers, BENCHMARK_CONFIG.prewarmDecodes, onProgress);

  // ── Calibration ──
  onProgress?.({ phase: 'calibrating', done: 0, total: 1, label: 'bracket overhead', etaMs: null });
  const before = calibrateBracket(CALIBRATION_REPEATS);
  const offsetBefore = before.stats;

  // ── Determinism, on this build ──
  const probe = measurable.find((e) => e.tier === 'medium') ?? measurable[0];
  onProgress?.({ phase: 'determinism', done: 0, total: 1, label: `payload ${probe?.recipeId}`, etaMs: null });
  const determinism =
    probe === undefined
      ? null
      : checkDeterminism(probe, buffers, BENCHMARK_CONFIG.measuredIterations);
  state.determinism = determinism;

  const offsetBytes = offsetBefore?.mean ?? null;
  const sentinelEntry = probe;

  // ── Measurement ──
  const done = new Set(state.completedPayloadIds);
  const pending = measurable.filter((e) => !done.has(e.recipeId));
  const totalPayloads = measurable.length;

  let pendingRows: DecodeRow[] = [];
  let chunkIndex = state.chunkFiles.length;
  let elapsedMs = 0;
  let measuredPayloads = 0;
  let stoppedEarly = false;

  const sentinelPoints = new Set([0, Math.floor(pending.length / 2)]);

  for (let i = 0; i < pending.length; i++) {
    if (shouldStop?.() === true) {
      stoppedEarly = true;
      break;
    }

    // Thermal probe at the start and the midpoint; the end one runs after.
    if (sentinelEntry !== undefined && sentinelPoints.has(i)) {
      state.sentinels.push(
        readSentinel(
          sentinelEntry,
          buffers,
          i === 0 ? 'start' : 'middle',
          (state.completedPayloadIds.length / totalPayloads) * 100
        )
      );
    }

    const entry = pending[i];
    const cellStart = Date.now();

    for (const format of SERIALIZATION_FORMATS) {
      const bytes = buffers.get(key(entry.recipeId, format))!;
      pendingRows.push(...measureCell(entry, format, bytes, runId, offsetBytes));
    }

    elapsedMs += Date.now() - cellStart;
    measuredPayloads++;
    state.completedPayloadIds.push(entry.recipeId);
    state.rowCount += SERIALIZATION_FORMATS.length * BENCHMARK_CONFIG.measuredIterations;

    // Flush a chunk and checkpoint. A kill after this point costs nothing.
    if (measuredPayloads % CHUNK_PAYLOADS === 0 || i === pending.length - 1) {
      chunkIndex++;
      state.chunkFiles.push(await writeChunk(runId, chunkIndex, pendingRows));
      pendingRows = [];
      await writeCheckpoint(state);
    }

    const remaining = pending.length - (i + 1);
    onProgress?.({
      phase: 'measuring',
      done: state.completedPayloadIds.length,
      total: totalPayloads,
      label: `${entry.tier} ${entry.recipeId}`,
      etaMs: measuredPayloads > 3 ? (elapsedMs / measuredPayloads) * remaining : null,
    });
    await yieldToUi();
  }

  if (pendingRows.length > 0) {
    chunkIndex++;
    state.chunkFiles.push(await writeChunk(runId, chunkIndex, pendingRows));
    pendingRows = [];
  }

  // ── Closing readings ──
  const after = calibrateBracket(CALIBRATION_REPEATS);
  const calibration = resolveOffset(offsetBefore, after.stats, CALIBRATION_REPEATS, [
    ...before.samples,
    ...after.samples,
  ]);
  state.calibration = calibration;

  if (!stoppedEarly && sentinelEntry !== undefined) {
    state.sentinels.push(readSentinel(sentinelEntry, buffers, 'end', 100));
  }

  const complete = !stoppedEarly && state.completedPayloadIds.length === totalPayloads;
  state.finishedAt = complete ? new Date().toISOString() : null;
  await writeCheckpoint(state);

  // ── Aggregate ──
  let summary: RunAggregate | null = null;
  if (complete && determinism !== null) {
    onProgress?.({ phase: 'writing', done: 1, total: 1, label: 'aggregating', etaMs: null });
    const rows = await readAllRows(state);
    const cells = aggregate(rows);

    summary = {
      runId,
      startedAt: state.startedAt,
      finishedAt: state.finishedAt!,
      environment,
      config: { ...BENCHMARK_CONFIG },
      calibration,
      determinism,
      warmupSufficiency: sufficiency,
      cells,
      sentinels: state.sentinels,
      drift: computeDrift(state.sentinels),
      acquisitionFailures: failures,
      rowCount: rows.length,
      notes: buildNotes(
        determinism,
        calibration.offsetBytes,
        environment,
        failures.length,
        sufficiency,
        options.overrideInsufficientWarmup === true
      ),
    };
    await writeAggregate(summary);
  }

  onProgress?.({ phase: 'done', done: totalPayloads, total: totalPayloads, label: 'done', etaMs: 0 });
  return { checkpoint: state, aggregate: summary, stoppedEarly };
}

function buildNotes(
  determinism: DeterminismCheck,
  offsetBytes: number | null,
  environment: RunEnvironment,
  failureCount: number,
  sufficiency: WarmupSufficiency,
  overrode: boolean
): string[] {
  const notes = [
    determinism.note,
    offsetBytes === null
      ? 'No bracket offset was measurable, so corrected heap values are absent.'
      : `Every heap reading has had the calibrated bracket offset of ${offsetBytes} B subtracted. ` +
        'The offset is identical for all three formats and therefore cancels out of every ' +
        'between-format comparison; it matters only for absolute allocation figures.',
    'Acquisition is complete before measurement begins: the measurement phase makes no network ' +
      'calls, so no decode timing contains transport variance.',
    'Time is aggregated over payloads x repeats. Memory is aggregated over PAYLOADS only.',
    `ENGINE warm-up: every decoder was pre-warmed with ${BENCHMARK_CONFIG.prewarmDecodes} discarded ` +
      'decodes before anything was measured. This is paid once per run and is sized from the ' +
      'cold-start profile, which measures each format from a freshly launched app with that format ' +
      'profiled first, so no format inherits warm-up another paid for.',
    `PER-CELL warm-up: each of the 750 cells discards a further ` +
      `${BENCHMARK_CONFIG.warmupIterations} decodes. This is a SEPARATE quantity, sized from the ` +
      'per-cell profile, which measures the transient of a previously unseen payload with the engine ' +
      'already warm. The cold-start figure deliberately does NOT appear here: reusing it would ' +
      'double-count engine warm-up that the pre-warm has already paid, at 750 times the cost.',
    'Both counts are identical for all three formats. Unequal warm-up would be unequal treatment.',
    // Provenance: which environment each number came from, and where it was
    // confirmed. Both numbers are compiled into the bundle, so they are derived
    // in the convenient environment and verified in the measured one.
    `WARM-UP PROVENANCE: ${sufficiency.note}`,
    'Both counts were derived from profiles run under Expo Go, where Hermes compiles bytecode ' +
      'lazily, and are verified in the environment of this run. A standalone APK ships bytecode ' +
      'precompiled and should therefore need no MORE warm-up than Expo Go measured, so a figure ' +
      'carried from Expo Go to an APK errs towards over-warming. That direction is safe: it costs ' +
      'time, not validity. The verdict above is the check that it did in fact hold here rather than ' +
      'an assumption that it would.',
  ];

  if (overrode) {
    notes.push(
      'WARM-UP OVERRIDE: the configured warm-up was measured INSUFFICIENT on this build and the run ' +
        'was started anyway. Early cells may be biased slow. This run should not be reported ' +
        'without stating that.'
    );
  }
  if (sufficiency.verdict === 'unverified') {
    notes.push(
      'Warm-up was not verified on this build: at least one profile was missing. The configured ' +
        'values may be adequate; this run does not demonstrate it.'
    );
  }
  if (environment.buildType === 'debug') {
    notes.push(
      'DEBUG BUILD — these timings are not publishable. __DEV__ is true, the bundle is not ' +
        'minified, and development-only checks are active.'
    );
  }
  if (!environment.standalone) {
    notes.push(
      `Not a standalone binary (executionEnvironment=${environment.executionEnvironment}). Hermes ` +
        'compiles the bundle to bytecode lazily at runtime here, whereas a release APK ships it ' +
        'precompiled. Decode timings inherit that difference.'
    );
  }
  if (failureCount > 0) {
    notes.push(`${failureCount} payload/format pairs failed acquisition and were excluded.`);
  }
  return notes;
}

/**
 * Read every chunk back so the aggregate is computed from what was actually
 * WRITTEN, not from what is still in memory. If serialisation lost or mangled
 * anything, the summary inherits that rather than hiding it.
 */
export async function readAllRows(state: RunCheckpoint): Promise<DecodeRow[]> {
  const rows: DecodeRow[] = [];
  for (const name of state.chunkFiles) {
    const text = await readChunk(state.runId, name);
    for (const line of text.split('\n')) {
      if (line.trim().length === 0) continue;
      const f = line.split(',');
      rows.push({
        runId: f[0],
        payloadId: Number(f[1]),
        source: f[2] as DecodeRow['source'],
        tier: f[3] as ComplexityTier,
        byteLength: Number(f[4]),
        format: f[5] as SerializationFormat,
        wireBytes: Number(f[6]),
        iteration: Number(f[7]),
        deserializationMs: Number(f[8]),
        heapDeltaBytesRaw: f[9] === '' ? null : Number(f[9]),
        heapDeltaBytesCorrected: f[10] === '' ? null : Number(f[10]),
        deserializationWithMaterializationMs: f[11] === '' ? null : Number(f[11]),
        cellStartedAt: Number(f[12]),
      });
    }
  }
  return rows;
}
