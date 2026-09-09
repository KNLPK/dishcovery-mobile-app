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
 *   npm run generate:dataset -- --list-models     # 1 request, generates nothing
 *   npm run generate:dataset -- --dry-run         # 0 requests, prints the plan
 *   npm run generate:dataset -- --model=<id>      # full run
 *   npm run generate:dataset -- --model=<id> --low=5 --medium=5 --high=5   # smaller
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
  type ComplexityTier,
  type GeneratedRecipe,
  type GenerationAttempt,
  type GenerationManifest,
  type Recipe,
  type RejectionReason,
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

/** Max corrective retries per item, after the first attempt. */
const MAX_ATTEMPTS = 3;

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
 * alone: at the observed text density, reaching the high band through step count
 * by itself would demand ~175 steps, which no recipe document plausibly carries.
 * Raising the ingredient list alongside it keeps the shape of a large
 * multi-component menu rather than an endless single procedure.
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
    ingredientCount: 30,
    setCycle: [2, 3, 2, 3, 4],
  },
  high: {
    nutrientCount: 36,
    ingredientCount: 80,
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
          usageMetadata: null, error: `network: ${message}`,
        };
      }
      console.warn(`[gen] network error (${message}); backing off ${BACKOFF_MS[backoff] / 1000}s`);
      await delay(BACKOFF_MS[backoff]);
      continue;
    }

    // 429 / 503: back off and retry. These consume budget and are recorded.
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
        usageMetadata: null, error: `HTTP ${res.status}`,
      };
    }

    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      return {
        httpStatus: res.status, rawText: text, output: null, finishReason: null,
        usageMetadata: null, error: 'API envelope was not JSON',
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

    return { httpStatus: res.status, rawText: text, output, finishReason, usageMetadata, error: null };
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
  recipeId: number;
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
    if (!Number.isFinite(n.percentOfDailyNeeds) || n.percentOfDailyNeeds < 0 || n.percentOfDailyNeeds > 1000) {
      return fail(`nutrient "${n.name}" percentOfDailyNeeds ${n.percentOfDailyNeeds}`);
    }
  }

  for (const i of recipe.extendedIngredients) {
    if (!i.name.trim()) return fail('ingredient with empty name');
    if (!Number.isFinite(i.amount) || i.amount <= 0) return fail(`ingredient "${i.name}" amount ${i.amount}`);
  }

  if (recipe.analyzedInstructions.length === 0) return fail('no instruction sets');
  const seenSetNames = new Set<string>();
  for (const set of recipe.analyzedInstructions) {
    if (set.steps.length < 2) return fail(`instruction set "${set.name}" has ${set.steps.length} step(s)`);
    if (recipe.analyzedInstructions.length > 1) {
      // `name` is optional on the contract type; toCanonicalShape always
      // materialises it, but the check must not assume that.
      const key = (set.name ?? '').trim().toLowerCase();
      if (!key) return fail('multi-set recipe has an unnamed instruction set');
      if (seenSetNames.has(key)) return fail(`duplicate instruction set name "${set.name}"`);
      seenSetNames.add(key);
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

function buildGenerationPrompt(artifacts: PromptArtifacts, spec: ItemSpec): string {
  return fill(artifacts.generationTemplate, {
    CUISINE: spec.cuisine,
    DISH: spec.dish,
    ANGLE: spec.angle,
    NUTRIENT_COUNT: spec.nutrientCount,
    INGREDIENT_COUNT: spec.ingredientCount,
    INSTRUCTION_SET_COUNT: spec.instructionSetCount,
    STEP_COUNT: spec.stepCount,
    STEP_CHARS_MIN,
    STEP_CHARS_MAX,
    SUMMARY_CHARS_MIN,
    SUMMARY_CHARS_MAX,
  });
}

/**
 * Corrective retry.
 *
 * The follow-up is not a blind re-roll: it states the measured size and the
 * required delta, and carries CORRECTED COUNTS computed from the byte model.
 * Text budgets are explicitly held fixed, so the correction moves structure.
 */
function buildCorrectivePrompt(
  artifacts: PromptArtifacts,
  spec: ItemSpec,
  measuredBytes: number
): { prompt: string; corrected: ItemSpec } {
  const band = GENERATION_TARGET_BANDS[spec.tier];
  const target = bandAim(spec.tier);
  const deltaBytes = target - measuredBytes;

  // Move step count first: it is the purest structural lever and keeps text
  // budgets untouched.
  let stepCount = Math.max(
    spec.instructionSetCount * 2,
    spec.stepCount + Math.round(deltaBytes / BYTES.perStep)
  );
  let ingredientCount = spec.ingredientCount;

  // If steps alone would demand an implausible list, take part of the delta on
  // the ingredient axis instead — still structure, not prose.
  const MAX_REASONABLE_STEPS = 160;
  if (stepCount > MAX_REASONABLE_STEPS) {
    const overflowBytes = (stepCount - MAX_REASONABLE_STEPS) * BYTES.perStep;
    stepCount = MAX_REASONABLE_STEPS;
    ingredientCount = Math.min(120, ingredientCount + Math.round(overflowBytes / BYTES.perIngredient));
  }

  const corrected: ItemSpec = { ...spec, stepCount, ingredientCount };

  const diagnosis =
    deltaBytes > 0
      ? `The document was ${Math.abs(deltaBytes)} bytes too SMALL. Add structural elements: ` +
        `raise the step count from ${spec.stepCount} to ${stepCount}` +
        (ingredientCount !== spec.ingredientCount
          ? ` and the ingredient count from ${spec.ingredientCount} to ${ingredientCount}`
          : '') +
        `. Do NOT lengthen individual steps.`
      : `The document was ${Math.abs(deltaBytes)} bytes too LARGE. Remove structural elements: ` +
        `reduce the step count from ${spec.stepCount} to ${stepCount}. ` +
        `Do NOT shorten individual steps below the stated range.`;

  const prompt = fill(artifacts.correctiveTemplate, {
    MEASURED_BYTES: measuredBytes,
    TARGET_MIN_BYTES: band.minBytes,
    TARGET_MAX_BYTES: band.maxBytes,
    DIAGNOSIS: diagnosis,
    NUTRIENT_COUNT: corrected.nutrientCount,
    INGREDIENT_COUNT: corrected.ingredientCount,
    INSTRUCTION_SET_COUNT: corrected.instructionSetCount,
    STEP_COUNT: corrected.stepCount,
  });

  return { prompt, corrected };
}

// ─── Plan construction ────────────────────────────────────────────────────────

function buildPlan(counts: Record<ComplexityTier, number>): ItemSpec[] {
  const specs: ItemSpec[] = [];
  let globalIndex = 0;

  for (const tier of COMPLEXITY_TIERS) {
    const plan = TIER_PLANS[tier];
    for (let i = 0; i < counts[tier]; i++) {
      const sets = plan.setCycle[i % plan.setCycle.length];
      specs.push({
        recipeId: GENERATED_ID_BASE[tier] + i,
        tier,
        // Distinct (cuisine, dish) pair per item across the whole run.
        cuisine: CUISINES[globalIndex % CUISINES.length],
        dish: DISHES[Math.floor(globalIndex / CUISINES.length) % DISHES.length],
        angle: ANGLES[globalIndex % ANGLES.length],
        nutrientCount: plan.nutrientCount,
        ingredientCount: plan.ingredientCount,
        instructionSetCount: sets,
        stepCount: plannedStepCount(tier, sets),
      });
      globalIndex++;
    }
  }
  return specs;
}

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

  const specs = buildPlan(counts);

  // ── --dry-run: zero requests ────────────────────────────────────────────────
  if (argv.includes('--dry-run')) {
    console.log('\nGENERATION PLAN (no requests made)\n');
    console.log(`  items          : ${specs.length}  (low=${counts.low} medium=${counts.medium} high=${counts.high})`);
    console.log(`  pacing         : >=${MIN_INTERVAL_MS} ms between starts => ${(60000 / MIN_INTERVAL_MS).toFixed(1)} RPM`);
    console.log(`  min wall time  : ${((specs.length * MIN_INTERVAL_MS) / 60000).toFixed(1)} min at 1 attempt/item`);
    console.log(`  max requests   : ${specs.length * MAX_ATTEMPTS} at the ${MAX_ATTEMPTS}-attempt cap`);
    console.log(`  temperature    : ${TEMPERATURE}`);
    console.log(`  duplicate rule : ${NEAR_DUPLICATE_CRITERION.measure} >= ${NEAR_DUPLICATE_CRITERION.threshold}`);
    console.log('\n  per-tier structural plan (text budgets identical across tiers):');
    for (const tier of COMPLEXITY_TIERS) {
      const inTier = specs.filter((s) => s.tier === tier);
      if (inTier.length === 0) continue;
      const band = GENERATION_TARGET_BANDS[tier];
      const setCounts = [...new Set(inTier.map((s) => s.instructionSetCount))].sort();
      console.log(
        `    ${tier.padEnd(6)} band ${band.minBytes}-${band.maxBytes} B  ` +
          `nutrients ${TIER_PLANS[tier].nutrientCount}  ingredients ${TIER_PLANS[tier].ingredientCount}  ` +
          `steps ${Math.min(...inTier.map((s) => s.stepCount))}-${Math.max(...inTier.map((s) => s.stepCount))}  ` +
          `sets ${setCounts.join('/')}  ` +
          `multi-set ${inTier.filter((s) => s.instructionSetCount > 1).length}/${inTier.length}`
      );
    }
    console.log(`\n  step text budget : ${STEP_CHARS_MIN}-${STEP_CHARS_MAX} chars — CONSTANT across all tiers`);
    console.log('  (size varies by element COUNT, not element LENGTH)\n');
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
    // The high tier needs the largest single response; state the requirement.
    const highBytes = GENERATION_TARGET_BANDS.high.aimBytes;
    console.log(
      `\n  The high tier must emit up to ~${highBytes} bytes of JSON in ONE response,\n` +
        `  which is roughly ${Math.ceil(highBytes / 3.2)} output tokens. A model whose output limit\n` +
        `  is below that cannot produce the high tier without truncation.\n`
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

  // Output budget: enough for the largest band, capped by what the model allows.
  const neededTokens = Math.ceil(GENERATION_TARGET_BANDS.high.maxBytes / 3.2);
  const maxOutputTokens = Math.min(neededTokens + 2048, model.outputTokenLimit ?? neededTokens + 2048);
  if (model.outputTokenLimit !== null && model.outputTokenLimit < neededTokens) {
    console.warn(
      `\n[gen] WARNING: ${modelId} caps output at ${model.outputTokenLimit} tokens, but the high tier\n` +
        `      may need ~${neededTokens}. High-tier items risk truncation (recorded as\n` +
        `      'blocked-or-truncated' rejections). Consider a model with a larger output limit.\n`
    );
  }

  console.log(`\n${'='.repeat(78)}`);
  console.log('GENERATIVE DATASET RUN');
  console.log('='.repeat(78));
  console.log(`model            : ${model.id}  (${model.displayName ?? 'no display name'}, version ${model.version ?? '?'})`);
  console.log(`token limits     : input ${model.inputTokenLimit ?? '?'}, output ${model.outputTokenLimit ?? '?'}`);
  console.log(`maxOutputTokens  : ${maxOutputTokens}`);
  console.log(`temperature      : ${TEMPERATURE}`);
  console.log(`endpoint         : ${redactUrl(`${API_HOST}/${API_VERSION}/models/${modelId}:generateContent?key=x`)}`);
  console.log(`items            : ${specs.length} (low=${counts.low} medium=${counts.medium} high=${counts.high})`);
  console.log(`pacing           : >=${MIN_INTERVAL_MS} ms between starts, window guard ${WINDOW_MAX_REQUESTS}/60s`);
  console.log(`duplicate rule   : ${NEAR_DUPLICATE_CRITERION.measure} >= ${NEAR_DUPLICATE_CRITERION.threshold}`);
  console.log(`prompt artifacts : ${Object.values(artifacts.hashes).map((h) => h.file).join(', ')}`);
  console.log('');

  fs.mkdirSync(PAYLOAD_DIR, { recursive: true });
  fs.mkdirSync(RAW_DIR, { recursive: true });

  const pacer = new Pacer();
  const startedAt = Date.now();

  const accepted: GeneratedRecipe[] = [];
  const acceptedShingles: { id: number; set: Set<string> }[] = [];
  const acceptedTitles = new Set<string>();
  const allAttempts: (GenerationAttempt & { recipeId: number; tier: ComplexityTier })[] = [];
  const rejections: Record<ComplexityTier, Partial<Record<RejectionReason, number>>> = {
    low: {}, medium: {}, high: {},
  };
  let totalRequests = 0;

  const noteRejection = (tier: ComplexityTier, reason: RejectionReason) => {
    rejections[tier][reason] = (rejections[tier][reason] ?? 0) + 1;
  };

  for (let index = 0; index < specs.length; index++) {
    let spec = specs[index];
    let promptKind: 'generation' | 'corrective-retry' = 'generation';
    let prompt = buildGenerationPrompt(artifacts, spec);
    let itemAccepted = false;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !itemAccepted; attempt++) {
      const requestedAt = new Date().toISOString();
      totalRequests++;

      const result = await generateContent(
        apiKey, model.id, artifacts.systemInstruction, prompt,
        artifacts.responseSchema, maxOutputTokens, pacer
      );

      // Persist the VERBATIM API response for EVERY attempt, accepted or not.
      // This is the audit trail between what the model returned and what the
      // validator accepted.
      const rawName = `${spec.recipeId}-attempt${attempt}.json`;
      let rawFile: string | null = null;
      if (result.rawText) {
        fs.writeFileSync(path.join(RAW_DIR, rawName), result.rawText, 'utf8');
        rawFile = `raw/${rawName}`;
      }

      const record = (
        acceptedFlag: boolean,
        reason: RejectionReason | null,
        detail: string | null,
        measuredBytes: number | null,
        maxSimilarity: number | null
      ) => {
        allAttempts.push({
          recipeId: spec.recipeId, tier: spec.tier, attempt, requestedAt, rawFile,
          httpStatus: result.httpStatus, measuredBytes, accepted: acceptedFlag,
          rejectionReason: reason, rejectionDetail: detail, maxSimilarity, promptKind,
          usageMetadata: result.usageMetadata,
        });
        if (!acceptedFlag && reason) noteRejection(spec.tier, reason);
      };

      const label = `[${index + 1}/${specs.length}] ${spec.tier} ${spec.recipeId} a${attempt}`;

      // ── Layer 0: transport ──
      if (result.error !== null || result.output === null) {
        const detail = result.error ?? `no output (finishReason ${result.finishReason})`;
        const reason: RejectionReason =
          result.error !== null && result.httpStatus !== 200 ? 'http-error' : 'blocked-or-truncated';
        record(false, reason, detail, null, null);
        console.warn(`${label} REJECT ${reason}: ${detail}`);
        continue;
      }
      if (result.finishReason && result.finishReason !== 'STOP') {
        record(false, 'blocked-or-truncated', `finishReason ${result.finishReason}`, null, null);
        console.warn(`${label} REJECT blocked-or-truncated: finishReason ${result.finishReason}`);
        continue;
      }

      // ── Layer 1: parse ──
      let parsed: any;
      try {
        parsed = JSON.parse(result.output);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        record(false, 'unparseable-json', detail, null, null);
        console.warn(`${label} REJECT unparseable-json: ${detail}`);
        continue;
      }

      const recipe = toCanonicalShape(parsed, spec.recipeId);
      const measures = measureComplexity(recipe);

      // ── Layer 2: value sanity ──
      const sanity = checkValueSanity(recipe);
      if (sanity) {
        record(false, sanity.reason, sanity.detail, measures.byteLength, null);
        console.warn(`${label} REJECT ${sanity.reason}: ${sanity.detail}`);
        continue;
      }

      // ── Layer 3: structural counts ──
      const structural = checkStructuralCounts(recipe, spec);
      if (structural) {
        record(false, structural.reason, structural.detail, measures.byteLength, null);
        console.warn(`${label} REJECT ${structural.reason}: ${structural.detail}`);
        // A count miss is corrected the same way a size miss is.
        const correction = buildCorrectivePrompt(artifacts, spec, measures.byteLength);
        spec = correction.corrected;
        prompt = correction.prompt;
        promptKind = 'corrective-retry';
        continue;
      }

      // ── Layer 4: tier band ──
      const band = GENERATION_TARGET_BANDS[spec.tier];
      if (measures.byteLength < band.minBytes || measures.byteLength > band.maxBytes) {
        const detail = `${measures.byteLength} B outside ${band.minBytes}-${band.maxBytes} B`;
        record(false, 'tier-band-miss', detail, measures.byteLength, null);
        console.warn(`${label} REJECT tier-band-miss: ${detail}`);
        const correction = buildCorrectivePrompt(artifacts, spec, measures.byteLength);
        spec = correction.corrected;
        prompt = correction.prompt;
        promptKind = 'corrective-retry';
        continue;
      }

      // ── Layer 5: near-duplicate ──
      const identity = normaliseIdentityText(recipe);
      const shingleSet = shingles(identity, NEAR_DUPLICATE_CRITERION.shingleSize);
      let maxSimilarity = 0;
      for (const prior of acceptedShingles) {
        const sim = jaccard(shingleSet, prior.set);
        if (sim > maxSimilarity) maxSimilarity = sim;
      }
      const titleKey = recipe.title.trim().toLowerCase();
      if (acceptedTitles.has(titleKey)) {
        const detail = `duplicate title "${recipe.title}"`;
        record(false, 'near-duplicate', detail, measures.byteLength, maxSimilarity);
        console.warn(`${label} REJECT near-duplicate: ${detail}`);
        continue;
      }
      if (maxSimilarity >= NEAR_DUPLICATE_CRITERION.threshold) {
        const detail = `jaccard ${maxSimilarity.toFixed(3)} >= ${NEAR_DUPLICATE_CRITERION.threshold}`;
        record(false, 'near-duplicate', detail, measures.byteLength, maxSimilarity);
        console.warn(`${label} REJECT near-duplicate: ${detail}`);
        continue;
      }

      // ── Accepted ──
      // Re-classify with the SAME contract function the proxy and app use. The
      // target band is only a generation aim; classifyFromMeasures is the sole
      // authority on the tier actually recorded.
      const actualTier = classifyFromMeasures(measures);
      if (actualTier !== spec.tier) {
        // The bands sit inside the thresholds with margin, so this should be
        // unreachable. If it ever fires, the band constants and the thresholds
        // have drifted apart and that must be fixed, not papered over.
        throw new Error(
          `Band/threshold inconsistency: ${spec.recipeId} aimed at ${spec.tier} but ` +
            `classifyFromMeasures says ${actualTier} (${measures.byteLength} B, depth ${measures.maxDepth}). ` +
            `Reconcile GENERATION_TARGET_BANDS with COMPLEXITY_THRESHOLDS.`
        );
      }

      const payloadName = `${spec.recipeId}.json`;
      fs.writeFileSync(
        path.join(PAYLOAD_DIR, payloadName),
        `${JSON.stringify(recipe, null, 2)}\n`,
        'utf8'
      );

      accepted.push({
        recipeId: spec.recipeId,
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
        attempts: attempt,
        maxSimilarity: Number(maxSimilarity.toFixed(4)),
      });
      acceptedShingles.push({ id: spec.recipeId, set: shingleSet });
      acceptedTitles.add(titleKey);
      record(true, null, null, measures.byteLength, maxSimilarity);
      itemAccepted = true;

      console.log(
        `${label} OK ${measures.byteLength} B, ${totalSteps(recipe)} steps in ` +
          `${recipe.analyzedInstructions.length} set(s), ` +
          `${fmt(meanCharsPerStep(recipe), 0)} chars/step, sim ${maxSimilarity.toFixed(2)} — ${recipe.title}`
      );
    }

    if (!itemAccepted) {
      console.warn(`[${index + 1}/${specs.length}] ${spec.tier} ${spec.recipeId} EXHAUSTED after ${MAX_ATTEMPTS} attempts`);
    }
  }

  const finishedAt = Date.now();

  // ── Manifest ────────────────────────────────────────────────────────────────
  const manifest: GenerationManifest = {
    generatedAt: new Date().toISOString(),
    source: 'generated',
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
    promptArtifacts: artifacts.hashes,
    pacing: {
      minIntervalMs: MIN_INTERVAL_MS,
      slidingWindowRequests: WINDOW_MAX_REQUESTS,
      slidingWindowMs: WINDOW_MS,
      observedRequests: totalRequests,
      observedDurationMs: finishedAt - startedAt,
      observedPeakRpm: pacer.observedPeakRpm,
    },
    nearDuplicate: NEAR_DUPLICATE_CRITERION,
    targetBands: GENERATION_TARGET_BANDS,
    thresholds: COMPLEXITY_THRESHOLDS,
    requested: counts,
    accepted: {
      low: accepted.filter((r) => r.tier === 'low').length,
      medium: accepted.filter((r) => r.tier === 'medium').length,
      high: accepted.filter((r) => r.tier === 'high').length,
    },
    rejections,
    totalRequests,
    recipes: accepted,
    attempts: allAttempts,
  };

  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

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
  console.log(`requests made   : ${manifest.totalRequests}`);
  console.log(`wall time       : ${(manifest.pacing.observedDurationMs / 60000).toFixed(1)} min`);
  console.log(`peak RPM        : ${manifest.pacing.observedPeakRpm} (limit ${WINDOW_MAX_REQUESTS})`);

  console.log('\n-- Accepted per tier --');
  for (const tier of COMPLEXITY_TIERS) {
    const got = manifest.accepted[tier];
    const want = manifest.requested[tier];
    console.log(`  ${tier.padEnd(6)} ${got}/${want}${got < want ? '   << SHORT — not padded' : ''}`);
  }

  console.log('\n-- Rejections by tier and reason --');
  for (const tier of COMPLEXITY_TIERS) {
    const byReason = manifest.rejections[tier];
    const total = Object.values(byReason).reduce((a, b) => a + (b ?? 0), 0);
    const attemptsInTier = manifest.attempts.filter((a) => a.tier === tier).length;
    const rate = attemptsInTier === 0 ? 0 : (total / attemptsInTier) * 100;
    console.log(`  ${tier.padEnd(6)} ${total}/${attemptsInTier} attempts rejected (${fmt(rate)}%)`);
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
  }

  console.log('\n-- Attempts per accepted item --');
  const attemptCounts = r.map((x) => x.attempts);
  const uniq = [...new Set(attemptCounts)].sort();
  console.log(`  ${uniq.map((a) => `${a} attempt(s) -> ${attemptCounts.filter((x) => x === a).length}`).join(',  ')}`);

  console.log(`\nmanifest : ${MANIFEST_PATH}`);
  console.log(`payloads : ${PAYLOAD_DIR}`);
  console.log(`raw      : ${RAW_DIR}  (every attempt, accepted and rejected)`);

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
