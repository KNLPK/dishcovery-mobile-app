/**
 * dishcovery-proxy / server.js
 *
 * Express proxy for thesis serialization benchmark (JSON vs MessagePack vs Protobuf).
 * The mobile app talks only to this server — never directly to Spoonacular.
 *
 * Benchmark flow:
 *   GET /api/recipes/:id?format=json|msgpack|proto
 *     → fetch Spoonacular once (includeNutrition=true)
 *     → map to proto-compatible shape
 *     → serialize to raw bytes with correct Content-Type + Content-Length
 *
 * Normal app usage:
 *   GET /api/search?query=...
 *   GET /api/recipes/:id            (default: camelCase JSON for the RN app)
 *   GET /api/benchmark/dataset      (100 recipe IDs grouped by payload complexity)
 */

require('dotenv').config();

const path = require('path');
const express = require('express');
const axios = require('axios');
const { encode: encodeMsgPack } = require('@msgpack/msgpack');
const protobuf = require('protobufjs');

const app = express();
const PORT = process.env.PORT || 3001;
const SPOONACULAR_API_KEY = process.env.SPOONACULAR_API_KEY;

// ── 100 popular Spoonacular recipe IDs for the benchmark dataset ──────────────
// Built once at startup; each ID is fetched and tiered by JSON payload size.
const BENCHMARK_RECIPE_IDS = [
  716429, 715538, 715415, 716406, 644387, 715446, 782601, 716004, 716627, 664679,
  640941, 660306, 715769, 642129, 715421, 716342, 715957, 657312, 715523, 716195,
  715495, 716364, 715683, 716008, 716330, 716276, 715550, 716311, 715639, 716296,
  634437, 633088, 632347, 631836, 631813, 631712, 631671, 631655, 631649, 631641,
  1095849, 1095750, 1095734, 1095707, 1095698, 1095690, 1095683, 1095675, 1095667, 1095659,
  649946, 649945, 649944, 649943, 649942, 649941, 649940, 649939, 649938, 649937,
  982382, 982383, 982384, 982385, 982386, 982387, 982388, 982389, 982390, 982391,
  715419, 715520, 715540, 715545, 715560, 715570, 715580, 715590, 715600, 715610,
  716400, 716410, 716420, 716430, 716440, 716450, 716460, 716470, 716480, 716490,
  716500, 716510, 716520, 716530, 716540, 716550, 716560, 716570, 716580, 716590,
];

// Complexity tiers (character count of JSON.stringify(protoShape))
const TIER_LOW_MAX = 8 * 1024;       // < 8 KB
const TIER_MEDIUM_MAX = 20 * 1024;   // 8–20 KB; above = high

// In-memory cache: recipeId (string) → { protoShape, appShape }
const recipeCache = new Map();

// Benchmark dataset built once at startup
let benchmarkDataset = { low: [], medium: [], high: [] };

// Protobuf type loaded once at startup
let RecipeDetailType;

// ── Startup helpers ───────────────────────────────────────────────────────────

async function loadProto() {
  const root = await protobuf.load(path.join(__dirname, 'proto', 'recipe.proto'));
  RecipeDetailType = root.lookupType('RecipeDetail');
  console.log('[proto] loaded proto/recipe.proto');
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
 * Map Spoonacular recipe JSON into the proto-compatible snake_case shape
 * used for benchmark serialization (JSON / MessagePack / Protobuf).
 */
function toProtoShape(data) {
  return {
    id: data.id || 0,
    title: data.title || '',
    image: data.image || '',
    ready_in_minutes: data.readyInMinutes || 0,
    servings: data.servings || 0,
    summary: data.summary || '',
    nutrition: {
      nutrients: (data.nutrition?.nutrients || []).map((n) => ({
        name: n.name || '',
        amount: n.amount || 0,
        unit: n.unit || '',
        percent_of_daily_needs: n.percentOfDailyNeeds || 0,
      })),
    },
    extended_ingredients: (data.extendedIngredients || []).map((i) => ({
      id: i.id || 0,
      amount: i.amount || 0,
      unit: i.unit || '',
      name: i.name || '',
    })),
    steps: (data.analyzedInstructions?.[0]?.steps || []).map((s) => ({
      number: s.number || 0,
      step: s.step || '',
    })),
  };
}

/**
 * Map Spoonacular recipe JSON into camelCase JSON for normal mobile app usage.
 */
function toAppShape(data) {
  return {
    id: data.id,
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
    analyzedInstructions: data.analyzedInstructions || [],
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
 * Fetch a recipe from Spoonacular (or cache), returning both shapes.
 */
async function getRecipe(id) {
  const key = String(id);

  if (recipeCache.has(key)) {
    return recipeCache.get(key);
  }

  const raw = await fetchFromSpoonacular(id);
  const entry = {
    protoShape: toProtoShape(raw),
    appShape: toAppShape(raw),
  };

  recipeCache.set(key, entry);
  console.log(`[cache] stored recipe ${id} (size: ${recipeCache.size})`);
  return entry;
}

// ── Serialization (benchmark formats) ─────────────────────────────────────────

const VALID_FORMATS = ['json', 'msgpack', 'proto'];

function serializeRecipe(protoShape, format) {
  if (format === 'json') {
    const jsonString = JSON.stringify(protoShape);
    return {
      body: Buffer.from(jsonString, 'utf8'),
      contentType: 'application/json',
    };
  }

  if (format === 'msgpack') {
    const encoded = encodeMsgPack(protoShape);
    return {
      body: Buffer.from(encoded),
      contentType: 'application/x-msgpack',
    };
  }

  if (format === 'proto') {
    const verifyErr = RecipeDetailType.verify(protoShape);
    if (verifyErr) {
      throw new Error(`Protobuf verify failed: ${verifyErr}`);
    }
    const message = RecipeDetailType.create(protoShape);
    const encoded = RecipeDetailType.encode(message).finish();
    return {
      body: Buffer.from(encoded),
      contentType: 'application/x-protobuf',
    };
  }

  throw new Error(`Unsupported format: ${format}`);
}

function sendBytes(res, { body, contentType }) {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', body.length);
  res.send(body);
}

function jsonPayloadCharCount(protoShape) {
  return JSON.stringify(protoShape).length;
}

function tierForCharCount(charCount) {
  if (charCount < TIER_LOW_MAX) return 'low';
  if (charCount <= TIER_MEDIUM_MAX) return 'medium';
  return 'high';
}

/**
 * Fetch all 100 benchmark recipes and group IDs by JSON payload complexity.
 * Runs once at startup so benchmark clients get a stable, pre-classified dataset.
 */
async function buildBenchmarkDataset() {
  console.log('[benchmark] building dataset from 100 recipe IDs…');

  const dataset = { low: [], medium: [], high: [] };
  const uniqueIds = [...new Set(BENCHMARK_RECIPE_IDS)].slice(0, 100);

  for (let i = 0; i < uniqueIds.length; i++) {
    const id = uniqueIds[i];

    try {
      const { protoShape } = await getRecipe(id);
      const charCount = jsonPayloadCharCount(protoShape);
      const tier = tierForCharCount(charCount);
      dataset[tier].push(id);

      console.log(
        `[benchmark] ${i + 1}/${uniqueIds.length} recipe ${id} → ${tier} (${charCount} chars)`
      );
    } catch (err) {
      console.warn(
        `[benchmark] skipped recipe ${id}: ${err.response?.status || err.message}`
      );
    }

    // Gentle throttle to stay within Spoonacular free-tier rate limits
    if (i < uniqueIds.length - 1) {
      await delay(350);
    }
  }

  benchmarkDataset = dataset;

  console.log('[benchmark] dataset ready:', {
    low: dataset.low.length,
    medium: dataset.medium.length,
    high: dataset.high.length,
  });
}

// ── Middleware ──────────────────────────────────────────────────────────────────

app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// ── Routes ──────────────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    server: 'dishcovery-proxy',
    cacheSize: recipeCache.size,
    benchmarkDataset: {
      low: benchmarkDataset.low.length,
      medium: benchmarkDataset.medium.length,
      high: benchmarkDataset.high.length,
    },
  });
});

/**
 * Normal app usage — search recipes via Spoonacular complexSearch.
 * Example: GET /api/search?query=pasta
 */
app.get('/api/search', async (req, res, next) => {
  try {
    const query = req.query.query;
    if (!query) {
      return res.status(400).json({ error: 'Missing required query parameter: query' });
    }

    const { data } = await axios.get('https://api.spoonacular.com/recipes/complexSearch', {
      params: {
        apiKey: SPOONACULAR_API_KEY,
        query,
        number: Math.min(Number(req.query.number) || 10, 50),
        addRecipeInformation: false,
      },
    });

    res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * Recipe detail endpoint.
 *
 * Benchmark:  GET /api/recipes/:id?format=json|msgpack|proto  → raw serialized bytes
 * App usage:  GET /api/recipes/:id                            → camelCase JSON (default)
 */
app.get('/api/recipes/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const format = req.query.format;

    const { protoShape, appShape } = await getRecipe(id);

    // No format param → normal app JSON (camelCase)
    if (!format) {
      res.setHeader('Content-Type', 'application/json');
      return res.json(appShape);
    }

    if (!VALID_FORMATS.includes(format)) {
      return res.status(400).json({
        error: 'Invalid format',
        allowed: VALID_FORMATS,
      });
    }

    const serialized = serializeRecipe(protoShape, format);
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
app.get('/api/benchmark/dataset', (req, res) => {
  res.json({
    total: benchmarkDataset.low.length
      + benchmarkDataset.medium.length
      + benchmarkDataset.high.length,
    tiers: {
      low: { maxChars: TIER_LOW_MAX - 1, ids: benchmarkDataset.low },
      medium: { minChars: TIER_LOW_MAX, maxChars: TIER_MEDIUM_MAX, ids: benchmarkDataset.medium },
      high: { minChars: TIER_MEDIUM_MAX + 1, ids: benchmarkDataset.high },
    },
    low: benchmarkDataset.low,
    medium: benchmarkDataset.medium,
    high: benchmarkDataset.high,
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
    console.log(`  Health    : http://localhost:${PORT}/health`);
    console.log(`  Search    : http://localhost:${PORT}/api/search?query=pasta`);
    console.log(`  App JSON  : http://localhost:${PORT}/api/recipes/716429`);
    console.log(`  Benchmark : http://localhost:${PORT}/api/recipes/716429?format=json`);
    console.log(`  Dataset   : http://localhost:${PORT}/api/benchmark/dataset`);
  });
}

main().catch((err) => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
