/**
 * src/bench/types.ts
 *
 * The shapes the benchmark writes to disk. Kept separate from the runner so a
 * reader can see the output contract without reading the execution logic.
 */

import type { ComplexityTier, RecipeSource, SerializationFormat } from '../../shared/contract';
import type { BracketOffset, Constancy, Stats } from './calibration';
import type { RunEnvironment } from './environment';

/** One measured decode. 22,500 of these per complete run. */
export interface DecodeRow {
  runId: string;
  payloadId: number;
  source: RecipeSource;
  tier: ComplexityTier;
  /** Canonical JSON bytes — the tiering axis, identical across formats. */
  byteLength: number;
  format: SerializationFormat;
  /** Bytes actually received in THIS format. */
  wireBytes: number;
  /** 1-based, warm-ups excluded. */
  iteration: number;
  /** PRIMARY. Decode call only, fractional ms. */
  deserializationMs: number;
  /** As Hermes reported it. */
  heapDeltaBytesRaw: number | null;
  /** Raw minus the calibrated bracket offset. */
  heapDeltaBytesCorrected: number | null;
  /**
   * SECONDARY, protobuf only, null elsewhere. An independent decode followed by
   * toObject({defaults:true}) in one bracket. Never substituted for the primary.
   */
  deserializationWithMaterializationMs: number | null;
  /** Wall clock at the start of this (payload × format) cell — thermal trace. */
  cellStartedAt: number;
}

/** Was the heap counter deterministic on THIS build? Never inherited. */
export interface DeterminismCheck {
  payloadId: number;
  repeats: number;
  perFormat: {
    format: SerializationFormat;
    heap: Stats | null;
    ms: Stats | null;
    /** Exactness, CV, range in bytes and in quanta — the evidence for the verdict. */
    constancy: Constancy | null;
  }[];
  /**
   * True when every format's heap readings are constant WITHIN TOLERANCE.
   *
   * The first run judged this by exact equality and reported false on a JSON sd
   * of 14.39 B against a mean of 1,264,447 B — one 32-byte quantum, a CV of
   * 0.0011%. That was a statement about the counter's granularity, not about the
   * decoder, and it contradicted maxWithinPayloadHeapSd being 0 in all nine
   * cells across all 250 payloads.
   */
  deterministic: boolean;
  /** True only when every format's sd was exactly 0 — the stricter standard. */
  exactlyIdentical: boolean;
  /** The relative tolerance applied, for the record. */
  cvTolerance: number;
  /** The allocation quantum inferred from these readings. */
  quantumBytes: number | null;
  note: string;
}

/**
 * Where a profile was measured.
 *
 * The warm-up requirement is a property of an ENGINE, not of a decoder, so a
 * figure derived under Expo Go does not automatically hold in a release APK:
 * Expo Go compiles Hermes bytecode lazily at runtime while the APK ships it
 * precompiled, so the APK should need LESS warm-up. Over-estimating is safe and
 * under-estimating is not, which is why a figure derived in the slower
 * environment is verified in the faster one rather than the other way round.
 *
 * A subset of RunEnvironment: enough to identify the environment, small enough
 * to sit in every profile without bloating it.
 */
export interface ProfileEnvironment {
  buildType: 'debug' | 'release';
  executionEnvironment: string;
  /** True in a standalone binary, where Hermes bytecode is precompiled. */
  standalone: boolean;
  hermesVersion: string | null;
  reactNativeVersion: string | null;
  device: string | null;
}

/**
 * How long each decoder takes to reach steady state, measured from cold.
 *
 * NOT an increasing-warm-up sweep. A sweep that tries warm-up counts in
 * ascending order inside one session is confounded: by the time it tests 20, the
 * engine has already executed everything the earlier points ran, so only the
 * very first point is genuinely cold. This instead takes ONE cold pass of many
 * consecutive decodes per format and reports the profile in windows, which
 * answers the same question without the confound.
 */
export interface WarmupWindow {
  /** 1-based index of the first iteration in this window. */
  fromIteration: number;
  meanMs: number;
  sdMs: number;
  /** sd / mean. */
  cv: number;
  /** Mean of this window relative to the final window, as a percentage. */
  percentVsFinal: number;
}

export interface WarmupProfile {
  format: SerializationFormat;
  windows: WarmupWindow[];
  /**
   * Iterations to discard so that every later window sits within the stability
   * bands. null when the profile never settles inside the pass.
   */
  recommendedWarmup: number | null;
  /**
   * 1-based position in this session's profiling order. Position 1 is the only
   * genuinely cold measurement in the session; later positions inherit
   * engine-wide warm-up the earlier formats paid for, which UNDERSTATES their
   * requirement. That is why the profile is run once per leading format.
   */
  positionInOrder: number;
}

export interface WarmupProfileReport {
  /** Identifies this session's ordering on disk. */
  leadFormat: SerializationFormat;
  /** Where this was measured. Never inferred later. */
  environment: ProfileEnvironment;
  /** The full order used, lead first. */
  order: SerializationFormat[];
  startedAt: string;
  payloadId: number;
  tier: ComplexityTier;
  iterations: number;
  windowSize: number;
  profiles: WarmupProfile[];
  /** The largest recommendation across formats IN THIS SESSION only. */
  recommendedWarmup: number | null;
  currentWarmup: number;
  note: string;
}

/**
 * Every ordering, combined.
 *
 * One session can only measure one format from a genuinely cold engine. Running
 * the profile once per leading format, each from a fresh launch, gives every
 * format one cold measurement; the requirement to apply is then the maximum over
 * every format in every ordering. Reports are persisted, because the app is
 * force-stopped between sessions and in-memory state does not survive.
 */
export interface WarmupFormatSummary {
  format: SerializationFormat;
  /** This format's recommendation in each session, tagged with its position. */
  observations: {
    leadFormat: SerializationFormat;
    positionInOrder: number;
    recommendedWarmup: number | null;
    /** Mean of this format's first window — the cold cost, for the record. */
    firstWindowMeanMs: number | null;
    /** sd of its first window. The figure that inflated the start sentinel. */
    firstWindowSdMs: number | null;
  }[];
  /** Largest recommendation seen for this format across every session. */
  maxRecommended: number | null;
  /** The recommendation from the session where this format led — the cold one. */
  coldRecommended: number | null;
}

export interface WarmupProfileSeries {
  reports: WarmupProfileReport[];
  perFormat: WarmupFormatSummary[];
  /** Leading formats still unmeasured. Empty means the set is complete. */
  missingLeads: SerializationFormat[];
  /**
   * The largest cold requirement seen anywhere, in decodes.
   *
   * Deliberately NOT called a recommended warm-up. It is an ENGINE figure and it
   * feeds prewarmDecodes, which is paid once per run. Using it as
   * warmupIterations would re-pay the cold start on all 750 cells, where the
   * engine is already warm; that quantity is measured separately by
   * PerCellProfileReport.
   */
  coldRequirement: number | null;
  /** coldRequirement with headroom, rounded, floored at the current value. */
  recommendedPrewarm: number | null;
  /** The multiple applied to the cold requirement before rounding. */
  prewarmHeadroom: number;
  currentPrewarm: number;
  currentWarmup: number;
  note: string;
}

/**
 * The PER-CELL transient, measured with the engine already warm.
 *
 * A different experiment from the cold profile, answering a different question.
 * The cold profile asks how long a decoder takes to reach steady state after a
 * fresh launch; this asks how many decodes of a PREVIOUSLY UNSEEN payload are
 * needed before its timings settle, once that engine-level cost has already been
 * paid. Only the second figure belongs in warmupIterations.
 *
 * Design:
 *  - the engine is pre-warmed first, so nothing here measures cold start;
 *  - each format gets a DISJOINT set of fresh payloads, so no payload's object
 *    shapes are built by one format before another decodes it;
 *  - payloads already used by the cold profiles are excluded;
 *  - readings are averaged ACROSS payloads at each iteration index, because a
 *    single payload's first reading is far too noisy to read a transient from.
 */
export interface PerCellIteration {
  /** 1-based, counted from the first decode of a freshly seen payload. */
  iteration: number;
  /** Mean across payloads at this iteration index. */
  meanMs: number;
  sdMs: number;
  /** This iteration against the steady-state tail, as a percentage. */
  percentVsTail: number;
}

export interface PerCellBias {
  /** The candidate warmupIterations value, W. */
  warmupIterations: number;
  /**
   * Mean of the window a cell would actually measure under it: iterations
   * W+1 .. W+measuredIterations, with any shortfall beyond the profile filled
   * at the steady-state mean. Modelling the real window rather than "whatever
   * is left of the profile" keeps the answer independent of profile length.
   */
  meanMs: number;
  /** That mean against the tail, as a percentage — the residual bias. */
  percentVsTail: number;
  /**
   * True when the window would begin inside the tail, so the profile holds no
   * evidence about the transient at this candidate and a bias near zero is
   * arithmetic. Such candidates are reported but NEVER recommended: when
   * nothing genuine qualifies the honest output is no recommendation.
   */
  degenerate: boolean;
}

export interface PerCellProfile {
  format: SerializationFormat;
  /** The fresh payloads used, disjoint from the other formats'. */
  payloadIds: number[];
  perIteration: PerCellIteration[];
  /** Steady state: the pooled mean of the last tailWindow iterations. */
  tailMeanMs: number;
  /** The headline figure — how expensive the first decode of a new payload is. */
  firstIterationPercentVsTail: number;
  bias: PerCellBias[];
  /** Smallest candidate whose residual bias is inside the tolerance. */
  recommendedWarmup: number | null;
}

export interface PerCellProfileReport {
  startedAt: string;
  /** Where this was measured. Never inferred later. */
  environment: ProfileEnvironment;
  /** Engine pre-warm applied before any of this was measured. */
  prewarmDecodes: number;
  iterations: number;
  tailWindow: number;
  payloadsPerFormat: number;
  /** Payloads the cold profiles already touched, kept out of the fresh sets. */
  excludedPayloadIds: number[];
  profiles: PerCellProfile[];
  /** The residual-bias limit applied, for the record. */
  biasTolerance: number;
  /** The measured maximum across formats. Evidence, with nothing added. */
  recommendedWarmup: number | null;
  /**
   * A minimum applied on top of the measurement.
   *
   * NOT a measured figure. The profile reports average behaviour across 24
   * payloads per format, and a single payload with an unusual shape could carry a
   * larger transient than the mean; a floor of 2 costs 1,500 decodes on the whole
   * run and removes that tail risk. It is recorded separately from
   * recommendedWarmup precisely so the two are never confused: one is what was
   * measured, the other is a judgement.
   */
  chosenFloor: number;
  /** max(recommendedWarmup, chosenFloor) — the value actually to configure. */
  recommendedWithFloor: number | null;
  currentWarmup: number;
  note: string;
}

/**
 * Is the CONFIGURED warm-up still enough in the environment measured here?
 *
 * Both numbers are compiled into the JavaScript bundle, so changing either after
 * an APK build means rebuilding. The sequence is therefore: derive under Expo Go,
 * configure, build, then re-measure on the APK purely to confirm the configured
 * values still hold. This type is that confirmation, and it is written into the
 * run manifest so the provenance of both numbers travels with the data.
 */
export interface WarmupSufficiency {
  configuredPrewarm: number;
  configuredWarmup: number;
  /** Largest cold requirement measured in THIS environment, across orderings. */
  measuredColdRequirement: number | null;
  /** Per-cell requirement measured in THIS environment, before any floor. */
  measuredPerCellRequirement: number | null;
  /** null when the corresponding profile has not been run here. */
  prewarmSufficient: boolean | null;
  warmupSufficient: boolean | null;
  /** 'unverified' when a profile is missing — never assumed to pass. */
  verdict: 'sufficient' | 'insufficient' | 'unverified';
  /** Environments the cold and per-cell profiles on disk were measured in. */
  coldProfileEnvironments: string[];
  perCellProfileEnvironment: string | null;
  /** The environment asking the question, i.e. where the run would happen. */
  currentEnvironment: string;
  /** True when a profile was measured somewhere other than here. */
  crossEnvironment: boolean;
  note: string;
}

/** The thermal probe: the same payload, same formats, three times across the run. */
export interface SentinelReading {
  at: 'start' | 'middle' | 'end';
  progressPercent: number;
  timestamp: number;
  payloadId: number;
  perFormat: { format: SerializationFormat; meanMs: number; sd: number }[];
}

export interface SentinelDrift {
  format: SerializationFormat;
  startMeanMs: number;
  middleMeanMs: number;
  endMeanMs: number;
  /** (end − start) / start, as a percentage. Positive means it got slower. */
  driftPercent: number;
}

export interface AcquisitionFailure {
  payloadId: number;
  format: SerializationFormat;
  error: string;
}

/** Per (format × tier) summary. */
export interface CellAggregate {
  format: SerializationFormat;
  tier: ComplexityTier;

  /** Payloads contributing to this cell. */
  payloads: number;

  /** Time: n = payloads × measured iterations, because repeats vary genuinely. */
  timeN: number;
  meanMs: number;
  sdMs: number;
  /** Against the JSON cell of the same tier. */
  msPercentVsJson: number | null;

  /**
   * Memory: n = PAYLOAD COUNT, not payloads × repeats.
   *
   * When the counter is deterministic, the 30 readings of one payload are one
   * observation repeated, not 30 independent observations. Reporting n=30 would
   * be a fabricated sample size. The raw rows still carry all 30 so a reviewer
   * can verify that claim instead of trusting it.
   */
  memoryN: number;
  meanHeapBytesCorrected: number | null;
  sdHeapBytesCorrected: number | null;
  heapPercentVsJson: number | null;
  /** Largest within-payload sd of heap readings. 0 proves per-repeat determinism. */
  maxWithinPayloadHeapSd: number | null;

  /** Payload size on the wire. */
  meanWireBytes: number;
  sdWireBytes: number;
  wirePercentVsJson: number | null;

  /** protobuf only. */
  meanWithMaterializationMs: number | null;
  sdWithMaterializationMs: number | null;
}

export interface RunAggregate {
  runId: string;
  startedAt: string;
  finishedAt: string;
  environment: RunEnvironment;
  config: { prewarmDecodes: number; warmupIterations: number; measuredIterations: number };
  calibration: BracketOffset;
  determinism: DeterminismCheck;
  /**
   * Whether the configured warm-up was confirmed sufficient in the environment
   * this run happened in, and where each number was originally derived. null
   * when no profile was available, which the notes state rather than hide.
   */
  warmupSufficiency: WarmupSufficiency | null;
  cells: CellAggregate[];
  sentinels: SentinelReading[];
  drift: SentinelDrift[];
  acquisitionFailures: AcquisitionFailure[];
  rowCount: number;
  /** Stated plainly in the output so nobody has to reconstruct it. */
  notes: string[];
}

/** Checkpoint written after every payload, so a killed run resumes. */
export interface RunCheckpoint {
  runId: string;
  startedAt: string;
  environment: RunEnvironment;
  config: { prewarmDecodes: number; warmupIterations: number; measuredIterations: number };
  calibration: BracketOffset | null;
  determinism: DeterminismCheck | null;
  /** Payload ids fully measured, in completion order. */
  completedPayloadIds: number[];
  /** Row-chunk files written so far, in order. */
  chunkFiles: string[];
  sentinels: SentinelReading[];
  acquisitionFailures: AcquisitionFailure[];
  rowCount: number;
  finishedAt: string | null;
}
