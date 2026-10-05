/**
 * src/api/client.ts
 *
 * The single format-aware, self-measuring fetch path.
 *
 * Production screens and the benchmark runner both call fetchRecipe(). That is
 * the point: the codec exercised by a screen and the codec exercised by a
 * measured run are the same code, so the numbers describe the real data path.
 */

import {
  ROUTES,
  classifyComplexity,
  type ComplexityTier,
  type Recipe,
  type SerializationFormat,
} from '../../shared/contract';
import { getSettings } from '../settings/settings';
import { resolveBaseUrl } from './baseUrl';
import { getCodec } from './codecs/types';
import { measureDecode, timeAsync, timeSync } from './measure';
import { recordMetric } from './metrics';

export interface RequestMeta {
  recipeId: string;
  format: SerializationFormat;
  complexityTier: ComplexityTier;
  /** Actual bytes received, from the response body length — not Content-Length. */
  payloadBytes: number;
  /** Transport duration: request issued to body fully read. Fractional ms. */
  networkMs: number;
  /**
   * PRIMARY DEPENDENT VARIABLE. Decode duration only. Fractional ms.
   *
   * Brackets the codec's decode call and nothing else, identically for all
   * three formats. Never merged with, and never substituted by, the
   * materialisation figure below.
   */
  deserializationMs: number;
  /**
   * SECONDARY, REPORTED SEPARATELY. Decode followed by materialisation into a
   * fully-populated plain object, in one bracket. Fractional ms.
   *
   * Only protobuf has a materialisation step: proto3 omits default-valued
   * scalars from the wire, so a decoded Message resolves "" and 0 through the
   * message prototype rather than as own properties. toObject({defaults:true})
   * materialises them. JSON and MessagePack already return fully-populated
   * plain objects and have no equivalent step, so this is `null` for them —
   * their brackets are untouched.
   *
   * Measured with an independent second decode so the primary figure above is
   * in no way affected.
   */
  deserializationWithMaterializationMs: number | null;
  /** Heap bytes attributable to the decode, or null when unavailable. */
  heapDeltaBytes: number | null;
  /** Hermes stat key behind heapDeltaBytes, for citation. null when unavailable. */
  heapStatKey: string | null;
  /** Unix epoch milliseconds at completion. */
  timestamp: number;
}

export interface FetchRecipeResult {
  data: Recipe;
  meta: RequestMeta;
}

/**
 * Every format now requests the same canonical document, so the URL is built
 * uniformly with no special case.
 *
 * The Stage-1 seam that sent 'json' to a different route is gone: the proxy
 * serves one payload shape from ROUTES.recipe(id) and ROUTES.recipe(id, format)
 * alike, which is what makes the three formats comparable.
 */
function buildRecipeUrl(id: string, format: SerializationFormat): string {
  return `${resolveBaseUrl()}${ROUTES.recipe(id, format)}`;
}

/**
 * The format a request uses when the caller does not name one: the app-wide
 * user setting. Screens therefore consume whichever format is selected, which
 * is the point of making it a setting at all.
 */
export function currentFormat(): SerializationFormat {
  return getSettings().format;
}

/**
 * Fetch one recipe in the requested serialization format, measuring the
 * transport and the decode as separate quantities.
 *
 * Fairness rules enforced here:
 *   - The body is always read as an ArrayBuffer. No format may be handed a
 *     pre-parsed object by the HTTP layer, which would let it skip decoding
 *     work the others must perform.
 *   - networkMs covers request issue through body read, identically for all.
 *   - deserializationMs covers the codec's decode call and nothing else.
 *   - Both are produced by the shared instruments in ./measure.
 */
export async function fetchRecipe(
  id: string,
  format: SerializationFormat = currentFormat()
): Promise<FetchRecipeResult> {
  const url = buildRecipeUrl(id, format);
  const codec = getCodec(format);

  // ── Transport ───────────────────────────────────────────────────────────────
  const { result: bytes, elapsedMs: networkMs } = await timeAsync(async () => {
    const response = await fetch(url);
    if (!response.ok) {
      // Mirrors axios' throw-on-non-2xx, which the calling screens rely on.
      throw new Error(`Request failed with status ${response.status} — ${url}`);
    }
    return response.arrayBuffer();
  });

  // ── Decode (primary measurement — brackets unchanged) ───────────────────────
  const measurement = measureDecode(() => codec.decode(bytes));
  const data = measurement.result as Recipe;

  // ── Decode + materialisation (secondary, protobuf only) ─────────────────────
  //
  // Deliberately a SEPARATE, independent decode. Reusing the object above would
  // measure materialisation alone; the brief asks for "decode followed by
  // toObject" as one interval. Running it after the primary measurement means
  // the primary figure and its heap delta are untouched.
  //
  // Costs a second decode, so it only runs for a codec that actually has a
  // materialisation step — today that is protobuf alone.
  let deserializationWithMaterializationMs: number | null = null;
  const materialize = codec.toPlainObject;
  if (materialize) {
    deserializationWithMaterializationMs = timeSync(() =>
      materialize.call(codec, codec.decode(bytes))
    ).elapsedMs;
  }

  const meta: RequestMeta = {
    recipeId: id,
    format,
    complexityTier: classifyComplexity(data),
    payloadBytes: bytes.byteLength,
    networkMs,
    deserializationMs: measurement.deserializationMs,
    deserializationWithMaterializationMs,
    heapDeltaBytes: measurement.heapDeltaBytes,
    heapStatKey: measurement.heapStatKey,
    timestamp: Date.now(),
  };

  // Reporting only, after every measurement is complete. Recording here rather
  // than in each screen means no caller can forget; it reads the finished
  // numbers and cannot influence them.
  recordMetric({
    kind: 'recipe',
    label: `#${id}`,
    format,
    payloadBytes: meta.payloadBytes,
    networkMs: meta.networkMs,
    deserializationMs: meta.deserializationMs,
    heapDeltaBytes: meta.heapDeltaBytes,
    tier: meta.complexityTier,
    timestamp: meta.timestamp,
  });

  return { data, meta };
}

// ─── Search ───────────────────────────────────────────────────────────────────

/** One row of Spoonacular's complexSearch response, as the proxy forwards it. */
export interface SearchResultItem {
  id: number;
  title: string;
  image?: string;
  imageType?: string;
}

export interface SearchResponse {
  results: SearchResultItem[];
  offset?: number;
  number?: number;
  totalResults?: number;
}

export interface SearchRecipesResult {
  data: SearchResponse;
  meta: SearchMeta;
}

export interface SearchMeta {
  query: string;
  /** The format actually used on the wire. */
  format: SerializationFormat;
  /**
   * Set when the app-wide format could not be honoured and another was used.
   *
   * Only ever 'protobuf': the search response has no compiled message type,
   * because shared/proto/recipe.proto describes recipe documents and is frozen
   * during data collection. Surfaced so the metrics panel can label the reading
   * honestly instead of attributing JSON numbers to protobuf.
   */
  formatFallbackFrom: SerializationFormat | null;
  payloadBytes: number;
  networkMs: number;
  deserializationMs: number;
  heapDeltaBytes: number | null;
  heapStatKey: string | null;
  timestamp: number;
}

/** Formats the search endpoint can actually serve. */
const SEARCH_FORMATS: readonly SerializationFormat[] = ['json', 'msgpack'];

function resolveSearchFormat(requested: SerializationFormat): {
  format: SerializationFormat;
  fallbackFrom: SerializationFormat | null;
} {
  return SEARCH_FORMATS.includes(requested)
    ? { format: requested, fallbackFrom: null }
    : { format: 'json', fallbackFrom: requested };
}

/**
 * Search, measured with the same instruments as a recipe fetch.
 *
 * Structurally identical to fetchRecipe: body read as an ArrayBuffer so no
 * format is handed a pre-parsed object, network and decode timed separately,
 * decode bracketed by the shared measureDecode(). Screens no longer call axios,
 * so every request the app makes now goes through one measured path.
 */
export async function searchRecipes(
  params: Record<string, string | number>,
  requestedFormat: SerializationFormat = currentFormat()
): Promise<SearchRecipesResult> {
  const { format, fallbackFrom } = resolveSearchFormat(requestedFormat);

  const query = new URLSearchParams(
    Object.entries(params).map(([key, value]) => [key, String(value)])
  );
  query.set('format', format);
  const url = `${resolveBaseUrl()}${ROUTES.search()}?${query.toString()}`;

  const { result: bytes, elapsedMs: networkMs } = await timeAsync(async () => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status} — ${url}`);
    }
    return response.arrayBuffer();
  });

  const measurement = measureDecode(() => getCodec(format).decode(bytes));
  const data = measurement.result as SearchResponse;

  const meta: SearchMeta = {
    query: String(params.query ?? params.includeIngredients ?? ''),
    format,
    formatFallbackFrom: fallbackFrom,
    payloadBytes: bytes.byteLength,
    networkMs,
    deserializationMs: measurement.deserializationMs,
    heapDeltaBytes: measurement.heapDeltaBytes,
    heapStatKey: measurement.heapStatKey,
    timestamp: Date.now(),
  };

  recordMetric({
    kind: 'search',
    label: meta.query,
    format,
    payloadBytes: meta.payloadBytes,
    networkMs: meta.networkMs,
    deserializationMs: meta.deserializationMs,
    heapDeltaBytes: meta.heapDeltaBytes,
    tier: null,
    timestamp: meta.timestamp,
  });

  return { data, meta };
}
