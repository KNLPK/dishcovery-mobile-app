/**
 * shared/contract.ts
 *
 * SINGLE SOURCE OF TRUTH for the wire contract between the Dishcovery mobile
 * app and dishcovery-proxy. Both sides import this file; neither side may
 * restate any value defined here.
 *
 * Consumed by:
 *   - the app    : `import { ... } from '../shared/contract'`  (Metro + TypeScript)
 *   - the proxy  : `require('../shared/contract.ts')`          (Node >=22.6 type stripping)
 *
 * CONSTRAINTS ON THIS FILE — do not violate without re-testing the proxy:
 *   1. It must import nothing. Node's type stripping does not resolve
 *      TypeScript path aliases or extensionless specifiers.
 *   2. It must use erasable syntax only — no `enum`, no `namespace`, no
 *      parameter properties. Node strips types; it does not transform syntax.
 */

// ─── Serialization format ─────────────────────────────────────────────────────
//
// Canonical spellings. 'protobuf' is the only accepted spelling — the earlier
// 'proto' alias has been removed from the repository. No aliases are permitted.

export type SerializationFormat = 'json' | 'msgpack' | 'protobuf';

export const SERIALIZATION_FORMATS = [
  'json',
  'msgpack',
  'protobuf',
] as const satisfies readonly SerializationFormat[];

export function isSerializationFormat(value: unknown): value is SerializationFormat {
  return (
    typeof value === 'string' &&
    (SERIALIZATION_FORMATS as readonly string[]).includes(value)
  );
}

/** Response Content-Type per format. The proxy sets these; the client asserts them. */
export const CONTENT_TYPES: Record<SerializationFormat, string> = {
  json: 'application/json',
  msgpack: 'application/x-msgpack',
  protobuf: 'application/x-protobuf',
};

// ─── Payload structural complexity ────────────────────────────────────────────
//
// Independent variable #2 of the study: three levels, assigned from two raw
// measures of the canonical JSON representation — total character count and
// maximum nested object depth.

export type ComplexityTier = 'low' | 'medium' | 'high';

export const COMPLEXITY_TIERS = ['low', 'medium', 'high'] as const satisfies readonly ComplexityTier[];

/**
 * Tier boundaries. Exported separately so the paper can cite exact numbers and
 * so tuning happens in exactly one place.
 *
 * Character-count boundaries reproduce the thresholds the proxy used before
 * this refactor (8 KB / 20 KB), so tier assignments remain continuous with any
 * observations already recorded.
 *
 * Depth boundaries are new. See classifyComplexity for how the two combine.
 */
export const COMPLEXITY_THRESHOLDS = {
  /**
   * Size boundaries, in UTF-8 BYTES.
   *
   * Stage 3 switched the size axis from UTF-16 character count to UTF-8 byte
   * length so that tier assignment and the payloadSize dependent variable use
   * the same unit. Previously a payload could be tiered on 5528 "chars" while
   * its measured size was 5533 bytes — the gap being multibyte characters in
   * recipe titles and summaries.
   *
   * VALUES ARE UNCHANGED from the character-count thresholds and are NOT yet
   * retuned; the real byte-length distribution decides that.
   */
  /** byteLength < this  → low */
  lowMaxBytes: 8 * 1024, // 8192
  /** byteLength <= this → medium; above → high */
  mediumMaxBytes: 20 * 1024, // 20480

  /**
   * Depth boundaries.
   *
   * Measured on real Spoonacular recipes, the canonical benchmark payload
   * nests to depth 4 (recipe -> nutrition -> nutrients[] -> nutrient -> scalar)
   * and the camelCase application document to depth 5 (the extra level being
   * analyzedInstructions[] -> instruction -> steps[]).
   *
   * Both describe the SAME recipe, so the depth axis must not separate them —
   * a boundary at 4 or 5 would assign one recipe two different tiers depending
   * on which document was fetched. The low boundary therefore sits at 6, above
   * the domain's normal range, leaving character count as the discriminator for
   * ordinary payloads and reserving the depth axis for genuinely anomalous
   * nesting.
   */
  /** maxDepth <= this  → low */
  lowMaxDepth: 6,
  /** maxDepth <= this  → medium; above → high */
  mediumMaxDepth: 8,
} as const;

export interface ComplexityMeasures {
  /**
   * UTF-8 byte length of JSON.stringify(payload). THE SIZE AXIS for tiering.
   * Same unit as the payloadBytes dependent variable.
   */
  byteLength: number;
  /**
   * UTF-16 code-unit count of the same string. Retained as a raw measure so the
   * paper can report both and quantify the multibyte gap; NOT used for tiering.
   */
  charCount: number;
  /** Deepest nesting level of objects/arrays. A flat object of scalars measures 1. */
  maxDepth: number;
}

/**
 * UTF-8 byte length of a string.
 *
 * Uses TextEncoder where available (Node, and React Native via Expo's winter
 * runtime) and falls back to an exact arithmetic count otherwise, so this file
 * keeps its "imports nothing" constraint and works in both runtimes.
 */
export function utf8ByteLength(value: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value).length;
  }
  let bytes = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // High surrogate: a surrogate pair encodes to 4 UTF-8 bytes.
      bytes += 4;
      i++;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

/**
 * The two raw measures behind the tier, exposed so tier boundaries can be
 * reported and justified in the paper rather than asserted.
 *
 * Depth convention: the payload itself sits at depth 0, so its scalar fields
 * are at depth 1. A typical recipe payload (recipe → nutrition → nutrients[] →
 * nutrient object → scalar) measures maxDepth 4.
 */
export function measureComplexity(payload: unknown): ComplexityMeasures {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(payload);
  } catch {
    // Circular or otherwise non-serializable.
    serialized = undefined;
  }

  // `seen` stops a circular reference from recursing forever. A payload
  // decoded from JSON cannot contain cycles, but this function accepts
  // `unknown` and must stay total for any input.
  //
  // Caveat: this also stops re-descent into a repeated (non-cyclic) reference,
  // which would under-report depth for a DAG-shaped object. JSON.parse always
  // produces a tree with no shared references, so measurements taken on decoded
  // payloads — the only inputs used by the study — are exact.
  const seen = new WeakSet<object>();

  const walk = (value: unknown, depth: number): number => {
    if (value === null || typeof value !== 'object') return depth;

    const asObject = value as object;
    if (seen.has(asObject)) return depth;
    seen.add(asObject);

    let deepest = depth;
    for (const key of Object.keys(value as Record<string, unknown>)) {
      const branch = walk((value as Record<string, unknown>)[key], depth + 1);
      if (branch > deepest) deepest = branch;
    }
    return deepest;
  };

  return {
    byteLength: serialized === undefined ? 0 : utf8ByteLength(serialized),
    charCount: serialized === undefined ? 0 : serialized.length,
    maxDepth: walk(payload, 0),
  };
}

/**
 * Assign a complexity tier.
 *
 * Rule: evaluate the character-count axis and the depth axis independently,
 * then take the HIGHER of the two. A payload that is short but deeply nested is
 * structurally complex even though its byte count is small, and vice versa.
 */
export function classifyComplexity(payload: unknown): ComplexityTier {
  return classifyFromMeasures(measureComplexity(payload));
}

/** classifyComplexity for callers that already hold the raw measures. */
export function classifyFromMeasures(measures: ComplexityMeasures): ComplexityTier {
  // Size axis: UTF-8 bytes, matching the payloadBytes dependent variable.
  const bySize: ComplexityTier =
    measures.byteLength < COMPLEXITY_THRESHOLDS.lowMaxBytes
      ? 'low'
      : measures.byteLength <= COMPLEXITY_THRESHOLDS.mediumMaxBytes
        ? 'medium'
        : 'high';

  const byDepth: ComplexityTier =
    measures.maxDepth <= COMPLEXITY_THRESHOLDS.lowMaxDepth
      ? 'low'
      : measures.maxDepth <= COMPLEXITY_THRESHOLDS.mediumMaxDepth
        ? 'medium'
        : 'high';

  const rank: Record<ComplexityTier, number> = { low: 0, medium: 1, high: 2 };
  return rank[bySize] >= rank[byDepth] ? bySize : byDepth;
}

// ─── Routes ───────────────────────────────────────────────────────────────────
//
// Path builders, so the client can never request a path the server does not
// register. Call with ':id' to produce an Express route pattern.

export const ROUTES = {
  /**
   * Recipe detail.
   *   recipe('716429')            → /api/recipes/716429
   *   recipe('716429', 'msgpack') → /api/recipes/716429?format=msgpack
   *   recipe(':id')               → /api/recipes/:id        (Express pattern)
   *
   * Omitting `format` requests the camelCase application document.
   * Supplying `format` requests the canonical benchmark payload in that format.
   */
  recipe: (id: string | number, format?: SerializationFormat): string =>
    format === undefined
      ? `/api/recipes/${id}`
      : `/api/recipes/${id}?format=${format}`,

  /** Pre-classified benchmark dataset. */
  dataset: (): string => '/api/benchmark/dataset',

  /** Liveness probe. */
  health: (): string => '/health',

  /** Recipe search (existing production endpoint). */
  search: (): string => '/api/search',
} as const;

/** Query-string key carrying the serialization format. */
export const FORMAT_QUERY_PARAM = 'format';

// ─── Methodology control variables ────────────────────────────────────────────

/**
 * CONTROL VARIABLES from the study methodology. These are fixed across every
 * format and every tier; changing one invalidates comparison against previously
 * collected samples.
 *
 * warmupIterations   — discarded cycles run before measurement begins, so that
 *                      JIT/interpreter warm-up and first-touch allocation are
 *                      not attributed to the format under test.
 * measuredIterations — recorded samples per (format x tier) cell. 30 is the
 *                      conventional minimum for reporting an arithmetic mean
 *                      with a sample standard deviation (n-1 denominator).
 */
export const BENCHMARK_CONFIG = {
  warmupIterations: 3,
  measuredIterations: 30,
} as const;

// ─── Response shapes ──────────────────────────────────────────────────────────

/** A nutrient as served on the application document (camelCase). */
export interface RecipeNutrient {
  name: string;
  amount: number;
  unit: string;
  percentOfDailyNeeds: number;
}

export interface RecipeIngredient {
  id: number;
  amount: number;
  unit: string;
  name: string;
}

export interface RecipeInstructionStep {
  number: number;
  step: string;
}

export interface RecipeAnalyzedInstruction {
  name?: string;
  steps: RecipeInstructionStep[];
}

/**
 * THE canonical payload. One shape, used by every route and every format.
 *
 * Stage 2 removed the two-document split. Previously the proxy served a
 * camelCase application document from ROUTES.recipe(id) and a lossy snake_case
 * payload from ROUTES.recipe(id, format). Both now serve this single shape, so:
 *
 *   - the app renders exactly what the benchmark measures
 *   - JSON, MessagePack and protobuf all reconstruct an identical object
 *   - no codec performs key renaming inside the measured decode window
 *
 * Field names match shared/proto/recipe.proto exactly. The application document
 * is authoritative: the protobuf schema was adapted to carry this shape without
 * loss, never the reverse.
 */
export interface Recipe {
  id: number;
  title: string;
  image: string;
  readyInMinutes: number;
  servings: number;
  summary: string;
  nutrition: { nutrients: RecipeNutrient[] };
  extendedIngredients: RecipeIngredient[];
  /**
   * Every instruction set, each with its own name and step list.
   *
   * This is the field the pre-Stage-2 schema destroyed: it kept only
   * analyzedInstructions[0].steps, flattened to a bare `steps` array, dropping
   * every later instruction set and the `name` of each set.
   */
  analyzedInstructions: RecipeAnalyzedInstruction[];
}

/**
 * Retained as an alias so older references keep compiling.
 *
 * It is now IDENTICAL to `Recipe` — not a renaming, not a mapping, the same
 * type. There is no canonical-vs-application distinction any more. Prefer
 * `Recipe` in new code.
 */
export type RecipeCanonicalPayload = Recipe;

/** One entry of the benchmark dataset, tier-classified by the proxy. */
export interface DatasetEntry {
  recipeId: number;
  tier: ComplexityTier;
  /**
   * Provenance of this payload. Recorded on every entry so that any analysis can
   * separate, or deliberately pool, the API-sourced and generated strata. Never
   * inferred at read time.
   */
  source: RecipeSource;
  /** UTF-8 bytes — the tiering axis. */
  byteLength: number;
  /** UTF-16 code units — raw measure, retained for reporting. */
  charCount: number;
  maxDepth: number;
}

/**
 * One verified recipe in the harvested ID manifest
 * (fixtures/benchmark-recipe-ids.json, produced by scripts/harvest-recipe-ids.ts).
 *
 * Every entry has been confirmed to resolve on /recipes/{id}/information.
 */
export interface HarvestedRecipe {
  recipeId: number;
  title: string;
  byteLength: number;
  charCount: number;
  maxDepth: number;
  nutrientCount: number;
  ingredientCount: number;
  stepCount: number;
  instructionSetCount: number;

  // ── Snapshot provenance ──
  /** ISO 8601 instant the upstream response was captured. */
  capturedAt: string;
  httpStatus: number;
  /** Path, relative to fixtures/, of the verbatim upstream body. */
  rawFile: string;
  /** Size of that raw body in UTF-8 bytes. */
  rawBytes: number;
  /** The request URL with the API key redacted. */
  requestUrl: string;
  /** Provenance-bearing response headers actually present on the response. */
  responseHeaders: Record<string, string>;
}

/**
 * The committed harvest manifest the proxy reads at startup.
 *
 * Together with fixtures/recipes-raw/ it forms a self-contained, citable
 * snapshot: the proxy serves from it at zero quota cost, and the canonical
 * shape can be rebuilt from the raw bodies if it ever changes.
 */
export interface HarvestManifest {
  generatedAt: string;
  /** Search queries used, so the harvest is reproducible. */
  queries: string[];
  candidatesSeen: number;
  verified: number;
  failed: number;
  /**
   * Upstream provenance for the methodology section.
   *
   * Spoonacular publishes no explicit API-version header, so `apiVersionNote`
   * states that plainly rather than inventing a version string; the headers
   * that WERE present are recorded per recipe and summarised here.
   */
  provenance: {
    host: string;
    endpoint: string;
    /** Query parameters used, with the API key redacted. */
    params: Record<string, string>;
    apiVersionNote: string;
    /** Distinct provenance headers observed across the capture. */
    observedHeaders: string[];
    captureStartedAt: string;
    captureFinishedAt: string;
  };
  recipes: HarvestedRecipe[];
}

/** GET ROUTES.dataset() */
export interface DatasetResponse {
  total: number;
  thresholds: typeof COMPLEXITY_THRESHOLDS;
  /** Every successfully fetched recipe with its raw measures and assigned tier. */
  entries: DatasetEntry[];
  /** Recipe ids grouped by tier, for convenient sampling. */
  tiers: Record<ComplexityTier, number[]>;
  /**
   * Tier distribution broken down by provenance.
   *
   * `low` is the only cell both strata occupy. That overlap is the provenance
   * control: agreement between API-sourced and generated payloads at `low` is
   * what licenses attributing medium/high differences to complexity rather than
   * to where the payload came from.
   *
   * Absent when no generated manifest has been produced yet.
   */
  bySource?: Record<RecipeSource, Record<ComplexityTier, number>>;
}

/** Error body returned for an unusable `format` query parameter. */
export interface FormatErrorResponse {
  error: string;
  allowed: readonly SerializationFormat[];
}

// ─── Generative stratum ───────────────────────────────────────────────────────
//
// Real Spoonacular data occupies only the `low` tier (100 of 100 harvested
// recipes). The `medium` and `high` levels of the complexity independent
// variable therefore cannot be populated from the API at all, and are filled by
// model-generated payloads instead.
//
// The generative stratum ALSO fills the `low` tier. That overlap is deliberate
// and is the study's provenance control: `low` is the only cell where both
// sources coexist, so equivalence between API-sourced and generated payloads at
// `low` is what licenses attributing differences at `medium` and `high` to
// complexity rather than to provenance. Generated `low` payloads are therefore
// anchored on the observed structure of the harvested set, not merely on
// whatever happened to come out small.
//
// NOTHING here is ever presented as API data. Generated payloads live under
// fixtures/generated/, carry IDs from a reserved namespace, and are labelled
// with `source: 'generated'` everywhere they appear.

/** Provenance of a benchmark payload. Always recorded; never inferred. */
export type RecipeSource = 'spoonacular' | 'generated';

export const RECIPE_SOURCES = ['spoonacular', 'generated'] as const satisfies readonly RecipeSource[];

/**
 * Reserved ID namespace for generated payloads, one block per tier.
 *
 * Spoonacular recipe IDs observed in the harvest are 5-6 digits (all below
 * 1,000,000). Starting at 9,000,001 leaves an unmistakable gap, so a generated
 * ID can never collide with — or be mistaken for — a real one. All values stay
 * well inside protobuf int32.
 */
export const GENERATED_ID_BASE: Record<ComplexityTier, number> = {
  low: 9000001,
  medium: 9001001,
  high: 9002001,
};

/** True for any ID in the reserved generated namespace. */
export function isGeneratedRecipeId(id: number): boolean {
  return id >= 9000001;
}

/**
 * Target byte bands for generation, per tier.
 *
 * These sit INSIDE the COMPLEXITY_THRESHOLDS boundaries with deliberate margin,
 * so an accepted payload cannot drift across a tier boundary. They do not
 * redefine the tiers — classifyFromMeasures remains the sole authority on which
 * tier a payload belongs to, and every generated payload is re-classified by it
 * after acceptance.
 *
 * The low band is centred on the harvested Spoonacular distribution
 * (min 3754, median 5273, max 7108 bytes) so the two sources are comparable in
 * the cell where they overlap.
 */
export const GENERATION_TARGET_BANDS: Record<
  ComplexityTier,
  { minBytes: number; maxBytes: number; aimBytes: number }
> = {
  /**
   * aimBytes 5300 is the harvested Spoonacular MEDIAN (5273 B), matched
   * deliberately: the generated low tier is the provenance control and has to be
   * comparable to the real set, not merely small.
   */
  low: { minBytes: 4000, maxBytes: 7500, aimBytes: 5300 },
  medium: { minBytes: 9000, maxBytes: 19000, aimBytes: 12500 },
  /**
   * aimBytes sits just above the 20480-byte high boundary on purpose. At the
   * text density measured on real recipes (115 chars per step), byte length is
   * an expensive thing to buy: every extra 1000 bytes costs roughly 9 further
   * instruction steps. Aiming deeper into the band would demand step counts no
   * recipe document plausibly carries, so the aim stays close to the floor and
   * the growth is spread across the ingredient list as well as the steps.
   */
  high: { minBytes: 22000, maxBytes: 40000, aimBytes: 23000 },
};

/**
 * Near-duplicate rejection criterion.
 *
 * Stated explicitly so it can be written into the methodology as a defined
 * measure rather than a judgement call.
 *
 * Method: Jaccard similarity coefficient over the set of word-level 3-gram
 * shingles of a normalised identity string (title + ingredient names + all step
 * text, lowercased, punctuation stripped, whitespace collapsed). A candidate is
 * rejected if its similarity against ANY already-accepted payload — in any tier,
 * not only its own — reaches the threshold, or if its normalised title exactly
 * matches one already accepted.
 */
export const NEAR_DUPLICATE_CRITERION = {
  measure: 'jaccard-word-3gram-shingles',
  shingleSize: 3,
  /** Reject when similarity >= this value. */
  threshold: 0.6,
  identityFields: ['title', 'extendedIngredients[].name', 'analyzedInstructions[].steps[].step'],
} as const;

/** Why a generated attempt was rejected. One layer: the first that failed. */
export type RejectionReason =
  | 'http-error'
  | 'blocked-or-truncated'
  | 'unparseable-json'
  | 'schema-violation'
  | 'value-sanity'
  | 'structural-count'
  | 'tier-band-miss'
  | 'near-duplicate';

/** One model call and its outcome. Every attempt is recorded, including failures. */
export interface GenerationAttempt {
  attempt: number;
  requestedAt: string;
  /** Path, relative to fixtures/generated/, of the verbatim API response body. */
  rawFile: string | null;
  httpStatus: number | null;
  /** UTF-8 byte length of the candidate payload, when one could be measured. */
  measuredBytes: number | null;
  accepted: boolean;
  rejectionReason: RejectionReason | null;
  /** Human-readable detail of the rejection, for the methodology write-up. */
  rejectionDetail: string | null;
  /** Highest Jaccard similarity seen against the accepted set, when computed. */
  maxSimilarity: number | null;
  /** Prompt actually used: the first-attempt template, or the corrective one. */
  promptKind: 'generation' | 'corrective-retry';
  usageMetadata: Record<string, number> | null;
}

/** One ACCEPTED generated payload in the generation manifest. */
export interface GeneratedRecipe {
  recipeId: number;
  tier: ComplexityTier;
  title: string;

  // The same six structural measures recorded for the Spoonacular harvest, so
  // the two strata can be compared field for field.
  byteLength: number;
  charCount: number;
  maxDepth: number;
  nutrientCount: number;
  ingredientCount: number;
  stepCount: number;
  instructionSetCount: number;

  /**
   * Verbosity controls. Reported per tier so it can be shown that the high tier
   * reaches its band through structure (more steps) rather than longer prose.
   */
  meanCharsPerStep: number;
  summaryChars: number;

  /** Path, relative to fixtures/, of the accepted canonical payload. */
  payloadFile: string;
  /** Path, relative to fixtures/, of the verbatim API response that produced it. */
  rawFile: string;
  generatedAt: string;
  attempts: number;
  /** Similarity against the nearest already-accepted payload at acceptance time. */
  maxSimilarity: number;
}

/** fixtures/generated/manifest.json */
export interface GenerationManifest {
  generatedAt: string;
  source: 'generated';
  /** Warning carried in the file itself, so the data can never be mislabelled. */
  disclaimer: string;

  model: {
    /** Model ID exactly as reported by the API, not as requested. */
    id: string;
    displayName: string | null;
    version: string | null;
    inputTokenLimit: number | null;
    outputTokenLimit: number | null;
    endpoint: string;
  };

  generationConfig: {
    temperature: number;
    topP: number | null;
    topK: number | null;
    maxOutputTokens: number;
    responseMimeType: string;
  };

  /** SHA-256 of each prompt artifact, so later edits to them are detectable. */
  promptArtifacts: Record<string, { file: string; sha256: string }>;

  pacing: {
    minIntervalMs: number;
    slidingWindowRequests: number;
    slidingWindowMs: number;
    observedRequests: number;
    observedDurationMs: number;
    observedPeakRpm: number;
  };

  nearDuplicate: typeof NEAR_DUPLICATE_CRITERION;
  targetBands: typeof GENERATION_TARGET_BANDS;
  thresholds: typeof COMPLEXITY_THRESHOLDS;

  requested: Record<ComplexityTier, number>;
  accepted: Record<ComplexityTier, number>;
  /** Rejections by tier and by reason — the rejection-rate table. */
  rejections: Record<ComplexityTier, Partial<Record<RejectionReason, number>>>;
  totalRequests: number;

  recipes: GeneratedRecipe[];
  /** Every attempt, accepted or not, in chronological order. */
  attempts: (GenerationAttempt & { recipeId: number; tier: ComplexityTier })[];
}
