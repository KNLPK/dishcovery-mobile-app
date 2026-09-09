/**
 * dishcovery-proxy / server.js
 *
 * Express proxy for thesis serialization benchmark (JSON vs MessagePack vs Protobuf).
 * The mobile app talks only to this server — never directly to Spoonacular.
 *
 * Benchmark flow:
 *   GET /api/recipes/:id?format=json|msgpack|protobuf
 *     → fetch Spoonacular once (includeNutrition=true)
 *     → map to THE canonical shape (toCanonicalShape)
 *     → serialize to raw bytes with correct Content-Type + Content-Length
 *
 * Normal app usage:
 *   GET /api/search?query=...
 *   GET /api/recipes/:id            (same canonical document, as JSON)
 *   GET /api/benchmark/dataset      (100 recipe IDs grouped by payload complexity)
 *
 * Stage 2: there is now ONE payload shape. Every route and every format serves
 * identical logical content, so a size difference between formats reflects
 * encoding efficiency and nothing else.
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const axios = require('axios');
const { encode: encodeMsgPack } = require('@msgpack/msgpack');
const protobuf = require('protobufjs');

// Shared wire contract — the single source of truth, also imported by the app.
// Requires Node >= 22.6 with --experimental-strip-types (see package.json scripts).
const {
  ROUTES,
  CONTENT_TYPES,
  SERIALIZATION_FORMATS,
  isSerializationFormat,
  measureComplexity,
  classifyFromMeasures,
  COMPLEXITY_THRESHOLDS,
  isGeneratedRecipeId,
} = require('../shared/contract.ts');

const app = express();
const PORT = process.env.PORT || 3001;
const SPOONACULAR_API_KEY = process.env.SPOONACULAR_API_KEY;

// Schema shared with the client generator (npm run proto:generate).
const PROTO_PATH = path.join(__dirname, '..', 'shared', 'proto', 'recipe.proto');

// ── Benchmark recipe IDs ──────────────────────────────────────────────────────
//
// Read from the harvested manifest produced by `npm run harvest:ids`, whose
// every entry has been verified to resolve on /recipes/{id}/information.
//
// This replaces a hand-written array of 100 IDs, 41 of which were fabricated
// and returned 404 on every startup — wasting ~41 API calls per boot and
// capping the real n at 59.
const MANIFEST_PATH = path.join(__dirname, '..', 'fixtures', 'benchmark-recipe-ids.json');

// Verbatim upstream snapshots captured by the harvest, one file per recipe.
//
// QUOTA: the proxy serves from these by DEFAULT, so booting costs ZERO API
// requests. Before this, boot re-fetched every benchmark recipe from
// Spoonacular — roughly 101 points on top of the ~111 the harvest itself
// spends, which together exceed the 150/day free quota.
//
// To force a live re-fetch and bypass the snapshot entirely:
//     DISHCOVERY_LIVE_REFETCH=1 npm start
// That re-spends quota, and is only for deliberately refreshing captured data.
const RAW_DIR = path.join(__dirname, '..', 'fixtures', 'recipes-raw');
const LIVE_REFETCH = process.env.DISHCOVERY_LIVE_REFETCH === '1';

// ── Generative stratum ────────────────────────────────────────────────────────
//
// Model-generated payloads, kept in a SEPARATE directory tree from the
// Spoonacular snapshots and addressed by a reserved ID namespace (9000001+) so
// the two strata can never be confused for one another. Every dataset entry
// carries an explicit `source`, which is recorded, never inferred.
//
// These exist because all 100 harvested Spoonacular recipes classify as `low`
// (max 7108 B against an 8192 B boundary): the API cannot populate the medium
// or high levels of the complexity independent variable at all.
//
// Written by `npm run generate:dataset`. The model is NEVER called at serve
// time — these are frozen, committed snapshots, exactly like recipes-raw/.
const GENERATED_DIR = path.join(__dirname, '..', 'fixtures', 'generated');
const GENERATED_PAYLOAD_DIR = path.join(GENERATED_DIR, 'payloads');
const GENERATED_MANIFEST_PATH = path.join(GENERATED_DIR, 'manifest.json');

function loadGeneratedRecipeIds() {
  try {
    const manifest = JSON.parse(fs.readFileSync(GENERATED_MANIFEST_PATH, 'utf8'));
    const ids = (manifest.recipes || []).map((r) => r.recipeId).filter(Number.isFinite);
    console.log(
      `[dataset] loaded ${ids.length} GENERATED (synthetic) payload IDs from ${GENERATED_MANIFEST_PATH}` +
        (manifest.model?.id ? ` (model ${manifest.model.id}` : '') +
        (manifest.generatedAt ? `, generated ${manifest.generatedAt})` : manifest.model?.id ? ')' : '')
    );
    return ids;
  } catch (err) {
    console.log(
      `[dataset] no generated manifest at ${GENERATED_MANIFEST_PATH} (${err.code || err.message}) — ` +
        'benchmark will cover the Spoonacular stratum only.'
    );
    return [];
  }
}

/**
 * Read a generated payload. Costs nothing and never calls a model.
 *
 * Unlike the Spoonacular snapshots, these files are ALREADY in the canonical
 * shape — they have no upstream API document to be mapped from — so
 * toCanonicalShape is deliberately not applied to them.
 */
function readGeneratedPayload(id) {
  try {
    return JSON.parse(fs.readFileSync(path.join(GENERATED_PAYLOAD_DIR, `${id}.json`), 'utf8'));
  } catch {
    return null;
  }
}

function loadBenchmarkRecipeIds() {
  try {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const ids = (manifest.recipes || []).map((r) => r.recipeId).filter(Number.isFinite);
    console.log(
      `[dataset] loaded ${ids.length} verified recipe IDs from ${MANIFEST_PATH}` +
        (manifest.generatedAt ? ` (harvested ${manifest.generatedAt})` : '')
    );
    return ids;
  } catch (err) {
    console.warn(`[dataset] no harvested manifest at ${MANIFEST_PATH} (${err.code || err.message}).`);
    console.warn('[dataset] run `npm run harvest:ids` to generate it. Starting with an empty dataset.');
    return [];
  }
}

const BENCHMARK_RECIPE_IDS = loadBenchmarkRecipeIds();
const GENERATED_RECIPE_IDS = loadGeneratedRecipeIds();

// Complexity tiering now comes from shared/contract.ts (COMPLEXITY_THRESHOLDS,
// measureComplexity, classifyFromMeasures) so client and server can never
// disagree on a tier assignment.

// In-memory cache: recipeId (string) → { recipe }  (the one canonical shape)
const recipeCache = new Map();

// Benchmark dataset built once at startup.
// entries: full per-recipe measures; tiers: recipe ids grouped by tier.
let benchmarkDataset = { entries: [], tiers: { low: [], medium: [], high: [] } };

// Protobuf type loaded once at startup
let RecipeType;

// ── Startup helpers ───────────────────────────────────────────────────────────

async function loadProto() {
  // Loaded from shared/proto — the same file the client codec is generated from.
  const root = await protobuf.load(PROTO_PATH);
  RecipeType = root.lookupType('Recipe');
  console.log(`[proto] loaded ${PROTO_PATH}`);
}

function assertApiKey() {
  if (!SPOONACULAR_API_KEY || SPOONACULAR_API_KEY === 'placeholder') {
    console.warn('[warn] SPOONACULAR_API_KEY is missing or still set to "placeholder".');
    console.warn('[warn] Set a real key in dishcovery-proxy/.env before fetching recipes.');
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Spoonacular fetch + mapping ─────────────────────────────────────────────────

/**
 * Map a Spoonacular recipe into THE canonical shape — the single document
 * served by every route in every format.
 *
 * Stage 2 replaced the previous toProtoShape/toAppShape pair. toProtoShape was
 * lossy: it kept only analyzedInstructions[0].steps, flattening them into a
 * bare `steps` array and discarding every later instruction set along with each
 * set's `name`. A protobuf payload built from it was therefore smaller than the
 * JSON payload because it carried LESS DATA, not because protobuf encodes more
 * efficiently — which would have invalidated the comparison outright.
 *
 * Every field below is preserved for all three formats. Nothing is truncated.
 */
function toCanonicalShape(data) {
  return {
    id: data.id || 0,
    title: data.title || '',
    image: data.image || '',
    readyInMinutes: data.readyInMinutes || 0,
    servings: data.servings || 0,
    summary: data.summary || '',
    nutrition: {
      nutrients: (data.nutrition?.nutrients || []).map((n) => ({
        name: n.name || '',
        amount: n.amount || 0,
        unit: n.unit || '',
        percentOfDailyNeeds: n.percentOfDailyNeeds || 0,
      })),
    },
    extendedIngredients: (data.extendedIngredients || []).map((i) => ({
      id: i.id || 0,
      amount: i.amount || 0,
      unit: i.unit || '',
      name: i.name || '',
    })),
    // Every instruction set, each keeping its own name and full step list.
    analyzedInstructions: (data.analyzedInstructions || []).map((ai) => ({
      name: ai.name || '',
      steps: (ai.steps || []).map((s) => ({
        number: s.number || 0,
        step: s.step || '',
      })),
    })),
  };
}

async function fetchFromSpoonacular(id) {
  const { data } = await axios.get(
    `https://api.spoonacular.com/recipes/${id}/information`,
    { params: { apiKey: SPOONACULAR_API_KEY, includeNutrition: true } }
  );
  return data;
}

/**
 * Read the verbatim upstream snapshot for a recipe, or null if not captured.
 * Costs no quota.
 */
function readSnapshot(id) {
  try {
    return JSON.parse(fs.readFileSync(path.join(RAW_DIR, `${id}.json`), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Resolve a recipe to the canonical shape.
 *
 * Resolution order: in-memory cache -> captured snapshot -> live Spoonacular.
 *
 * The snapshot is preferred so that benchmark work costs no quota. Recipes
 * outside the captured set (for example one opened from a live search) still
 * fall through to a live fetch, so the app keeps working.
 *
 * `allowLive: false` makes this snapshot-only — used by the startup dataset
 * build to guarantee boot spends nothing.
 */
async function getRecipe(id, { allowLive = true } = {}) {
  const key = String(id);

  if (recipeCache.has(key)) {
    return recipeCache.get(key);
  }

  // Generated payloads resolve from their own directory and never touch
  // Spoonacular, the cache-miss path, or the live fetch.
  if (isGeneratedRecipeId(Number(id))) {
    const generated = readGeneratedPayload(id);
    if (!generated) return null;
    const generatedEntry = { recipe: generated, source: 'generated' };
    recipeCache.set(key, generatedEntry);
    console.log(`[cache] stored GENERATED recipe ${id} (size: ${recipeCache.size})`);
    return generatedEntry;
  }

  let raw = null;
  let source = 'live';

  if (!LIVE_REFETCH) {
    raw = readSnapshot(id);
    if (raw) source = 'snapshot';
  }

  if (!raw) {
    if (!allowLive) {
      return null;
    }
    raw = await fetchFromSpoonacular(id);
  }

  const entry = { recipe: toCanonicalShape(raw), source: 'spoonacular' };
  recipeCache.set(key, entry);
  console.log(`[cache] stored recipe ${id} from ${source} (size: ${recipeCache.size})`);
  return entry;
}

// ── Serialization (benchmark formats) ─────────────────────────────────────────

// Format names and their Content-Types come from the shared contract.
// 'protobuf' is the canonical spelling; the former 'proto' alias is gone.

function serializeRecipe(recipe, format) {
  if (format === 'json') {
    const jsonString = JSON.stringify(recipe);
    return {
      body: Buffer.from(jsonString, 'utf8'),
      contentType: CONTENT_TYPES.json,
    };
  }

  if (format === 'msgpack') {
    const encoded = encodeMsgPack(recipe);
    return {
      body: Buffer.from(encoded),
      contentType: CONTENT_TYPES.msgpack,
    };
  }

  if (format === 'protobuf') {
    const verifyErr = RecipeType.verify(recipe);
    if (verifyErr) {
      throw new Error(`Protobuf verify failed: ${verifyErr}`);
    }
    const message = RecipeType.create(recipe);
    const encoded = RecipeType.encode(message).finish();
    return {
      body: Buffer.from(encoded),
      contentType: CONTENT_TYPES.protobuf,
    };
  }

  throw new Error(`Unsupported format: ${format}`);
}

function sendBytes(res, { body, contentType }) {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', body.length);
  res.send(body);
}

/**
 * Classify every benchmark recipe by payload complexity, once at startup.
 *
 * SNAPSHOT-ONLY: this reads captured upstream bodies from fixtures/recipes-raw
 * and never calls Spoonacular, so booting the proxy costs ZERO quota. A recipe
 * with no snapshot is skipped and reported rather than fetched.
 *
 * Tiering uses measureComplexity + classifyFromMeasures from the shared
 * contract — the identical functions the client uses — so a recipe can never be
 * assigned one tier by the server and another by the app.
 */
async function buildBenchmarkDataset() {
  const entries = [];
  const tiers = { low: [], medium: [], high: [] };
  const missingSnapshots = [];
  // Both strata, each tagged with its provenance. The Spoonacular set is capped
  // at 100 (the harvested n); the generated set is taken whole.
  const uniqueIds = [
    ...[...new Set(BENCHMARK_RECIPE_IDS)].slice(0, 100).map((id) => ({ id, source: 'spoonacular' })),
    ...[...new Set(GENERATED_RECIPE_IDS)].map((id) => ({ id, source: 'generated' })),
  ];

  if (uniqueIds.length === 0) {
    console.log('[benchmark] no recipe IDs to build from — skipping dataset build.');
    benchmarkDataset = { entries, tiers };
    return;
  }

  console.log(
    `[benchmark] building dataset from ${uniqueIds.length} payloads ` +
      `(${uniqueIds.filter((x) => x.source === 'spoonacular').length} Spoonacular, ` +
      `${uniqueIds.filter((x) => x.source === 'generated').length} generated)…`
  );

  for (let i = 0; i < uniqueIds.length; i++) {
    const { id, source } = uniqueIds[i];

    try {
      // Snapshot-only: allowLive false keeps boot at zero API requests.
      const resolved = await getRecipe(id, { allowLive: false });
      if (!resolved) {
        missingSnapshots.push(id);
        continue;
      }
      const { recipe } = resolved;
      const measures = measureComplexity(recipe);
      const tier = classifyFromMeasures(measures);

      entries.push({
        recipeId: id,
        tier,
        source,
        byteLength: measures.byteLength,
        charCount: measures.charCount,
        maxDepth: measures.maxDepth,
      });
      tiers[tier].push(id);

      console.log(
        `[benchmark] ${i + 1}/${uniqueIds.length} recipe ${id} → ${tier} ` +
          `(${source}, ${measures.byteLength} bytes, depth ${measures.maxDepth})`
      );
    } catch (err) {
      console.warn(
        `[benchmark] skipped recipe ${id}: ${err.response?.status || err.message}`
      );
    }

    // No throttle needed: every read above is a local snapshot, not a request.
  }

  benchmarkDataset = { entries, tiers };

  if (missingSnapshots.length > 0) {
    console.warn(
      `[benchmark] ${missingSnapshots.length} recipe(s) have no snapshot and were skipped ` +
        `(no live fetch at boot): ${missingSnapshots.slice(0, 10).join(', ')}` +
        (missingSnapshots.length > 10 ? ', …' : '')
    );
    console.warn('[benchmark] re-run `npm run harvest:ids` to capture them.');
  }

  // Tier distribution BROKEN DOWN BY SOURCE. `low` is the only cell where both
  // strata coexist — that overlap is the study's provenance control.
  const bySource = { spoonacular: {}, generated: {} };
  for (const src of ['spoonacular', 'generated']) {
    for (const tier of ['low', 'medium', 'high']) {
      bySource[src][tier] = entries.filter((e) => e.source === src && e.tier === tier).length;
    }
  }
  benchmarkDataset.bySource = bySource;

  console.log('[benchmark] dataset ready — tier x source:');
  console.log(
    `  ${'source'.padEnd(14)}${'low'.padStart(7)}${'medium'.padStart(8)}${'high'.padStart(7)}${'total'.padStart(8)}`
  );
  for (const src of ['spoonacular', 'generated']) {
    const row = bySource[src];
    console.log(
      `  ${src.padEnd(14)}${String(row.low).padStart(7)}${String(row.medium).padStart(8)}` +
        `${String(row.high).padStart(7)}${String(row.low + row.medium + row.high).padStart(8)}`
    );
  }
  console.log(
    `  ${'TOTAL'.padEnd(14)}${String(tiers.low.length).padStart(7)}` +
      `${String(tiers.medium.length).padStart(8)}${String(tiers.high.length).padStart(7)}` +
      `${String(entries.length).padStart(8)}`
  );
}

// ── Middleware ──────────────────────────────────────────────────────────────────

app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// ── Routes ──────────────────────────────────────────────────────────────────────

app.get(ROUTES.health(), (req, res) => {
  res.json({
    status: 'ok',
    server: 'dishcovery-proxy',
    cacheSize: recipeCache.size,
    benchmarkDataset: {
      low: benchmarkDataset.tiers.low.length,
      medium: benchmarkDataset.tiers.medium.length,
      high: benchmarkDataset.tiers.high.length,
    },
  });
});

/**
 * Normal app usage — search recipes via Spoonacular complexSearch.
 * Forwards client query params (query, includeIngredients, type, maxReadyTime, etc.).
 * Example: GET /api/search?query=pasta
 * Example: GET /api/search?includeIngredients=egg,tomato&type=breakfast&number=5
 */
app.get(ROUTES.search(), async (req, res, next) => {
  try {
    const { query, includeIngredients } = req.query;

    if (!query && !includeIngredients) {
      return res.status(400).json({
        error: 'Missing required query parameter: query or includeIngredients',
      });
    }

    const params = {
      ...req.query,
      apiKey: SPOONACULAR_API_KEY,
      addRecipeInformation: false,
      number: Math.min(Number(req.query.number) || 10, 50),
    };

    const { data } = await axios.get('https://api.spoonacular.com/recipes/complexSearch', {
      params,
    });

    res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * Recipe detail endpoint.
 *
 * Benchmark:  GET /api/recipes/:id?format=json|msgpack|protobuf → raw serialized bytes
 * App usage:  GET /api/recipes/:id                              → camelCase JSON (default)
 */
app.get(ROUTES.recipe(':id'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const format = req.query.format;

    // Validate BEFORE any upstream work. Rejecting a bad format after the
    // Spoonacular call would burn quota on a request that can never succeed,
    // and would mask the 400 behind an upstream failure.
    if (format !== undefined && !isSerializationFormat(format)) {
      return res.status(400).json({
        error: 'Invalid format',
        allowed: SERIALIZATION_FORMATS,
      });
    }

    const { recipe } = await getRecipe(id);

    // No format param → normal app JSON (camelCase)
    if (!format) {
      res.setHeader('Content-Type', CONTENT_TYPES.json);
      return res.json(recipe);
    }

    const serialized = serializeRecipe(recipe, format);
    sendBytes(res, serialized);
  } catch (err) {
    if (err.response?.status === 404) {
      return res.status(404).json({ error: 'Recipe not found', id: req.params.id });
    }
    next(err);
  }
});

/**
 * Pre-classified benchmark dataset — 100 recipe IDs grouped by JSON payload size.
 * Example: GET /api/benchmark/dataset
 */
app.get(ROUTES.dataset(), (req, res) => {
  res.json({
    total: benchmarkDataset.entries.length,
    thresholds: COMPLEXITY_THRESHOLDS,
    entries: benchmarkDataset.entries,
    tiers: benchmarkDataset.tiers,
  });
});

// ── Error handling ──────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.originalUrl });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack || err.message);
  res.status(err.response?.status || 500).json({
    error: 'Internal server error',
    detail: err.message,
  });
});

// ── Startup ─────────────────────────────────────────────────────────────────────

async function main() {
  assertApiKey();
  await loadProto();
  await buildBenchmarkDataset();

  app.listen(PORT, () => {
    console.log(`dishcovery-proxy listening on http://localhost:${PORT}`);
    console.log(`  Health    : http://localhost:${PORT}${ROUTES.health()}`);
    console.log(`  Search    : http://localhost:${PORT}${ROUTES.search()}?query=pasta`);
    console.log(`  App JSON  : http://localhost:${PORT}${ROUTES.recipe(716429)}`);
    console.log(`  Benchmark : http://localhost:${PORT}${ROUTES.recipe(716429, 'msgpack')}`);
    console.log(`  Dataset   : http://localhost:${PORT}${ROUTES.dataset()}`);
    console.log(`  Formats   : ${SERIALIZATION_FORMATS.join(', ')}`);
  });
}

main().catch((err) => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
