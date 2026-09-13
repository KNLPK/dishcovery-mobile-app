/**
 * scripts/generate-dataset.ts
 *
 * Builds the GENERATIVE stratum of the benchmark dataset with Google Gemini.
 *
 * WHY THIS EXISTS
 *   The complexity independent variable has three levels (low / medium / high),
 *   but every one of the 100 harvested Spoonacular recipes classifies as `low`
 *   (max observed 7108 bytes against an 8192-byte boundary). The API cannot
 *   populate `medium` or `high` at all. Those cells are filled with generated
 *   payloads instead.
 *
 *   The generative stratum ALSO fills `low`. That is the provenance control:
 *   `low` is the only cell where both sources coexist, so agreement between
 *   API-sourced and generated payloads there is what licenses attributing
 *   medium/high differences to complexity rather than to provenance.
 *
 * WHAT IS AND IS NOT SYNTHETIC
 *   Everything this script writes is synthetic and is labelled as such — in the
 *   manifest (`source: 'generated'`, plus an explicit disclaimer string), in the
 *   directory layout (fixtures/generated/, never fixtures/recipes-raw/), and in
 *   the ID namespace (9000001+, unreachable by any Spoonacular ID). No generated
 *   payload is ever presented as API data.
 *
 * GENERATE ONCE, THEN FREEZE
 *   This script is run once and its output is committed. The benchmark reads the
 *   committed snapshots. The model is NEVER called during a benchmark run.
 *
 * Usage:
 *   npm run generate:dataset -- --list-models            # 1 request, generates nothing
 *   npm run generate:dataset -- --dry-run                # 0 requests, prints the plan
 *   npm run generate:dataset -- --model=<id> --fresh     # full run from scratch
 *   npm run generate:dataset -- --model=<id> --resume    # continue a run across sessions
 *   npm run generate:dataset -- --model=<id> --resume --revalidate   # rebuild from raw, 0 requests
 *   npm run generate:dataset -- --model=<id> --resume --order=medium,high,low
 *   npm run generate:dataset -- --model=<id> --fresh --low=8 --medium=7 --high=6   # pilot
 *
 * BATCHES AND QUOTA
 *   The free tier is 20 requests PER DAY PER MODEL (quotaId
 *   GenerateRequestsPerDayPerProjectPerModel-FreeTier, read from the API's own
 *   429 body — the docs page no longer publishes per-model numbers). The limit
 *   is per request, not per document, and the model's 65,536-token output limit
 *   holds several documents, so each request asks for a BATCH. Every document
 *   is still validated on its own, and the near-duplicate check compares each
 *   against every accepted payload in every tier, including its batch-mates.
 *   The manifest is checkpointed after every batch; a per-day 429 ends the
 *   session immediately and --resume picks up where it stopped.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

import {
  classifyFromMeasures,
  measureComplexity,
  COMPLEXITY_THRESHOLDS,
  COMPLEXITY_TIERS,
  GENERATED_ID_BASE,
  GENERATION_TARGET_BANDS,
  NEAR_DUPLICATE_CRITERION,
  type BatchOutcome,
  type BatchRecord,
  type ComplexityTier,
  type GeneratedRecipe,
  type GenerationAttempt,
  type GenerationManifest,
  type Recipe,
  type RejectionReason,
  type ValidationRules,
} from '../shared/contract.ts';

// ─── Paths ────────────────────────────────────────────────────────────────────

const ROOT = path.join(import.meta.dirname, '..');
const ENV_PATH = path.join(ROOT, 'dishcovery-proxy', '.env');
const PROMPT_DIR = path.join(ROOT, 'prompts');
const OUT_DIR = path.join(ROOT, 'fixtures', 'generated');
const PAYLOAD_DIR = path.join(OUT_DIR, 'payloads');
/** Verbatim API response bodies, one per ATTEMPT — accepted and rejected alike. */
const RAW_DIR = path.join(OUT_DIR, 'raw');
const MANIFEST_PATH = path.join(OUT_DIR, 'manifest.json');
/** Touch this file to stop a running session cleanly before its next request. */
const STOP_FILE = path.join(OUT_DIR, 'STOP');
/** The running session writes its PID here so it can be killed precisely. */
const PID_FILE = path.join(OUT_DIR, 'RUNNING.pid');

const API_HOST = 'https://generativelanguage.googleapis.com';
const API_VERSION = 'v1beta';

// ─── Pacing (free tier: ~15 RPM) ──────────────────────────────────────────────
//
// Serial only. One request in flight at a time, never a parallel burst.
//
// The interval floor is measured between request STARTS, not completions, so a
// slow response cannot be followed by a catch-up burst. 4500 ms => 13.3 RPM,
// an 11% margin under the published 15 RPM.
//
// The sliding window is a second, independent guard: if 15 starts ever fall
// inside a trailing 60 s it blocks until the oldest ages out. With the interval
// floor in place it should never fire; if it does, that is a signal something is
// wrong with the pacing and it is logged loudly.

const MIN_INTERVAL_MS = 4500;
const WINDOW_MS = 60_000;
const WINDOW_MAX_REQUESTS = 15;

/** 429 backoff schedule, in ms. Retry-After overrides these when present. */
const BACKOFF_MS = [30_000, 60_000, 120_000];

// ─── Generation config ────────────────────────────────────────────────────────
//
// Temperature 1.0 is deliberate, not a default. At low temperature 50 items per
// tier collapse into near-identical payloads and the benchmark would measure one
// payload 50 times rather than a population. Recorded in the manifest.

const TEMPERATURE = 1.0;
const RESPONSE_MIME_TYPE = 'application/json';


// ─── Structural plan ──────────────────────────────────────────────────────────
//
// Text budgets are held CONSTANT across all three tiers. Size varies through the
// NUMBER of structural elements only, never their length — so the high tier is
// structurally complex rather than merely verbose. `meanCharsPerStep` is
// recorded per payload and reported per tier to demonstrate this.

// Text budgets are set to the density MEASURED on the 100 harvested Spoonacular
// recipes (median 115.2 chars per step, median 1180-char summary) and are held
// IDENTICAL across all three tiers. Two things follow:
//
//   1. The generated low tier is comparable to the API-sourced low tier on text
//      density as well as on structure — it is the provenance control, so it has
//      to match on more than byte count.
//   2. Any size difference between tiers is attributable to the NUMBER of
//      structural elements alone. `meanCharsPerStep` is recorded per payload and
//      reported per tier to demonstrate that it stayed flat.

const STEP_CHARS_MIN = 90;
const STEP_CHARS_MAX = 145;
/** Observed median on the harvested set: 115.2. Used by the byte model below. */
const STEP_CHARS_MEAN = 115;

/**
 * Density REJECTION bounds on the mean chars/step of a document.
 *
 * Ceiling — the control that matters: a payload may not reach its byte band
 * through longer prose. STEP_CHARS_MAX plus a small tolerance. Observed tier
 * means (103 / 95 / 89) never approach it, so it costs no quota, but it turns
 * "size came from structure" from an observation into an enforced guarantee.
 *
 * Floor — plausibility only. Set at the 10th percentile of per-recipe mean
 * chars/step across the 94 harvested Spoonacular recipes that have steps
 * (p10 = 67.4, p25 = 81.4, median = 115.6). Derived from the reference data,
 * not invented. The earlier floor of 85 was above the reference p25 and was
 * rejecting 61% of medium-tier candidates whose density sat inside the real
 * distribution; it guarded nothing the design needed guarded.
 */
const DENSITY_CEILING = STEP_CHARS_MAX + 5; // 150
const DENSITY_FLOOR = 67.4;
const DENSITY_FLOOR_BASIS =
  'p10 of per-recipe mean chars/step across the 94 harvested Spoonacular recipes with steps ' +
  '(p10 67.4, p25 81.4, median 115.6, p75 152.5)';

/**
 * percentOfDailyNeeds ceiling. Reference maximum across all nutrients in the
 * 100 harvested recipes is 461.8% (Vitamin A); B12's reference max is 143.8%.
 * 1000 leaves ~2x headroom over the reference maximum.
 */
const PCT_DAILY_NEEDS_MAX = 1000;
const PCT_DAILY_NEEDS_BASIS =
  'reference max across 100 harvested recipes is 461.8% (Vitamin A); ceiling set at ~2x that';

/**
 * Steps per instruction set. The reference data contains 5 recipes with a
 * one-step set, so the earlier minimum of 2 would have rejected real data.
 */
const MIN_STEPS_PER_SET = 1;

const RULES_RELAXED_AGAINST_REFERENCE = [
  'no-instruction-sets: 6 of 100 reference recipes have zero sets; left to the structural-count layer',
  'min-steps-per-set 2 -> 1: 5 reference recipes have a one-step set',
  'multi-set-unnamed-set: 3 of the 5 reference multi-set recipes have an unnamed set; empty names allowed',
];

const RULES_HISTORY = [
  '2026-09-12 initial rules: density floor 85 (STEP_CHARS_MIN 90 - 5), ceiling 150, pct max 1000, min 2 steps/set, sets >= 1, multi-set names required',
  '2026-09-13 after 8 requests: density floor lowered to reference p10 (67.4); ceiling kept at 150; sanity rules audited against the 100 reference recipes and relaxed where they would have rejected real data; ALL candidates revalidated from raw under this rule set',
];

const SUMMARY_CHARS_MIN = 1000;
const SUMMARY_CHARS_MAX = 1350;
/** Observed median on the harvested set: 1180. */
const SUMMARY_CHARS_MEAN = 1180;

/**
 * Byte model.
 *
 * NOT estimated — these are ordinary-least-squares coefficients fitted to the
 * 100 harvested Spoonacular recipes, regressing byteLength on nutrient,
 * ingredient, step and instruction-set counts (mean absolute residual 238 B,
 * max 1412 B). Reproduced by the same regression over
 * fixtures/benchmark-recipe-ids.json.
 *
 * Sanity check: 32 nutrients / 11 ingredients / 6 steps / 1 set — the harvested
 * medians — predicts 5325 B against an observed median of 5273 B, a 1.0% error.
 *
 * `base` absorbs the summary at its observed average length, which is why the
 * summary budget above is held at that average rather than varied.
 *
 * Used only to choose starting counts and to compute corrections. It is never
 * used as a measurement: measureComplexity is the sole authority on byte length.
 */
const BYTES = {
  base: 584.4,
  perNutrient: 104.1,
  perIngredient: 51.6,
  perStep: 108.1,
  perSet: 193.1,
};

interface TierPlan {
  nutrientCount: number;
  ingredientCount: number;
  /** Instruction-set counts, cycled across the items of this tier. */
  setCycle: number[];
}

/**
 * Per-tier structural plan.
 *
 * `low` reproduces the harvested medians exactly (32 nutrients, 11 ingredients,
 * predominantly one instruction set), because it is the provenance control.
 * The 3-in-50 two-set share mirrors the observed 5-in-100.
 *
 * `medium` and `high` scale the COUNTS up, holding text density fixed. Growth is
 * deliberately spread across ingredients and steps rather than loaded onto steps
 * alone, so each tier reads as a larger multi-component dish rather than an
 * endless single procedure.
 *
 * These counts are what justified retuning COMPLEXITY_THRESHOLDS. Under the
 * previous 20480-byte high boundary the same arithmetic demanded ~125 steps and
 * 80 ingredients; at 14000 it asks for ~82 steps across 5 sets with 45
 * ingredients — a large celebration menu, which is still a recipe document.
 *
 * Instruction sets are raised deliberately in both upper tiers: multi-set
 * recipes are the case the pre-Stage-2 schema destroyed, and the real harvest
 * contains only 5 of them, so coverage there is thin.
 */
const TIER_PLANS: Record<ComplexityTier, TierPlan> = {
  low: {
    nutrientCount: 32,
    ingredientCount: 11,
    // Cycle of 16 => items 16, 32 and 48 of 50 carry two sets: 3/50 = 6%,
    // matching the 5/100 multi-set share observed in the harvested set.
    setCycle: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
  },
  medium: {
    nutrientCount: 34,
    ingredientCount: 25,
    setCycle: [2, 3, 2, 3, 4],
  },
  high: {
    nutrientCount: 36,
    ingredientCount: 45,
    setCycle: [4, 5, 4, 5, 6],
  },
};

/** The point inside the band that the byte model aims at. */
function bandAim(tier: ComplexityTier): number {
  return GENERATION_TARGET_BANDS[tier].aimBytes;
}

/** Step count that the byte model predicts will land on the band midpoint. */
function plannedStepCount(tier: ComplexityTier, sets: number): number {
  const plan = TIER_PLANS[tier];
  const fixed =
    BYTES.base +
    plan.nutrientCount * BYTES.perNutrient +
    plan.ingredientCount * BYTES.perIngredient +
    sets * BYTES.perSet;
  const forSteps = bandAim(tier) - fixed;
  return Math.max(sets * 2, Math.round(forSteps / BYTES.perStep));
}

// ─── Subject variety ──────────────────────────────────────────────────────────
//
// 15 cuisines x 10 dish types = 150 distinct pairs, assigned so that no pair
// repeats across the whole run. This is the first line of defence against
// near-duplicates; the Jaccard check is the second.

const CUISINES = [
  'Italian', 'Japanese', 'Mexican', 'Indian', 'Thai',
  'French', 'Moroccan', 'Korean', 'Greek', 'Vietnamese',
  'Peruvian', 'Lebanese', 'Ethiopian', 'Polish', 'Brazilian',
];

const DISHES = [
  'slow braise', 'stew', 'roast', 'noodle bowl', 'flatbread',
  'dumpling', 'grain salad', 'layered bake', 'soup', 'skewer',
];

const ANGLES = [
  'a weeknight version', 'a celebration version', 'a make-ahead version',
  'a one-pot version', 'built around a fermented component',
  'built around a smoked element', 'fully vegetarian', 'seafood-forward',
  'adapted as a breakfast', 'finished as a dessert course',
];

// ─── Key handling ─────────────────────────────────────────────────────────────

/**
 * Read GEMINI_API_KEY from dishcovery-proxy/.env.
 * The value is never logged, printed, or written anywhere by this script.
 */
function readApiKey(): string {
  let raw: string;
  try {
    raw = fs.readFileSync(ENV_PATH, 'utf8');
  } catch {
    throw new Error(`Cannot read ${ENV_PATH}`);
  }
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*GEMINI_API_KEY\s*=\s*(.*)$/.exec(line);
    if (match) {
      const value = match[1].trim().replace(/^["']|["']$/g, '');
      if (!value || /^(placeholder|your[-_ ]?key)$/i.test(value)) {
        throw new Error('GEMINI_API_KEY is unset or still a placeholder in dishcovery-proxy/.env');
      }
      return value;
    }
  }
  throw new Error(
    'GEMINI_API_KEY not found in dishcovery-proxy/.env.\n' +
      '  Add a line:  GEMINI_API_KEY=<key from Google AI Studio>\n' +
      '  Free tier: do NOT enable billing on that project.'
  );
}

/** Strip the key from a URL before it is logged or recorded. */
function redactUrl(url: string): string {
  return url.replace(/([?&]key=)[^&]*/i, '$1REDACTED');
}

// ─── Pacer ────────────────────────────────────────────────────────────────────

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Pacer {
  private starts: number[] = [];
  private lastStart = 0;
  private peakRpm = 0;

  /** Blocks until it is safe to start another request. Serial by construction. */
  async acquire(): Promise<void> {
    for (;;) {
      const now = Date.now();

      const sinceLast = now - this.lastStart;
      if (this.lastStart !== 0 && sinceLast < MIN_INTERVAL_MS) {
        await delay(MIN_INTERVAL_MS - sinceLast);
        continue;
      }

      this.starts = this.starts.filter((t) => now - t < WINDOW_MS);
      if (this.starts.length >= WINDOW_MAX_REQUESTS) {
        const wait = WINDOW_MS - (now - this.starts[0]) + 100;
        console.warn(
          `[pace] SLIDING WINDOW GUARD FIRED — ${this.starts.length} starts in the last 60 s. ` +
            `Holding ${(wait / 1000).toFixed(1)} s. This should not happen with a ${MIN_INTERVAL_MS} ms floor.`
        );
        await delay(wait);
        continue;
      }

      this.lastStart = now;
      this.starts.push(now);
      if (this.starts.length > this.peakRpm) this.peakRpm = this.starts.length;
      return;
    }
  }

  /** Highest number of request starts observed inside any trailing 60 s window. */
  get observedPeakRpm(): number {
    return this.peakRpm;
  }
}

// ─── Gemini transport ─────────────────────────────────────────────────────────

interface ModelInfo {
  id: string;
  displayName: string | null;
  version: string | null;
  description: string | null;
  inputTokenLimit: number | null;
  outputTokenLimit: number | null;
  supportedMethods: string[];
}

async function listModels(apiKey: string): Promise<ModelInfo[]> {
  const url = `${API_HOST}/${API_VERSION}/models?key=${encodeURIComponent(apiKey)}&pageSize=200`;
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`models.list failed: HTTP ${res.status} — ${text.slice(0, 400)}`);
  }
  const body = JSON.parse(text) as { models?: any[] };
  return (body.models ?? []).map((m) => ({
    id: String(m.name ?? '').replace(/^models\//, ''),
    displayName: m.displayName ?? null,
    version: m.version ?? null,
    description: m.description ?? null,
    inputTokenLimit: typeof m.inputTokenLimit === 'number' ? m.inputTokenLimit : null,
    outputTokenLimit: typeof m.outputTokenLimit === 'number' ? m.outputTokenLimit : null,
    supportedMethods: Array.isArray(m.supportedGenerationMethods) ? m.supportedGenerationMethods : [],
  }));
}

interface GenerateResult {
  httpStatus: number;
  /** Verbatim response body text, exactly as returned. Always persisted. */
  rawText: string;
  /** The model's text output, or null if the call did not produce one. */
  output: string | null;
  finishReason: string | null;
  usageMetadata: Record<string, number> | null;
  error: string | null;
  /**
   * True when the 429 named a PER-DAY quota. Backing off is pointless until the
   * daily reset, so the caller ends the session instead of retrying.
   */
  dailyQuota: boolean;
}

/** Inspect a 429 body for the quota that was exceeded. */
function quotaKind(text: string): 'daily' | 'minute' | 'unknown' {
  try {
    const body = JSON.parse(text);
    const details: any[] = body?.error?.details ?? [];
    for (const d of details) {
      for (const v of d?.violations ?? []) {
        const id = String(v?.quotaId ?? '');
        if (/PerDay/i.test(id)) return 'daily';
        if (/PerMinute/i.test(id)) return 'minute';
      }
    }
    if (/per day|PerDay/i.test(String(body?.error?.message ?? ''))) return 'daily';
  } catch {
    // fall through
  }
  return 'unknown';
}

async function generateContent(
  apiKey: string,
  modelId: string,
  systemInstruction: string,
  userPrompt: string,
  responseSchema: unknown,
  maxOutputTokens: number,
  pacer: Pacer
): Promise<GenerateResult> {
  const url = `${API_HOST}/${API_VERSION}/models/${modelId}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const requestBody = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: TEMPERATURE,
      maxOutputTokens,
      responseMimeType: RESPONSE_MIME_TYPE,
      responseSchema,
    },
  };

  for (let backoff = 0; ; backoff++) {
    await pacer.acquire();

    let res: Response;
    let text: string;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      text = await res.text();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (backoff >= BACKOFF_MS.length) {
        return {
          httpStatus: 0, rawText: '', output: null, finishReason: null,
          usageMetadata: null, error: `network: ${message}`, dailyQuota: false,
        };
      }
      console.warn(`[gen] network error (${message}); backing off ${BACKOFF_MS[backoff] / 1000}s`);
      await delay(BACKOFF_MS[backoff]);
      continue;
    }

    // A per-day quota 429 cannot be waited out inside a session. Return it
    // immediately so the caller checkpoints and stops; the body is persisted.
    if (res.status === 429 && quotaKind(text) === 'daily') {
      return {
        httpStatus: 429, rawText: text, output: null, finishReason: null,
        usageMetadata: null, error: 'HTTP 429 daily quota', dailyQuota: true,
      };
    }

    // 429 (per-minute) / 503: back off and retry. Recorded and budgeted.
    if ((res.status === 429 || res.status === 503) && backoff < BACKOFF_MS.length) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : BACKOFF_MS[backoff];
      console.warn(`[gen] HTTP ${res.status} — backing off ${(wait / 1000).toFixed(0)}s (attempt ${backoff + 1})`);
      await delay(wait);
      continue;
    }

    if (!res.ok) {
      return {
        httpStatus: res.status, rawText: text, output: null, finishReason: null,
        usageMetadata: null, error: `HTTP ${res.status}`, dailyQuota: false,
      };
    }

    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      return {
        httpStatus: res.status, rawText: text, output: null, finishReason: null,
        usageMetadata: null, error: 'API envelope was not JSON', dailyQuota: false,
      };
    }

    const candidate = body?.candidates?.[0];
    const finishReason = candidate?.finishReason ?? null;
    const parts = candidate?.content?.parts ?? [];
    const output = parts.map((p: any) => p?.text ?? '').join('') || null;

    const usage = body?.usageMetadata ?? null;
    const usageMetadata: Record<string, number> | null = usage
      ? Object.fromEntries(
          Object.entries(usage).filter(([, v]) => typeof v === 'number') as [string, number][]
        )
      : null;

    return { httpStatus: res.status, rawText: text, output, finishReason, usageMetadata, error: null, dailyQuota: false };
  }
}

// ─── Near-duplicate detection ─────────────────────────────────────────────────
//
// Jaccard similarity over word-level 3-gram shingles. The criterion and its
// threshold live in shared/contract.ts (NEAR_DUPLICATE_CRITERION) so the paper
// cites the same numbers the code enforces.

function normaliseIdentityText(recipe: Recipe): string {
  const parts: string[] = [recipe.title];
  for (const ing of recipe.extendedIngredients) parts.push(ing.name);
  for (const set of recipe.analyzedInstructions) {
    for (const step of set.steps) parts.push(step.step);
  }
  return parts
    .join(' ')
    .toLowerCase()
    .replace(/<[^>]*>/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function shingles(text: string, size: number): Set<string> {
  const words = text.split(' ').filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + size <= words.length; i++) {
    out.add(words.slice(i, i + size).join(' '));
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ─── Canonical shaping ────────────────────────────────────────────────────────

/**
 * Build THE canonical shape from the model output.
 *
 * Three fields are assigned here rather than generated, and prompts/README.md
 * records why:
 *   - `id`     : reserved generated namespace, so it can never be mistaken for
 *                a Spoonacular ID.
 *   - `image`  : a `generated://` URI, deliberately not http(s), for the same
 *                reason.
 *   - ingredient `id` : likewise synthetic (90000 + index).
 */
function toCanonicalShape(raw: any, recipeId: number): Recipe {
  return {
    id: recipeId,
    title: String(raw?.title ?? ''),
    image: `generated://dishcovery/${recipeId}.jpg`,
    readyInMinutes: Number(raw?.readyInMinutes ?? 0),
    servings: Number(raw?.servings ?? 0),
    summary: String(raw?.summary ?? ''),
    nutrition: {
      nutrients: (raw?.nutrition?.nutrients ?? []).map((n: any) => ({
        name: String(n?.name ?? ''),
        amount: Number(n?.amount ?? 0),
        unit: String(n?.unit ?? ''),
        percentOfDailyNeeds: Number(n?.percentOfDailyNeeds ?? 0),
      })),
    },
    extendedIngredients: (raw?.extendedIngredients ?? []).map((i: any, index: number) => ({
      id: 90000 + index,
      amount: Number(i?.amount ?? 0),
      unit: String(i?.unit ?? ''),
      name: String(i?.name ?? ''),
    })),
    analyzedInstructions: (raw?.analyzedInstructions ?? []).map((ai: any) => ({
      name: String(ai?.name ?? ''),
      steps: (ai?.steps ?? []).map((s: any) => ({
        number: Number(s?.number ?? 0),
        step: String(s?.step ?? ''),
      })),
    })),
  };
}

// ─── Validation layers ────────────────────────────────────────────────────────

interface ItemSpec {
  tier: ComplexityTier;
  cuisine: string;
  dish: string;
  angle: string;
  nutrientCount: number;
  ingredientCount: number;
  instructionSetCount: number;
  stepCount: number;
}

interface Rejection {
  reason: RejectionReason;
  detail: string;
}

/** Layer 2: value sanity. Returns null when the payload passes. */
function checkValueSanity(recipe: Recipe): Rejection | null {
  const fail = (detail: string): Rejection => ({ reason: 'value-sanity', detail });

  if (!recipe.title.trim()) return fail('empty title');
  if (recipe.title.length > 200) return fail(`title too long (${recipe.title.length} chars)`);
  if (!recipe.summary.trim()) return fail('empty summary');
  if (!Number.isInteger(recipe.readyInMinutes) || recipe.readyInMinutes < 1 || recipe.readyInMinutes > 1440) {
    return fail(`readyInMinutes out of range: ${recipe.readyInMinutes}`);
  }
  if (!Number.isInteger(recipe.servings) || recipe.servings < 1 || recipe.servings > 24) {
    return fail(`servings out of range: ${recipe.servings}`);
  }

  for (const n of recipe.nutrition.nutrients) {
    if (!n.name.trim()) return fail('nutrient with empty name');
    if (!n.unit.trim()) return fail(`nutrient "${n.name}" has empty unit`);
    if (!Number.isFinite(n.amount) || n.amount < 0) return fail(`nutrient "${n.name}" amount ${n.amount}`);
    if (!Number.isFinite(n.percentOfDailyNeeds) || n.percentOfDailyNeeds < 0 || n.percentOfDailyNeeds > PCT_DAILY_NEEDS_MAX) {
      return fail(`nutrient "${n.name}" percentOfDailyNeeds ${n.percentOfDailyNeeds}`);
    }
  }

  for (const i of recipe.extendedIngredients) {
    if (!i.name.trim()) return fail('ingredient with empty name');
    if (!Number.isFinite(i.amount) || i.amount <= 0) return fail(`ingredient "${i.name}" amount ${i.amount}`);
  }

  // Zero instruction sets is not a sanity failure: 6 of the 100 reference
  // recipes have none. The requested set count is enforced by the
  // structural-count layer instead.
  const seenSetNames = new Set<string>();
  for (const set of recipe.analyzedInstructions) {
    if (set.steps.length < MIN_STEPS_PER_SET) return fail(`instruction set "${set.name}" has ${set.steps.length} step(s)`);
    if (recipe.analyzedInstructions.length > 1) {
      // Empty names are allowed (3 of the 5 reference multi-set recipes have
      // one); only NON-empty names must be distinct.
      const key = (set.name ?? '').trim().toLowerCase();
      if (key && seenSetNames.has(key)) return fail(`duplicate instruction set name "${set.name}"`);
      if (key) seenSetNames.add(key);
    }
    for (let s = 0; s < set.steps.length; s++) {
      if (set.steps[s].number !== s + 1) {
        return fail(`step numbering in "${set.name}": expected ${s + 1}, got ${set.steps[s].number}`);
      }
      if (!set.steps[s].step.trim()) return fail(`empty step text in "${set.name}"`);
    }
  }

  return null;
}

/** Layer 3: structural counts against what was requested. */
function checkStructuralCounts(recipe: Recipe, spec: ItemSpec): Rejection | null {
  const sets = recipe.analyzedInstructions.length;
  if (sets !== spec.instructionSetCount) {
    return {
      reason: 'structural-count',
      detail: `instruction sets: requested ${spec.instructionSetCount}, got ${sets}`,
    };
  }
  // Counts drift is tolerated within 15% — the byte band is the binding
  // constraint and honest structural variance is desirable. Instruction-set
  // count is exact because multi-set coverage is a reported design variable.
  const within = (got: number, want: number, what: string): Rejection | null => {
    const tolerance = Math.max(2, Math.round(want * 0.15));
    return Math.abs(got - want) > tolerance
      ? { reason: 'structural-count', detail: `${what}: requested ${want}, got ${got} (tolerance +/-${tolerance})` }
      : null;
  };
  return (
    within(recipe.nutrition.nutrients.length, spec.nutrientCount, 'nutrients') ??
    within(recipe.extendedIngredients.length, spec.ingredientCount, 'ingredients') ??
    within(totalSteps(recipe), spec.stepCount, 'total steps')
  );
}

function totalSteps(recipe: Recipe): number {
  return recipe.analyzedInstructions.reduce((n, a) => n + a.steps.length, 0);
}

function meanCharsPerStep(recipe: Recipe): number {
  const steps = recipe.analyzedInstructions.flatMap((a) => a.steps);
  if (steps.length === 0) return 0;
  return steps.reduce((n, s) => n + s.step.length, 0) / steps.length;
}

// ─── Prompt assembly ──────────────────────────────────────────────────────────

interface PromptArtifacts {
  systemInstruction: string;
  generationTemplate: string;
  correctiveTemplate: string;
  responseSchema: unknown;
  hashes: Record<string, { file: string; sha256: string }>;
}

function loadPromptArtifacts(): PromptArtifacts {
  const read = (name: string): string => fs.readFileSync(path.join(PROMPT_DIR, name), 'utf8');
  const sha = (text: string): string => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

  const files = {
    systemInstruction: 'system-instruction.md',
    generationTemplate: 'generation.template.md',
    correctiveTemplate: 'corrective-retry.template.md',
    responseSchema: 'response-schema.json',
  };

  const contents: Record<string, string> = {};
  const hashes: Record<string, { file: string; sha256: string }> = {};
  for (const [key, file] of Object.entries(files)) {
    const text = read(file);
    contents[key] = text;
    hashes[key] = { file: `prompts/${file}`, sha256: sha(text) };
  }

  return {
    systemInstruction: contents.systemInstruction,
    generationTemplate: contents.generationTemplate,
    correctiveTemplate: contents.correctiveTemplate,
    responseSchema: JSON.parse(contents.responseSchema),
    hashes,
  };
}

function fill(template: string, values: Record<string, string | number>): string {
  let out = template;
  for (const [key, value] of Object.entries(values)) {
    out = out.split(`{{${key}}}`).join(String(value));
  }
  const leftover = /\{\{([A-Z_]+)\}\}/.exec(out);
  if (leftover) throw new Error(`prompt template placeholder not substituted: ${leftover[0]}`);
  return out;
}

/** One markdown table row per requested document. */
function itemsTable(items: ItemSpec[]): string {
  return items
    .map(
      (it, i) =>
        `| ${i + 1} | ${it.cuisine} | ${it.dish} | ${it.angle} | ${it.nutrientCount} | ` +
        `${it.ingredientCount} | ${it.instructionSetCount} | ${it.stepCount} |`
    )
    .join('\n');
}

function buildBatchPrompt(artifacts: PromptArtifacts, items: ItemSpec[]): string {
  return fill(artifacts.generationTemplate, {
    BATCH_COUNT: items.length,
    ITEMS_TABLE: itemsTable(items),
    STEP_CHARS_MIN,
    STEP_CHARS_MAX,
    SUMMARY_CHARS_MIN,
    SUMMARY_CHARS_MAX,
  });
}

function buildCorrectiveBatchPrompt(
  artifacts: PromptArtifacts,
  tier: ComplexityTier,
  items: ItemSpec[],
  diagnosis: string
): string {
  const band = GENERATION_TARGET_BANDS[tier];
  return fill(artifacts.correctiveTemplate, {
    BATCH_COUNT: items.length,
    ITEMS_TABLE: itemsTable(items),
    DIAGNOSIS: diagnosis,
    TARGET_MIN_BYTES: band.minBytes,
    TARGET_MAX_BYTES: band.maxBytes,
    STEP_CHARS_MIN,
    STEP_CHARS_MAX,
    SUMMARY_CHARS_MIN,
    SUMMARY_CHARS_MAX,
  });
}

// ─── Batch sizing ─────────────────────────────────────────────────────────────
//
// The free tier is limited per REQUEST (20 per day per model), not per payload.
// The model's 65,536-token output limit holds several documents, so each
// request asks for a batch.
//
// Two costs share that output limit and both are calibrated from the pilot's
// persisted usageMetadata rather than guessed:
//
//   - document tokens: observed 3.5-4.0 bytes/token (5100 B -> 1314-1506 tokens;
//     10898 B -> 2786; 15954 B -> 3974). TOKENS_PER_ITEM takes the band aim at
//     3.5 B/token and adds ~10%.
//   - thinking tokens: `thoughtsTokenCount` is charged against maxOutputTokens.
//     Observed 2302-6992 per single-document call, and it was 6992 that caused
//     the pilot's MAX_TOKENS truncations. THINKING_RESERVE_TOKENS holds back
//     2.3x that worst case.
//
// A batch is admitted only if batchSize * tokensPerItem + reserve fits the
// model's limit; a truncated batch shrinks the tier's batch size by 25%.

const THINKING_RESERVE_TOKENS = 16384;

const TOKENS_PER_ITEM: Record<ComplexityTier, number> = {
  low: 1700, // aim 5300 B
  medium: 3300, // aim 10500 B
  high: 5200, // aim 16500 B
};

const INITIAL_BATCH_SIZE: Record<ComplexityTier, number> = {
  low: 8, // 13,600 tokens
  medium: 7, // 23,100 tokens
  high: 6, // 31,200 tokens
};

/** Requests a tier may spend, as a multiple of its zero-rejection minimum. */
const REQUEST_BUDGET_MULTIPLIER = 3;

/** Shrink applied to a tier's batch size after a truncated response. */
const TRUNCATION_SHRINK = 0.75;

function fitsOutputLimit(tier: ComplexityTier, batchSize: number, outputLimit: number): boolean {
  return batchSize * TOKENS_PER_ITEM[tier] + THINKING_RESERVE_TOKENS <= outputLimit;
}

// ─── Plan construction ────────────────────────────────────────────────────────

/**
 * Per-item specs for one batch.
 *
 * Within a batch every item gets a distinct cuisine (batch <= 15) and a distinct
 * dish type (batch <= 10), so the diversity instruction in the prompt has
 * concrete assignments to enforce. Across batches the sequences rotate.
 */
function buildBatchSpecs(
  tier: ComplexityTier,
  batchIndex: number,
  count: number,
  itemsRequestedSoFar: number,
  stepDelta: number,
  ingredientDelta: number
): ItemSpec[] {
  const plan = TIER_PLANS[tier];
  const tierOffset = { low: 0, medium: 5, high: 10 }[tier];
  const specs: ItemSpec[] = [];
  for (let j = 0; j < count; j++) {
    const sets = plan.setCycle[(itemsRequestedSoFar + j) % plan.setCycle.length];
    specs.push({
      tier,
      cuisine: CUISINES[(batchIndex * 8 + j + tierOffset) % CUISINES.length],
      dish: DISHES[(j + batchIndex * 3 + tierOffset) % DISHES.length],
      angle: ANGLES[(j + batchIndex * 2 + tierOffset) % ANGLES.length],
      nutrientCount: plan.nutrientCount,
      ingredientCount: Math.max(4, plan.ingredientCount + ingredientDelta),
      instructionSetCount: sets,
      stepCount: Math.max(sets * 2, plannedStepCount(tier, sets) + stepDelta),
    });
  }
  return specs;
}

// ─── Balanced selection ───────────────────────────────────────────────────────
//
// Seeded, reproducible draw of `requested` payloads from an over-full tier.
// mulberry32 is a small, well-known 32-bit PRNG; the seed and the resulting
// id list are both written to the manifest.

const SELECTION_SEED = 20260913;
const SELECTION_METHOD =
  'mulberry32(seed) -> Fisher-Yates shuffle of accepted recipeIds sorted ascending -> first `requested`';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededSample(ids: number[], n: number, seed: number): number[] {
  const arr = [...ids].sort((a, b) => a - b);
  const rand = mulberry32(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, n).sort((a, b) => a - b);
}

const QUARANTINE: { path: string; files: number; reason: string }[] = [
  {
    path: 'quarantine/generated-single-item-orphans/',
    files: 25,
    reason:
      'Verbatim responses from the original single-document run (2026-09-12), which was believed ' +
      'stopped but kept generating after the 07:00 UTC quota reset in parallel with the batch pilot. ' +
      'Different procedure (one document per request, pre-batch prompt), so excluded from the ' +
      'stratum; retained because the requests were spent and the responses are evidence. ' +
      'See quarantine/README.md.',
  },
];

// ─── Reporting helpers ────────────────────────────────────────────────────────

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

/** Sample standard deviation, n-1 denominator, per the study methodology. */
function sd(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function fmt(n: number, digits = 1): string {
  return n.toFixed(digits);
}

// ─── Candidate processing (shared by the live run and --revalidate) ───────────
//
// Validation is a pure function of (raw candidate, its spec, the accepted set
// so far, the rules). Keeping it in one place is what makes --revalidate
// equivalent to the live run: both call exactly this.

interface RunState {
  accepted: GeneratedRecipe[];
  allAttempts: GenerationAttempt[];
  acceptedShingles: { id: number; batchId: string; set: Set<string> }[];
  acceptedTitles: Set<string>;
  rejections: Record<ComplexityTier, Partial<Record<RejectionReason, number>>>;
}

function acceptedCount(state: RunState, tier: ComplexityTier): number {
  return state.accepted.filter((r) => r.tier === tier).length;
}

/**
 * Validate every candidate in one batch, in order, accepting the ones that pass.
 * Writes accepted payloads to disk. Returns the byte lengths of band misses so
 * the caller can steer the next batch.
 */
function processBatchCandidates(
  parsed: unknown[],
  specs: ItemSpec[],
  tier: ComplexityTier,
  batchId: string,
  size: number,
  requestedAt: string,
  rawFile: string | null,
  batchRecord: BatchRecord,
  state: RunState,
  log: boolean
): number[] {
  const bandMisses: number[] = [];
  const label = `[${batchId}]`;

  const noteRejection = (reason: RejectionReason) => {
    state.rejections[tier][reason] = (state.rejections[tier][reason] ?? 0) + 1;
  };

  for (let j = 0; j < Math.min(parsed.length, size); j++) {
    const spec = specs[j];
    const itemLabel = `${label} #${j + 1}`;
    let measuredBytes: number | null = null;

    const record = (
      ok: boolean,
      reason: RejectionReason | null,
      detail: string | null,
      recipeId: number | null,
      sim: number | null,
      nearestId: number | null,
      nearestSame: boolean | null
    ) => {
      state.allAttempts.push({
        batchId, indexInBatch: j, tier, recipeId, requestedAt, measuredBytes,
        accepted: ok, rejectionReason: reason, rejectionDetail: detail,
        maxSimilarity: sim, nearestRecipeId: nearestId, nearestInSameBatch: nearestSame,
      });
      if (ok) batchRecord.acceptedCount++;
      else {
        batchRecord.rejectedCount++;
        if (reason) noteRejection(reason);
        if (log) console.warn(`${itemLabel} REJECT ${reason}: ${detail}`);
      }
    };

    const candidateId = GENERATED_ID_BASE[tier] + acceptedCount(state, tier);
    const recipe = toCanonicalShape(parsed[j], candidateId);
    const measures = measureComplexity(recipe);
    measuredBytes = measures.byteLength;

    // ── Layer 1: value sanity ──
    const sanity = checkValueSanity(recipe);
    if (sanity) {
      record(false, sanity.reason, sanity.detail, null, null, null, null);
      continue;
    }

    // ── Layer 2: structural counts ──
    const structural = checkStructuralCounts(recipe, spec);
    if (structural) {
      record(false, structural.reason, structural.detail, null, null, null, null);
      continue;
    }

    // ── Layer 3: text density ──
    // Ceiling: a payload may not reach its byte band through longer prose.
    // Floor: the reference p10, guarding against degenerate steps.
    const density = meanCharsPerStep(recipe);
    if (density > DENSITY_CEILING || density < DENSITY_FLOOR) {
      record(false, 'text-density', `mean ${density.toFixed(1)} chars/step outside ${DENSITY_FLOOR}-${DENSITY_CEILING}`, null, null, null, null);
      continue;
    }

    // ── Layer 4: tier band ──
    const band = GENERATION_TARGET_BANDS[tier];
    if (measures.byteLength < band.minBytes || measures.byteLength > band.maxBytes) {
      record(false, 'tier-band-miss', `${measures.byteLength} B outside ${band.minBytes}-${band.maxBytes} B`, null, null, null, null);
      bandMisses.push(measures.byteLength);
      continue;
    }

    // ── Layer 5: near-duplicate — against EVERY accepted payload in EVERY
    // tier, including those accepted earlier in this same batch ──
    const shingleSet = shingles(normaliseIdentityText(recipe), NEAR_DUPLICATE_CRITERION.shingleSize);
    let maxSimilarity = 0;
    let nearest: { id: number; batchId: string } | null = null;
    for (const priorItem of state.acceptedShingles) {
      const sim = jaccard(shingleSet, priorItem.set);
      if (sim > maxSimilarity) {
        maxSimilarity = sim;
        nearest = { id: priorItem.id, batchId: priorItem.batchId };
      }
    }
    const nearestSame = nearest ? nearest.batchId === batchId : null;
    const titleKey = recipe.title.trim().toLowerCase();
    if (state.acceptedTitles.has(titleKey)) {
      record(false, 'near-duplicate', `duplicate title "${recipe.title}"`, null, maxSimilarity, nearest?.id ?? null, nearestSame);
      continue;
    }
    if (maxSimilarity >= NEAR_DUPLICATE_CRITERION.threshold) {
      record(
        false, 'near-duplicate',
        `jaccard ${maxSimilarity.toFixed(3)} >= ${NEAR_DUPLICATE_CRITERION.threshold} vs ${nearest?.id} (${nearestSame ? 'same batch' : 'other batch'})`,
        null, maxSimilarity, nearest?.id ?? null, nearestSame
      );
      continue;
    }

    // ── Accepted ──
    const actualTier = classifyFromMeasures(measures);
    if (actualTier !== tier) {
      throw new Error(
        `Band/threshold inconsistency: ${batchId}#${j + 1} aimed at ${tier} but ` +
          `classifyFromMeasures says ${actualTier} (${measures.byteLength} B, depth ${measures.maxDepth}). ` +
          `Reconcile GENERATION_TARGET_BANDS with COMPLEXITY_THRESHOLDS.`
      );
    }

    const payloadName = `${candidateId}.json`;
    fs.writeFileSync(path.join(PAYLOAD_DIR, payloadName), `${JSON.stringify(recipe, null, 2)}\n`, 'utf8');

    state.accepted.push({
      recipeId: candidateId,
      tier: actualTier,
      title: recipe.title,
      byteLength: measures.byteLength,
      charCount: measures.charCount,
      maxDepth: measures.maxDepth,
      nutrientCount: recipe.nutrition.nutrients.length,
      ingredientCount: recipe.extendedIngredients.length,
      stepCount: totalSteps(recipe),
      instructionSetCount: recipe.analyzedInstructions.length,
      meanCharsPerStep: Number(meanCharsPerStep(recipe).toFixed(2)),
      summaryChars: recipe.summary.length,
      payloadFile: `generated/payloads/${payloadName}`,
      rawFile: `generated/${rawFile}`,
      generatedAt: requestedAt,
      batchId,
      batchSize: size,
      indexInBatch: j,
      maxSimilarity: Number(maxSimilarity.toFixed(4)),
      nearestRecipeId: nearest?.id ?? null,
      nearestInSameBatch: nearestSame,
      inDataset: true,
    });
    state.acceptedShingles.push({ id: candidateId, batchId, set: shingleSet });
    state.acceptedTitles.add(titleKey);
    record(true, null, null, candidateId, maxSimilarity, nearest?.id ?? null, nearestSame);

    if (log) {
      console.log(
        `${itemLabel} OK ${candidateId} ${measures.byteLength} B, ${totalSteps(recipe)} steps in ` +
          `${recipe.analyzedInstructions.length} set(s), ${fmt(meanCharsPerStep(recipe), 0)} chars/step, ` +
          `sim ${maxSimilarity.toFixed(2)}${nearestSame ? '*' : ''} — ${recipe.title}`
      );
    }
  }

  return bandMisses;
}

/** Extract the model's text output from a persisted API envelope. */
function outputTextOf(envelope: any): { output: string | null; finishReason: string | null } {
  const candidate = envelope?.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const output = parts.map((p: any) => p?.text ?? '').join('') || null;
  return { output, finishReason: candidate?.finishReason ?? null };
}

/**
 * --revalidate: rebuild the accepted set from the persisted raw responses under
 * the CURRENT rules. Zero requests. Batch records, sessions and request counts
 * are kept; payloads, IDs, attempts and rejection tallies are recomputed.
 *
 * Batches recorded before `items` existed are reconstructed with
 * buildBatchSpecs; that is exact for first-attempt batches (zero deltas), and
 * the function refuses if any such batch was a corrective one.
 */
function revalidate(prior: GenerationManifest): {
  state: RunState;
  batches: BatchRecord[];
  recovered: Record<ComplexityTier, Partial<Record<RejectionReason, number>>>;
  lost: number;
} {
  const priorByKey = new Map(prior.attempts.map((a) => [`${a.batchId}#${a.indexInBatch}`, a]));

  fs.rmSync(PAYLOAD_DIR, { recursive: true, force: true });
  fs.mkdirSync(PAYLOAD_DIR, { recursive: true });

  const state: RunState = {
    accepted: [], allAttempts: [], acceptedShingles: [], acceptedTitles: new Set(),
    rejections: { low: {}, medium: {}, high: {} },
  };
  const batches: BatchRecord[] = [];
  const batchIndex: Record<ComplexityTier, number> = { low: 0, medium: 0, high: 0 };

  // Reconstruction of the per-tier item counter for batches recorded before
  // `items` existed. The live code that produced them seeded the counter at
  // SESSION START from the number of candidates seen so far in that tier
  // (a failed batch contributes none), then added each batch's requested size
  // within the session (a failed batch DOES contribute there). Reproducing
  // that exactly is what makes the reconstructed specs identical to the ones
  // actually sent.
  const sessionStarts = prior.sessions.map((x) => x.startedAt).sort();
  const sessionOf = (at: string): number => {
    let idx = -1;
    sessionStarts.forEach((start, i) => { if (start <= at) idx = i; });
    return idx;
  };
  const candidatesSeen: Record<ComplexityTier, number> = { low: 0, medium: 0, high: 0 };
  const itemsRequested: Record<ComplexityTier, number> = { low: 0, medium: 0, high: 0 };
  const lastSession: Record<ComplexityTier, number> = { low: -2, medium: -2, high: -2 };

  for (const old of prior.batches) {
    const b: BatchRecord = { ...old, acceptedCount: 0, rejectedCount: 0 };
    const tier = b.tier;
    const thisIndex = batchIndex[tier]++;

    const sess = sessionOf(b.requestedAt);
    if (sess !== lastSession[tier]) {
      itemsRequested[tier] = candidatesSeen[tier];
      lastSession[tier] = sess;
    }
    const counterForThisBatch = itemsRequested[tier];
    itemsRequested[tier] += b.requestedCount;

    if (b.outcome !== 'ok' || !b.rawFile) {
      batches.push(b);
      continue;
    }

    let specs: ItemSpec[];
    if (b.items) {
      specs = b.items.map((it) => ({ tier, ...it }));
    } else {
      if (b.promptKind !== 'generation') {
        throw new Error(`--revalidate: batch ${b.batchId} was corrective and records no item specs; cannot reconstruct`);
      }
      specs = buildBatchSpecs(tier, thisIndex, b.requestedCount, counterForThisBatch, 0, 0);
      b.items = specs.map(({ tier: _t, ...rest }) => rest);
    }

    const envelope = JSON.parse(fs.readFileSync(path.join(OUT_DIR, b.rawFile), 'utf8'));
    const { output } = outputTextOf(envelope);
    let parsed: unknown = null;
    try {
      parsed = output === null ? null : JSON.parse(output);
    } catch {
      parsed = null;
    }
    if (!Array.isArray(parsed)) {
      throw new Error(`--revalidate: ${b.batchId} raw output is not a JSON array, but its record says outcome ok`);
    }

    b.returnedCount = parsed.length;
    candidatesSeen[tier] += Math.min(parsed.length, b.requestedCount);
    processBatchCandidates(parsed, specs, tier, b.batchId, b.requestedCount, b.requestedAt, b.rawFile, b, state, false);
    batches.push(b);
  }

  // Recovery accounting: rejected before, accepted now — by original reason.
  const recovered: Record<ComplexityTier, Partial<Record<RejectionReason, number>>> = { low: {}, medium: {}, high: {} };
  let lost = 0;
  for (const a of state.allAttempts) {
    const before = priorByKey.get(`${a.batchId}#${a.indexInBatch}`);
    if (!before) continue;
    if (!before.accepted && a.accepted && before.rejectionReason) {
      recovered[a.tier][before.rejectionReason] = (recovered[a.tier][before.rejectionReason] ?? 0) + 1;
    }
    if (before.accepted && !a.accepted) lost++;
  }

  return { state, batches, recovered, lost };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flag = (name: string): string | undefined =>
    argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

  const counts: Record<ComplexityTier, number> = {
    low: Number(flag('low') ?? 50),
    medium: Number(flag('medium') ?? 50),
    high: Number(flag('high') ?? 50),
  };

  // ── --dry-run: zero requests ────────────────────────────────────────────────
  if (argv.includes('--dry-run')) {
    const minRequests = COMPLEXITY_TIERS.reduce(
      (n, t) => n + Math.ceil(counts[t] / INITIAL_BATCH_SIZE[t]),
      0
    );
    console.log('\nGENERATION PLAN (no requests made)\n');
    console.log(`  documents      : ${counts.low + counts.medium + counts.high}  (low=${counts.low} medium=${counts.medium} high=${counts.high})`);
    console.log(`  batch sizes    : low ${INITIAL_BATCH_SIZE.low}, medium ${INITIAL_BATCH_SIZE.medium}, high ${INITIAL_BATCH_SIZE.high} documents per request`);
    console.log(`  requests       : ${minRequests} at zero rejections; cap ${minRequests * REQUEST_BUDGET_MULTIPLIER}`);
    console.log(`  daily quota    : 20 requests/day/model (free tier) => ${Math.ceil(minRequests / 20)} session(s) minimum`);
    console.log(`  pacing         : >=${MIN_INTERVAL_MS} ms between starts => ${(60000 / MIN_INTERVAL_MS).toFixed(1)} RPM`);
    console.log(`  temperature    : ${TEMPERATURE}`);
    console.log(`  duplicate rule : ${NEAR_DUPLICATE_CRITERION.measure} >= ${NEAR_DUPLICATE_CRITERION.threshold}, every item vs every accepted item in every tier`);
    console.log('\n  output-token budget per request (thinking reserve ' + THINKING_RESERVE_TOKENS + '):');
    for (const tier of COMPLEXITY_TIERS) {
      const docs = INITIAL_BATCH_SIZE[tier] * TOKENS_PER_ITEM[tier];
      console.log(
        `    ${tier.padEnd(6)} ${INITIAL_BATCH_SIZE[tier]} x ${TOKENS_PER_ITEM[tier]} = ${docs} + ${THINKING_RESERVE_TOKENS} = ${docs + THINKING_RESERVE_TOKENS} tokens`
      );
    }
    console.log('\n  per-tier structural plan (text budgets identical across tiers):');
    for (const tier of COMPLEXITY_TIERS) {
      if (counts[tier] === 0) continue;
      const sample = buildBatchSpecs(tier, 0, counts[tier], 0, 0, 0);
      const band = GENERATION_TARGET_BANDS[tier];
      const setCounts = [...new Set(sample.map((s) => s.instructionSetCount))].sort();
      console.log(
        `    ${tier.padEnd(6)} band ${band.minBytes}-${band.maxBytes} B  ` +
          `nutrients ${TIER_PLANS[tier].nutrientCount}  ingredients ${TIER_PLANS[tier].ingredientCount}  ` +
          `steps ${Math.min(...sample.map((s) => s.stepCount))}-${Math.max(...sample.map((s) => s.stepCount))}  ` +
          `sets ${setCounts.join('/')}  ` +
          `multi-set ${sample.filter((s) => s.instructionSetCount > 1).length}/${sample.length}`
      );
    }
    console.log(`\n  step text budget : ${STEP_CHARS_MIN}-${STEP_CHARS_MAX} chars — CONSTANT across all tiers`);
    console.log('  (size varies by element COUNT, not element LENGTH)\n');

    // --show-prompt=<tier>: print the exact first-batch prompt for inspection.
    const show = flag('show-prompt') as ComplexityTier | undefined;
    if (show && COMPLEXITY_TIERS.includes(show)) {
      const artifacts = loadPromptArtifacts();
      const specs = buildBatchSpecs(show, 0, INITIAL_BATCH_SIZE[show], 0, 0, 0);
      const rule = '-'.repeat(78);
      console.log(`${rule}\nSYSTEM INSTRUCTION\n${rule}\n${artifacts.systemInstruction}`);
      console.log(`${rule}\nFIRST ${show.toUpperCase()} BATCH PROMPT\n${rule}\n${buildBatchPrompt(artifacts, specs)}`);
      console.log(`${rule}\nEXAMPLE CORRECTIVE PROMPT\n${rule}\n${buildCorrectiveBatchPrompt(artifacts, show, specs, '(example diagnosis)')}`);
    }
    return;
  }

  const apiKey = readApiKey();

  // ── --list-models: one request, generates nothing ───────────────────────────
  if (argv.includes('--list-models')) {
    const models = await listModels(apiKey);
    const usable = models.filter((m) => m.supportedMethods.includes('generateContent'));
    console.log(`\nMODELS AVAILABLE TO THIS KEY (${usable.length} support generateContent)\n`);
    for (const m of usable) {
      console.log(
        `  ${m.id.padEnd(42)} in=${String(m.inputTokenLimit ?? '?').padStart(8)}  ` +
          `out=${String(m.outputTokenLimit ?? '?').padStart(6)}  v=${m.version ?? '?'}`
      );
    }
    console.log('\n  Flash candidates:');
    for (const m of usable.filter((x) => /flash/i.test(x.id))) {
      console.log(`    ${m.id}  —  ${m.displayName ?? ''}  (output limit ${m.outputTokenLimit ?? '?'} tokens)`);
    }
    const highBatch = INITIAL_BATCH_SIZE.high * TOKENS_PER_ITEM.high + THINKING_RESERVE_TOKENS;
    console.log(
      `\n  A high-tier batch needs ~${highBatch} output tokens in ONE response\n` +
        `  (${INITIAL_BATCH_SIZE.high} documents + ${THINKING_RESERVE_TOKENS} reserved for thinking).\n`
    );
    return;
  }

  const modelId = flag('model');
  if (!modelId) {
    throw new Error('--model=<id> is required. Run with --list-models first to see what this key can use.');
  }

  // Confirm the model exists and read its real limits, rather than assuming.
  const models = await listModels(apiKey);
  const model = models.find((m) => m.id === modelId);
  if (!model) {
    throw new Error(
      `Model "${modelId}" is not available to this key.\n` +
        `Available: ${models.filter((m) => m.supportedMethods.includes('generateContent')).map((m) => m.id).join(', ')}`
    );
  }
  if (!model.supportedMethods.includes('generateContent')) {
    throw new Error(`Model "${modelId}" does not support generateContent.`);
  }

  const artifacts = loadPromptArtifacts();

  // Output budget: the model's full limit. Thinking tokens are charged against
  // it, so an estimate of the JSON size alone is the wrong number (see the
  // pilot's MAX_TOKENS failures).
  const outputLimit = model.outputTokenLimit ?? 32768;
  const maxOutputTokens = outputLimit;

  // ── Resume / fresh ──────────────────────────────────────────────────────────
  const resume = argv.includes('--resume');
  const fresh = argv.includes('--fresh');
  fs.mkdirSync(PAYLOAD_DIR, { recursive: true });
  fs.mkdirSync(RAW_DIR, { recursive: true });
  const priorManifest: GenerationManifest | null = fs.existsSync(MANIFEST_PATH)
    ? (JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) as GenerationManifest)
    : null;
  const priorPayloads = fs.readdirSync(PAYLOAD_DIR).filter((f) => /^\d+\.json$/.test(f));

  if ((priorManifest || priorPayloads.length > 0) && !resume && !fresh) {
    throw new Error(
      `fixtures/generated/ already holds ${priorPayloads.length} payload(s)` +
        `${priorManifest ? ' and a manifest' : ''}. ` +
        `Pass --resume to continue that run, or --fresh to discard it and start over.`
    );
  }
  if (fresh) {
    fs.rmSync(OUT_DIR, { recursive: true, force: true });
    fs.mkdirSync(PAYLOAD_DIR, { recursive: true });
    fs.mkdirSync(RAW_DIR, { recursive: true });
  }
  const prior = resume ? priorManifest : null;
  if (resume && !prior) {
    throw new Error('--resume given but no manifest exists. Use --fresh to start a run.');
  }

  // A resumed run must be the SAME run: same model, same prompt artifacts.
  if (prior) {
    if (prior.model.id !== model.id) {
      throw new Error(
        `--resume refused: manifest was generated with ${prior.model.id}, ` +
          `this invocation asked for ${model.id}. One dataset, one model.`
      );
    }
    for (const [key, h] of Object.entries(artifacts.hashes)) {
      const p = prior.promptArtifacts[key];
      if (p && p.sha256 !== h.sha256) {
        throw new Error(
          `--resume refused: ${h.file} has changed since the run began ` +
            `(sha256 ${p.sha256.slice(0, 12)}… → ${h.sha256.slice(0, 12)}…). ` +
            `Prompt artifacts are frozen for the life of a run.`
        );
      }
    }
  }

  // ── State ───────────────────────────────────────────────────────────────────
  const pacer = new Pacer();
  const sessionStartedAt = new Date().toISOString();
  const sessionStartMs = Date.now();

  let state: RunState = {
    accepted: prior ? [...prior.recipes] : [],
    allAttempts: prior ? [...prior.attempts] : [],
    acceptedShingles: [],
    acceptedTitles: new Set<string>(),
    rejections: prior ? JSON.parse(JSON.stringify(prior.rejections)) : { low: {}, medium: {}, high: {} },
  };
  let batches: BatchRecord[] = prior ? [...prior.batches] : [];
  let revalidation: ValidationRules['revalidation'] = prior?.validation?.revalidation ?? null;
  const batchFailures: Record<ComplexityTier, Partial<Record<BatchOutcome, number>>> = prior
    ? JSON.parse(JSON.stringify(prior.batchFailures))
    : { low: {}, medium: {}, high: {} };
  const sessions = prior ? [...prior.sessions] : [];
  const batchSize: Record<ComplexityTier, number> = prior
    ? { ...prior.batching.batchSize }
    : { ...INITIAL_BATCH_SIZE };
  let observedMaxThinking: number | null = prior ? prior.batching.observedMaxThinkingTokens : null;
  let totalRequests = prior ? prior.totalRequests : 0;
  const priorDurationMs = prior ? prior.pacing.observedDurationMs : 0;
  const priorPeakRpm = prior ? prior.pacing.observedPeakRpm : 0;
  let sessionRequests = 0;
  let sessionAccepted = 0;

  for (const tier of COMPLEXITY_TIERS) {
    while (batchSize[tier] > 1 && !fitsOutputLimit(tier, batchSize[tier], outputLimit)) batchSize[tier]--;
  }

  const acceptedByTier = (): Record<ComplexityTier, number> => ({
    low: acceptedCount(state, 'low'),
    medium: acceptedCount(state, 'medium'),
    high: acceptedCount(state, 'high'),
  });

  const noteBatchFailure = (tier: ComplexityTier, outcome: BatchOutcome) => {
    batchFailures[tier][outcome] = (batchFailures[tier][outcome] ?? 0) + 1;
  };

  // ── --revalidate: rebuild the accepted set from raw under current rules ────
  if (argv.includes('--revalidate')) {
    if (!prior) throw new Error('--revalidate needs an existing manifest (pass --resume --revalidate).');
    const rv = revalidate(prior);
    const before = prior.accepted;
    state = rv.state;
    batches = rv.batches;
    revalidation = {
      at: new Date().toISOString(),
      note:
        'Validation rules changed mid-run (see validation.history). Every persisted raw batch ' +
        'response was re-validated under the final rule set, payloads and IDs were rebuilt from ' +
        'scratch, and rejection tallies recomputed. Generation and validation are separable stages, ' +
        'so the accepted set is a deterministic function of the raw files and these rules ' +
        'regardless of when the rules were fixed.',
      recovered: rv.recovered,
      lost: rv.lost,
    };
    const after = acceptedByTier();
    console.log(`\n${'='.repeat(78)}\nREVALIDATION (zero requests)\n${'='.repeat(78)}`);
    console.log(`density floor ${DENSITY_FLOOR} (${DENSITY_FLOOR_BASIS})`);
    console.log(`density ceiling ${DENSITY_CEILING}; pct daily needs max ${PCT_DAILY_NEEDS_MAX}; min steps/set ${MIN_STEPS_PER_SET}`);
    for (const tier of COMPLEXITY_TIERS) {
      const rec = Object.entries(rv.recovered[tier]).map(([k, v]) => `${k}=${v}`).join(', ') || 'none';
      console.log(`  ${tier.padEnd(6)} accepted ${before[tier]} -> ${after[tier]}   recovered: ${rec}`);
    }
    console.log(`  lost (accepted before, rejected now): ${rv.lost}`);
    // Fall through: the checkpoint below writes the rebuilt manifest, then the
    // run continues (or stops on the tier loop if nothing is requested).
  }

  // Near-duplicate index over the accepted set, in acceptance order (already
  // populated by revalidate when that ran).
  if (state.acceptedShingles.length === 0) {
    for (const r of [...state.accepted].sort((a, b) => a.generatedAt.localeCompare(b.generatedAt))) {
      const recipe = JSON.parse(fs.readFileSync(path.join(PAYLOAD_DIR, `${r.recipeId}.json`), 'utf8')) as Recipe;
      state.acceptedShingles.push({
        id: r.recipeId,
        batchId: r.batchId,
        set: shingles(normaliseIdentityText(recipe), NEAR_DUPLICATE_CRITERION.shingleSize),
      });
      state.acceptedTitles.add(recipe.title.trim().toLowerCase());
    }
  }

  console.log(`\n${'='.repeat(78)}`);
  console.log(`GENERATIVE DATASET RUN${prior ? ' (resumed)' : ''}`);
  console.log('='.repeat(78));
  console.log(`model            : ${model.id}  (${model.displayName ?? 'no display name'}, version ${model.version ?? '?'})`);
  console.log(`token limits     : input ${model.inputTokenLimit ?? '?'}, output ${model.outputTokenLimit ?? '?'}`);
  console.log(`maxOutputTokens  : ${maxOutputTokens}  (thinking reserve ${THINKING_RESERVE_TOKENS})`);
  console.log(`batch sizes      : low ${batchSize.low}, medium ${batchSize.medium}, high ${batchSize.high}`);
  console.log(`temperature      : ${TEMPERATURE}`);
  console.log(`endpoint         : ${redactUrl(`${API_HOST}/${API_VERSION}/models/${modelId}:generateContent?key=x`)}`);
  console.log(`documents        : ${counts.low + counts.medium + counts.high} (low=${counts.low} medium=${counts.medium} high=${counts.high})`);
  console.log(`pacing           : >=${MIN_INTERVAL_MS} ms between starts, window guard ${WINDOW_MAX_REQUESTS}/60s`);
  console.log(`duplicate rule   : ${NEAR_DUPLICATE_CRITERION.measure} >= ${NEAR_DUPLICATE_CRITERION.threshold}`);
  console.log(`prompt artifacts : ${Object.values(artifacts.hashes).map((h) => h.file).join(', ')}`);
  if (prior) {
    const a = acceptedByTier();
    console.log(`resuming from    : ${state.accepted.length} accepted (low=${a.low} medium=${a.medium} high=${a.high}), ${totalRequests} requests spent`);
  }
  console.log('');

  // ── Manifest / checkpoint ───────────────────────────────────────────────────
  const buildManifest = (endedBy: string): GenerationManifest => {
    // Balanced design: a tier holding more accepted payloads than requested is
    // reduced to a seeded random sample; the draw is recorded in `selection`.
    const a = acceptedByTier();
    const perTier = {} as GenerationManifest['selection']['perTier'];
    for (const tier of COMPLEXITY_TIERS) {
      const ids = state.accepted.filter((r) => r.tier === tier).map((r) => r.recipeId);
      const requested = counts[tier];
      const sampled = requested > 0 && ids.length > requested;
      const selected = sampled ? seededSample(ids, requested, SELECTION_SEED) : [...ids].sort((x, y) => x - y);
      const chosen = new Set(selected);
      for (const r of state.accepted) {
        if (r.tier === tier) r.inDataset = requested === 0 ? r.inDataset : chosen.has(r.recipeId);
      }
      perTier[tier] = { accepted: ids.length, requested, sampled, selected };
    }
    return {
      generatedAt: new Date().toISOString(),
      source: 'generated',
      complete: COMPLEXITY_TIERS.every((t) => a[t] >= counts[t]),
      sessions: [
        ...sessions,
        {
          startedAt: sessionStartedAt,
          finishedAt: new Date().toISOString(),
          requests: sessionRequests,
          accepted: sessionAccepted,
          endedBy,
        },
      ],
      disclaimer:
        'SYNTHETIC DATA. Every payload referenced by this manifest was produced by a ' +
        'generative language model for use as a serialization benchmark fixture. None of ' +
        'it originates from Spoonacular or any other recipe API, and none of it may be ' +
        'presented or cited as real API data. Real API-sourced payloads live in ' +
        'fixtures/recipes-raw/ and are described by fixtures/benchmark-recipe-ids.json.',
      model: {
        id: model.id,
        displayName: model.displayName,
        version: model.version,
        inputTokenLimit: model.inputTokenLimit,
        outputTokenLimit: model.outputTokenLimit,
        endpoint: `${API_HOST}/${API_VERSION}/models/${model.id}:generateContent`,
      },
      generationConfig: {
        temperature: TEMPERATURE,
        topP: null,
        topK: null,
        maxOutputTokens,
        responseMimeType: RESPONSE_MIME_TYPE,
      },
      batching: {
        batchSize: { ...batchSize },
        tokensPerItem: { ...TOKENS_PER_ITEM },
        thinkingReserveTokens: THINKING_RESERVE_TOKENS,
        observedMaxThinkingTokens: observedMaxThinking,
      },
      promptArtifacts: artifacts.hashes,
      selection: { method: SELECTION_METHOD, seed: SELECTION_SEED, perTier },
      quarantine: QUARANTINE,
      validation: {
        densityCeilingCharsPerStep: DENSITY_CEILING,
        densityFloorCharsPerStep: DENSITY_FLOOR,
        densityFloorBasis: DENSITY_FLOOR_BASIS,
        percentOfDailyNeedsMax: PCT_DAILY_NEEDS_MAX,
        percentOfDailyNeedsBasis: PCT_DAILY_NEEDS_BASIS,
        minStepsPerSet: MIN_STEPS_PER_SET,
        relaxedAgainstReferenceData: RULES_RELAXED_AGAINST_REFERENCE,
        history: RULES_HISTORY,
        revalidation,
      },
      pacing: {
        minIntervalMs: MIN_INTERVAL_MS,
        slidingWindowRequests: WINDOW_MAX_REQUESTS,
        slidingWindowMs: WINDOW_MS,
        observedRequests: totalRequests,
        observedDurationMs: priorDurationMs + (Date.now() - sessionStartMs),
        observedPeakRpm: Math.max(priorPeakRpm, pacer.observedPeakRpm),
      },
      nearDuplicate: NEAR_DUPLICATE_CRITERION,
      targetBands: GENERATION_TARGET_BANDS,
      thresholds: COMPLEXITY_THRESHOLDS,
      requested: counts,
      accepted: a,
      rejections: state.rejections,
      batchFailures,
      totalRequests,
      recipes: state.accepted,
      batches,
      attempts: state.allAttempts,
    };
  };

  const checkpoint = (endedBy: string): GenerationManifest => {
    const manifest = buildManifest(endedBy);
    fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    return manifest;
  };

  // ── Generation loop ─────────────────────────────────────────────────────────
  let stoppedReason: string | null = null;

  // Refuse to run alongside another live session: two writers on one manifest
  // is exactly the race that corrupted a revalidation earlier.
  if (fs.existsSync(PID_FILE)) {
    const otherPid = Number(fs.readFileSync(PID_FILE, 'utf8').trim());
    let alive = false;
    try {
      process.kill(otherPid, 0);
      alive = true;
    } catch {
      alive = false;
    }
    if (alive && otherPid !== process.pid) {
      throw new Error(`Another session (pid ${otherPid}) is running on fixtures/generated/. Stop it first (touch fixtures/generated/STOP).`);
    }
  }
  // A STOP file present at startup means "do not generate": write the
  // checkpoint (so --revalidate / selection changes land) and exit before any
  // request. The operator removes the file to allow a run.
  fs.writeFileSync(PID_FILE, String(process.pid), 'utf8');
  if (fs.existsSync(STOP_FILE)) {
    console.warn(`[gen] STOP file present (${STOP_FILE}) — checkpointing and exiting without any request`);
    stoppedReason = 'stop-file';
  }
  const releasePid = () => { try { fs.rmSync(PID_FILE); } catch { /* already gone */ } };
  process.on('exit', releasePid);

  // --order=medium,high,low spends the daily quota on the tiers that need it
  // most first. Defaults to low, medium, high.
  const orderFlag = flag('order');
  const tierOrder: ComplexityTier[] = orderFlag
    ? (orderFlag.split(',').map((t) => t.trim()) as ComplexityTier[])
    : [...COMPLEXITY_TIERS];
  for (const t of tierOrder) {
    if (!COMPLEXITY_TIERS.includes(t)) throw new Error(`--order: unknown tier "${t}"`);
  }

  for (const tier of tierOrder) {
    if (stoppedReason) break;

    const requestCap = Math.ceil(counts[tier] / INITIAL_BATCH_SIZE[tier]) * REQUEST_BUDGET_MULTIPLIER;
    let tierRequests = batches.filter((b) => b.tier === tier).length;
    let itemsRequested = batches.filter((b) => b.tier === tier).reduce((n, b) => n + b.requestedCount, 0);

    // Tier-level correction state. A batch whose items mostly miss the band
    // shifts the counts for the next batch, using the byte model; the next
    // prompt is the corrective template carrying the diagnosis.
    let stepDelta = 0;
    let ingredientDelta = 0;
    let pendingDiagnosis: string | null = null;

    while (acceptedByTier()[tier] < counts[tier]) {
      // Cooperative stop: a STOP file in fixtures/generated/ ends the session
      // cleanly before the next request. Killing the shell that launched npm
      // does NOT kill this node process — that is how two orphaned runs kept
      // spending quota after they were "stopped".
      if (fs.existsSync(STOP_FILE)) {
        console.warn(`[gen] STOP file found (${STOP_FILE}) — ending session before the next request`);
        stoppedReason = 'stop-file';
        break;
      }
      if (tierRequests >= requestCap) {
        console.warn(`[gen] ${tier}: request cap ${requestCap} reached with ${acceptedByTier()[tier]}/${counts[tier]} accepted — stopping this tier`);
        stoppedReason = stoppedReason ?? 'budget-exhausted';
        break;
      }

      const remaining = counts[tier] - acceptedByTier()[tier];
      const size = Math.min(batchSize[tier], remaining);
      const batchIndex = tierRequests;
      const batchId = `${tier}-b${String(batchIndex + 1).padStart(2, '0')}`;
      const specs = buildBatchSpecs(tier, batchIndex, size, itemsRequested, stepDelta, ingredientDelta);
      const promptKind: 'generation' | 'corrective-retry' = pendingDiagnosis ? 'corrective-retry' : 'generation';
      const prompt = pendingDiagnosis
        ? buildCorrectiveBatchPrompt(artifacts, tier, specs, pendingDiagnosis)
        : buildBatchPrompt(artifacts, specs);
      pendingDiagnosis = null;

      const requestedAt = new Date().toISOString();
      totalRequests++;
      sessionRequests++;
      tierRequests++;
      itemsRequested += size;

      const label = `[${batchId}] ${size} docs`;
      const result = await generateContent(
        apiKey, model.id, artifacts.systemInstruction, prompt,
        artifacts.responseSchema, maxOutputTokens, pacer
      );

      // Persist the VERBATIM API response for EVERY request.
      const rawName = `${batchId}.json`;
      let rawFile: string | null = null;
      if (result.rawText) {
        fs.writeFileSync(path.join(RAW_DIR, rawName), result.rawText, 'utf8');
        rawFile = `raw/${rawName}`;
      }
      const thinking = result.usageMetadata?.thoughtsTokenCount ?? null;
      if (thinking !== null) observedMaxThinking = Math.max(observedMaxThinking ?? 0, thinking);

      const batchRecord: BatchRecord = {
        batchId, tier, requestedAt, requestedCount: size, returnedCount: 0,
        acceptedCount: 0, rejectedCount: 0, promptKind, rawFile,
        httpStatus: result.httpStatus, finishReason: result.finishReason,
        usageMetadata: result.usageMetadata, outcome: 'ok', detail: null,
        items: specs.map(({ tier: _t, ...rest }) => rest),
      };
      batches.push(batchRecord);

      const failBatch = (outcome: BatchOutcome, detail: string) => {
        batchRecord.outcome = outcome;
        batchRecord.detail = detail;
        noteBatchFailure(tier, outcome);
        console.warn(`${label} BATCH FAILED ${outcome}: ${detail}`);
      };

      // ── Batch-level outcomes ──
      if (result.dailyQuota) {
        failBatch('daily-quota', 'HTTP 429 per-day free-tier quota exhausted');
        stoppedReason = 'daily-quota';
        checkpoint(stoppedReason);
        break;
      }
      if (result.error !== null || result.output === null) {
        const detail = result.error ?? `no output (finishReason ${result.finishReason})`;
        failBatch(result.error !== null && result.httpStatus !== 200 ? 'http-error' : 'blocked-or-truncated', detail);
        checkpoint('in-progress');
        continue;
      }
      if (result.finishReason && result.finishReason !== 'STOP') {
        failBatch('blocked-or-truncated', `finishReason ${result.finishReason}` + (thinking !== null ? `, thinking ${thinking} tokens` : ''));
        if (result.finishReason === 'MAX_TOKENS') {
          const shrunk = Math.max(2, Math.floor(batchSize[tier] * TRUNCATION_SHRINK));
          console.warn(`[gen] ${tier}: batch size ${batchSize[tier]} -> ${shrunk} after truncation`);
          batchSize[tier] = shrunk;
        }
        checkpoint('in-progress');
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(result.output);
      } catch (err) {
        failBatch('unparseable-json', err instanceof Error ? err.message : String(err));
        checkpoint('in-progress');
        continue;
      }
      if (!Array.isArray(parsed)) {
        failBatch('not-an-array', `top-level JSON was ${typeof parsed}`);
        checkpoint('in-progress');
        continue;
      }

      batchRecord.returnedCount = parsed.length;
      if (parsed.length !== size) {
        batchRecord.detail = `requested ${size}, returned ${parsed.length}; processed positionally`;
        console.warn(`${label} returned ${parsed.length} documents (requested ${size})`);
      }

      // ── Item-level validation, each candidate independently ──
      const acceptedBefore = state.accepted.length;
      const bandMisses = processBatchCandidates(
        parsed, specs, tier, batchId, size, requestedAt, rawFile, batchRecord, state, true
      );
      sessionAccepted += state.accepted.length - acceptedBefore;

      console.log(
        `${label} => ${batchRecord.acceptedCount} accepted, ${batchRecord.rejectedCount} rejected` +
          (thinking !== null ? `; thinking ${thinking} tokens, output ${result.usageMetadata?.candidatesTokenCount ?? '?'}` : '')
      );

      // ── Tier-level correction for the next batch ──
      if (bandMisses.length > 0 && bandMisses.length * 2 >= Math.min(parsed.length, size)) {
        const meanMiss = mean(bandMisses);
        const delta = bandAim(tier) - meanMiss;
        const stepShift = Math.round(delta / BYTES.perStep);
        stepDelta += stepShift;
        pendingDiagnosis =
          `Of the ${Math.min(parsed.length, size)} documents in the previous batch, ${bandMisses.length} fell outside ` +
          `the band; their mean size was ${Math.round(meanMiss)} bytes, ${Math.abs(Math.round(delta))} bytes too ` +
          `${delta > 0 ? 'SMALL' : 'LARGE'}. The step counts below have been ${delta > 0 ? 'raised' : 'lowered'} ` +
          `by ${Math.abs(stepShift)} per document to compensate. Do NOT change the length of individual steps.`;
      }

      checkpoint('in-progress');
    }
  }

  const manifest = checkpoint(stoppedReason ?? 'complete');

  if (stoppedReason === 'daily-quota') {
    console.warn(
      `\n[gen] SESSION ENDED BY DAILY QUOTA. ${state.accepted.length} accepted so far. ` +
        `Re-run with --resume after the quota resets to continue this run.\n`
    );
  }

  report(manifest);
}

// ─── Report ───────────────────────────────────────────────────────────────────

function report(manifest: GenerationManifest): void {
  const r = manifest.recipes;

  console.log(`\n${'='.repeat(78)}`);
  console.log('GENERATION RESULT');
  console.log('='.repeat(78));
  console.log(`model           : ${manifest.model.id} (version ${manifest.model.version ?? '?'})`);
  console.log(`temperature     : ${manifest.generationConfig.temperature}`);
  console.log(`requests made   : ${manifest.totalRequests} across ${manifest.sessions.length} session(s)`);
  console.log(`wall time       : ${(manifest.pacing.observedDurationMs / 60000).toFixed(1)} min (cumulative)`);
  console.log(`peak RPM        : ${manifest.pacing.observedPeakRpm} (limit ${WINDOW_MAX_REQUESTS})`);
  console.log(`complete        : ${manifest.complete}`);

  console.log('\n-- Accepted per tier --');
  for (const tier of COMPLEXITY_TIERS) {
    const got = manifest.accepted[tier];
    const want = manifest.requested[tier];
    console.log(`  ${tier.padEnd(6)} ${got}/${want}${got < want ? '   << SHORT — not padded' : ''}`);
  }

  console.log('\n-- Batches --');
  console.log(`  ${'tier'.padEnd(7)}${'batches'.padStart(8)}${'ok'.padStart(5)}${'failed'.padStart(8)}${'docs/req'.padStart(10)}${'thinking tok (mean/max)'.padStart(26)}${'output tok (mean)'.padStart(19)}`);
  for (const tier of COMPLEXITY_TIERS) {
    const bs = manifest.batches.filter((b) => b.tier === tier);
    if (bs.length === 0) continue;
    const ok = bs.filter((b) => b.outcome === 'ok');
    const think = ok.map((b) => b.usageMetadata?.thoughtsTokenCount ?? 0);
    const out = ok.map((b) => b.usageMetadata?.candidatesTokenCount ?? 0);
    console.log(
      `  ${tier.padEnd(7)}${String(bs.length).padStart(8)}${String(ok.length).padStart(5)}${String(bs.length - ok.length).padStart(8)}` +
        `${fmt(mean(ok.map((b) => b.acceptedCount)), 1).padStart(10)}` +
        `${(think.length ? `${fmt(mean(think), 0)} / ${Math.max(...think)}` : 'n/a').padStart(26)}` +
        `${(out.length ? fmt(mean(out), 0) : 'n/a').padStart(19)}`
    );
  }
  for (const tier of COMPLEXITY_TIERS) {
    const f = manifest.batchFailures[tier];
    const entries = Object.entries(f).filter(([, n]) => (n ?? 0) > 0);
    if (entries.length) console.log(`  ${tier} batch failures: ${entries.map(([k, n]) => `${k}=${n}`).join(', ')}`);
  }

  console.log('\n-- Item rejections by tier and reason --');
  for (const tier of COMPLEXITY_TIERS) {
    const byReason = manifest.rejections[tier];
    const total = Object.values(byReason).reduce((a, b) => a + (b ?? 0), 0);
    const candidates = manifest.attempts.filter((a) => a.tier === tier).length;
    const rate = candidates === 0 ? 0 : (total / candidates) * 100;
    console.log(`  ${tier.padEnd(6)} ${total}/${candidates} candidates rejected (${fmt(rate)}%)`);
    for (const [reason, count] of Object.entries(byReason).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))) {
      console.log(`           ${String(reason).padEnd(22)} ${count}`);
    }
  }

  console.log('\n-- Structural profile per tier (STRUCTURE vs VERBOSITY) --');
  console.log(
    `  ${'tier'.padEnd(7)}${'n'.padStart(4)}${'bytes(mean)'.padStart(13)}${'sd'.padStart(9)}` +
      `${'nutr'.padStart(7)}${'ingr'.padStart(7)}${'steps'.padStart(7)}${'sets'.padStart(6)}` +
      `${'chars/step'.padStart(12)}${'summary'.padStart(9)}`
  );
  for (const tier of COMPLEXITY_TIERS) {
    const inTier = r.filter((x) => x.tier === tier);
    if (inTier.length === 0) {
      console.log(`  ${tier.padEnd(7)}${String(0).padStart(4)}   (none accepted)`);
      continue;
    }
    console.log(
      `  ${tier.padEnd(7)}${String(inTier.length).padStart(4)}` +
        `${fmt(mean(inTier.map((x) => x.byteLength)), 0).padStart(13)}` +
        `${fmt(sd(inTier.map((x) => x.byteLength)), 0).padStart(9)}` +
        `${fmt(mean(inTier.map((x) => x.nutrientCount)), 1).padStart(7)}` +
        `${fmt(mean(inTier.map((x) => x.ingredientCount)), 1).padStart(7)}` +
        `${fmt(mean(inTier.map((x) => x.stepCount)), 1).padStart(7)}` +
        `${fmt(mean(inTier.map((x) => x.instructionSetCount)), 1).padStart(6)}` +
        `${fmt(mean(inTier.map((x) => x.meanCharsPerStep)), 1).padStart(12)}` +
        `${fmt(mean(inTier.map((x) => x.summaryChars)), 0).padStart(9)}`
    );
  }
  console.log(
    '\n  chars/step is the verbosity control: if it is flat across tiers, the size\n' +
      '  increase came from element COUNT (structure), not element LENGTH (prose).'
  );

  console.log('\n-- Multi-instruction-set coverage --');
  for (const tier of COMPLEXITY_TIERS) {
    const inTier = r.filter((x) => x.tier === tier);
    const multi = inTier.filter((x) => x.instructionSetCount > 1);
    console.log(`  ${tier.padEnd(6)} ${multi.length}/${inTier.length} multi-set`);
  }
  const allMulti = r.filter((x) => x.instructionSetCount > 1).length;
  console.log(`  TOTAL  ${allMulti}/${r.length} multi-set  (the real harvest has 5/100)`);

  console.log('\n-- Near-duplicate similarity of accepted payloads --');
  const sims = r.map((x) => x.maxSimilarity);
  if (sims.length > 0) {
    console.log(
      `  max ${Math.max(...sims).toFixed(3)}  mean ${mean(sims).toFixed(3)}  ` +
        `median ${median(sims).toFixed(3)}  (threshold ${NEAR_DUPLICATE_CRITERION.threshold})`
    );
    const same = r.filter((x) => x.nearestInSameBatch === true);
    const other = r.filter((x) => x.nearestInSameBatch === false);
    console.log(
      `  nearest neighbour in SAME batch: ${same.length} items (mean sim ${same.length ? mean(same.map((x) => x.maxSimilarity)).toFixed(3) : 'n/a'})` +
        `   in OTHER batch: ${other.length} items (mean sim ${other.length ? mean(other.map((x) => x.maxSimilarity)).toFixed(3) : 'n/a'})`
    );
  }

  console.log(`\nmanifest : ${MANIFEST_PATH}`);
  console.log(`payloads : ${PAYLOAD_DIR}`);
  console.log(`raw      : ${RAW_DIR}  (every request, verbatim)`);

  const shortfall = COMPLEXITY_TIERS.filter((t) => manifest.accepted[t] < manifest.requested[t]);
  if (shortfall.length > 0) {
    console.log(
      `\nNOTE: ${shortfall.map((t) => `${t} reached ${manifest.accepted[t]}/${manifest.requested[t]}`).join('; ')}. ` +
        `Nothing was padded, duplicated, or inflated to reach the target — these are the real accepted counts.`
    );
  }
}

main().catch((err) => {
  console.error('[gen] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
