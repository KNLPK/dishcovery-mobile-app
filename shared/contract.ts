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
   * RETUNED once the real distribution was known. The original values (8192 /
   * 20480) were inherited from the pre-Stage-3 character-count thresholds and
   * were never justified against data.
   *
   * The justification for these values is a byte model fitted by ordinary least
   * squares to the 100 harvested recipes:
   *
   *     bytes = 584.4 + 104.1*nutrients + 51.6*ingredients
   *                   + 108.1*steps     + 193.1*instructionSets
   *
   * (mean absolute residual 238 B; predicts 5325 B at the harvested medians
   * against an observed 5273 B, a 1.0% error).
   *
   * At the text density actually observed in recipe data — a median of 115.2
   * characters per instruction step — byte length is expensive to buy: roughly
   * nine additional steps per further kilobyte. Under the old 20480-byte high
   * boundary, a high-tier payload required about 125 instruction steps and 80
   * ingredients. That is not a recipe document, and presenting it as one level
   * of a "payload structural complexity" variable would not survive review.
   *
   * 7500 / 14000 place the boundaries where the structural counts they imply
   * remain recognisable as recipes. See GENERATION_TARGET_BANDS for the counts
   * each tier now implies.
   */
  /** byteLength < this  → low */
  lowMaxBytes: 7500,
  /** byteLength <= this → medium; above → high */
  mediumMaxBytes: 14000,

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
   *
   * maxBytes 6800 leaves 700 B of margin below the 7500 B low/medium boundary.
   */
  low: { minBytes: 4000, maxBytes: 6800, aimBytes: 5300 },
  /**
   * 1000 B of margin at both ends: 8500 sits above the 7500 B boundary, 13000
   * below the 14000 B one.
   */
  medium: { minBytes: 8500, maxBytes: 13000, aimBytes: 10500 },
  /**
   * minBytes 15200 leaves 1200 B of margin above the 14000 B medium/high
   * boundary. maxBytes 24000 is a rejection ceiling, not a target — it also caps
   * the output-token budget a single response has to carry.
   */
  high: { minBytes: 15200, maxBytes: 24000, aimBytes: 16500 },
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

/** Why a generated candidate was rejected. One layer: the first that failed. */
export type RejectionReason =
  | 'schema-violation'
  | 'value-sanity'
  | 'structural-count'
  /** Mean chars/step outside the constant text budget — the verbosity control. */
  | 'text-density'
  | 'tier-band-miss'
  | 'near-duplicate';

/** How a whole batch request ended. Item-level outcomes are in GenerationAttempt. */
export type BatchOutcome =
  | 'ok'
  | 'http-error'
  | 'daily-quota'
  | 'blocked-or-truncated'
  | 'unparseable-json'
  | 'not-an-array';

/**
 * One model request. Payloads are generated in BATCHES — one request returns
 * several documents — because the free tier is limited per REQUEST (20/day),
 * not per payload, while the model's output limit (65,536 tokens) comfortably
 * holds several documents plus its own thinking tokens.
 */
export interface BatchRecord {
  batchId: string;
  tier: ComplexityTier;
  requestedAt: string;
  /** Documents asked for in this request. */
  requestedCount: number;
  /** Documents the model actually returned (0 when the request failed). */
  returnedCount: number;
  acceptedCount: number;
  rejectedCount: number;
  promptKind: 'generation' | 'corrective-retry';
  /** Path, relative to fixtures/generated/, of the verbatim API response body. */
  rawFile: string | null;
  httpStatus: number | null;
  finishReason: string | null;
  /** Includes thoughtsTokenCount when the model reports it. */
  usageMetadata: Record<string, number> | null;
  outcome: BatchOutcome;
  detail: string | null;
  /**
   * The per-document structural request that produced this batch, so the
   * batch can be re-validated from its raw response without the live run's
   * state. Absent on batches recorded before this field existed; those are
   * reconstructed deterministically (they were all first-attempt batches).
   */
  items?: {
    cuisine: string;
    dish: string;
    angle: string;
    nutrientCount: number;
    ingredientCount: number;
    instructionSetCount: number;
    stepCount: number;
  }[];
}

/**
 * The validation rule set and its provenance.
 *
 * Generation and validation are SEPARABLE stages: every raw response is
 * persisted, so the accepted set is a deterministic function of the raw files
 * and these rules. `--revalidate` rebuilds payloads and manifest from raw under
 * the current rules at zero quota cost, which is how a rule change mid-run is
 * applied uniformly to every candidate rather than only to later ones.
 */
export interface ValidationRules {
  /** Rejection ceiling on mean chars/step: prevents reaching a byte band through prose. */
  densityCeilingCharsPerStep: number;
  /** Rejection floor on mean chars/step, and where the number comes from. */
  densityFloorCharsPerStep: number;
  densityFloorBasis: string;
  /** Ceiling on percentOfDailyNeeds, and where the number comes from. */
  percentOfDailyNeedsMax: number;
  percentOfDailyNeedsBasis: string;
  minStepsPerSet: number;
  /** Rules relaxed because they would have rejected real API data. */
  relaxedAgainstReferenceData: string[];
  /** Chronological record of rule changes during the run. */
  history: string[];
  revalidation: {
    at: string;
    note: string;
    /** Candidates that were rejected under the earlier rules and pass under these. */
    recovered: Record<ComplexityTier, Partial<Record<RejectionReason, number>>>;
    /** Candidates accepted before that are rejected now (expected 0). */
    lost: number;
  } | null;
}

/** One candidate document inside a batch and its validation outcome. Every one is recorded. */
export interface GenerationAttempt {
  batchId: string;
  indexInBatch: number;
  tier: ComplexityTier;
  /** Assigned only on acceptance; rejected candidates never receive an ID. */
  recipeId: number | null;
  requestedAt: string;
  /** UTF-8 byte length of the candidate, when one could be measured. */
  measuredBytes: number | null;
  accepted: boolean;
  rejectionReason: RejectionReason | null;
  /** Human-readable detail of the rejection, for the methodology write-up. */
  rejectionDetail: string | null;
  /** Highest Jaccard similarity against every accepted payload, all tiers. */
  maxSimilarity: number | null;
  /** The accepted payload that similarity was measured against. */
  nearestRecipeId: number | null;
  /** True when the nearest accepted payload came from the SAME batch. */
  nearestInSameBatch: boolean | null;
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

  /**
   * False for accepted payloads not drawn into the balanced dataset. When a
   * tier holds more accepted payloads than requested (revalidation can recover
   * many at once), the dataset is a SEEDED RANDOM SAMPLE of `requested[tier]`
   * from them — see GenerationManifest.selection for the seed and the draw.
   * Surplus payloads stay on disk for audit.
   */
  inDataset: boolean;

  // ── Batch provenance ──
  batchId: string;
  /** Documents requested in that batch. */
  batchSize: number;
  indexInBatch: number;

  /** Similarity against the nearest already-accepted payload at acceptance time. */
  maxSimilarity: number;
  nearestRecipeId: number | null;
  nearestInSameBatch: boolean | null;
}

/**
 * One invocation of the generation script.
 *
 * Batching brings a 150-item run to roughly 24 requests, which still exceeds
 * the 20-per-day free-tier quota, so a run can span two sessions. The manifest
 * is checkpointed after every batch; a session ended by quota, a crash, or a
 * kill loses nothing.
 */
export interface GenerationSession {
  startedAt: string;
  finishedAt: string;
  requests: number;
  accepted: number;
  /** Why the session ended: 'complete', 'daily-quota', 'budget-exhausted', or an error message. */
  endedBy: string;
}

/** fixtures/generated/manifest.json */
export interface GenerationManifest {
  generatedAt: string;
  source: 'generated';
  /** False while the run is still short of its requested counts. */
  complete: boolean;
  sessions: GenerationSession[];
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

  /**
   * How batches were sized. `tokensPerItem` is the calibrated output cost of one
   * document per tier; `thinkingReserveTokens` is held back for the model's own
   * reasoning, which is charged against the same output limit.
   */
  batching: {
    batchSize: Record<ComplexityTier, number>;
    tokensPerItem: Record<ComplexityTier, number>;
    thinkingReserveTokens: number;
    /** Highest thoughtsTokenCount observed on any batch, for calibration. */
    observedMaxThinkingTokens: number | null;
  };

  /** SHA-256 of each prompt artifact, so later edits to them are detectable. */
  promptArtifacts: Record<string, { file: string; sha256: string }>;

  validation: ValidationRules;

  /**
   * How the balanced dataset was drawn from the accepted set, per tier.
   *
   * Acceptance order is NOT a defensible selection rule: after a revalidation
   * many payloads enter at once, so their order reflects when a rule changed,
   * not any property of the payload. Tiers with more accepted payloads than
   * requested are therefore sampled with a seeded PRNG (mulberry32 over the
   * recipeIds in ascending order, Fisher–Yates, first N), and the draw itself
   * is recorded so it is reproducible without re-running anything.
   */
  selection: {
    method: string;
    seed: number;
    perTier: Record<
      ComplexityTier,
      { accepted: number; requested: number; sampled: boolean; selected: number[] }
    >;
  };

  /** Raw responses retained outside fixtures/ that are not part of any procedure. */
  quarantine: { path: string; files: number; reason: string }[];

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
  /** Item-level rejections by tier and by reason — the rejection-rate table. */
  rejections: Record<ComplexityTier, Partial<Record<RejectionReason, number>>>;
  /** Batch-level failures by tier and outcome (requests that yielded no items). */
  batchFailures: Record<ComplexityTier, Partial<Record<BatchOutcome, number>>>;
  totalRequests: number;

  recipes: GeneratedRecipe[];
  /** Every request, in chronological order. */
  batches: BatchRecord[];
  /** Every candidate document, accepted or not, in chronological order. */
  attempts: GenerationAttempt[];
}
