/**
 * dishcovery-proxy / server.js
 *
 * Proxy server for thesis benchmarking.
 * Sits between the Dishcovery React Native client and the Spoonacular API.
 *
 * Flow:
 *   Client → GET /recipe/:id?format=json|msgpack|protobuf
 *          → Proxy checks in-memory cache for normalised payload
 *          → Cache miss: fetches Spoonacular (always JSON, includeNutrition=true)
 *          → Proxy re-encodes into requested format
 *          → Client receives raw bytes + Content-Type header
 *
 * Endpoints:
 *   GET /health                                  — liveness check
 *   GET /recipes/ids?count=100                  — recipe IDs from Spoonacular search
 *   GET /recipe/:id?format=json|msgpack|protobuf — benchmark payload endpoint
 */

require('dotenv').config();

const path     = require('path');
const express  = require('express');
const axios    = require('axios');
const msgpack  = require('msgpack-lite');
const protobuf = require('protobufjs');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── In-memory payload cache ───────────────────────────────────────────────────
// Maps recipeId (string) → normalised payload object.
// Reduces Spoonacular API calls from 900 (100 IDs × 3 formats × 3 iterations)
// down to 100 (one fetch per unique recipe ID).
const payloadCache = new Map();

// ── Load Protobuf schema once at startup ──────────────────────────────────────

let RecipeDetail;

async function loadProto() {
  const root = await protobuf.load(path.join(__dirname, 'recipe.proto'));
  RecipeDetail = root.lookupType('RecipeDetail');
  console.log('[proto] recipe.proto loaded OK');
}

// ── Payload normaliser ────────────────────────────────────────────────────────

function normalise(d) {
  return {
    title:          d.title          || '',
    image:          d.image          || '',
    readyInMinutes: d.readyInMinutes || 0,
    servings:       d.servings       || 0,
    summary:        d.summary        || '',

    nutrition: {
      nutrients: (d.nutrition?.nutrients || []).map(n => ({
        name:   n.name   || '',
        amount: n.amount || 0,
        unit:   n.unit   || '',
      })),
    },

    extendedIngredients: (d.extendedIngredients || []).map(i => ({
      id:     i.id     || 0,
      amount: i.amount || 0,
      unit:   i.unit   || '',
      name:   i.name   || '',
    })),

    steps: (d.analyzedInstructions?.[0]?.steps || []).map(s => ({
      number: s.number || 0,
      step:   s.step   || '',
    })),
  };
}

// ── Helper: fetch & cache normalised payload ──────────────────────────────────

async function getNormalisedPayload(id) {
  if (payloadCache.has(id)) return payloadCache.get(id);

  const { data } = await axios.get(
    `https://api.spoonacular.com/recipes/${id}/information`,
    { params: { apiKey: process.env.SPOONACULAR_KEY, includeNutrition: true } }
  );

  const payload = normalise(data);
  payloadCache.set(id, payload);
  console.log(`[cache] stored recipe ${id} (cache size: ${payloadCache.size})`);
  return payload;
}

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// ── Health-check ──────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'ok', server: 'dishcovery-proxy', cacheSize: payloadCache.size, timestamp: Date.now() });
});

// ── Recipe IDs endpoint ───────────────────────────────────────────────────────

app.get('/recipes/ids', async (req, res, next) => {
  try {
    const count = Math.min(Number(req.query.count) || 100, 100);
    const { data } = await axios.get('https://api.spoonacular.com/recipes/complexSearch', {
      params: {
        apiKey:               process.env.SPOONACULAR_KEY,
        number:               count,
        instructionsRequired: true,
        addRecipeInformation: false,
      },
    });
    res.json({ count: data.results.length, ids: data.results.map(r => r.id) });
  } catch (err) {
    next(err);
  }
});

// ── Recipe benchmark endpoint ─────────────────────────────────────────────────

app.get('/recipe/:id', async (req, res, next) => {
  try {
    const { id }              = req.params;
    const { format = 'json' } = req.query;

    const VALID_FORMATS = ['json', 'msgpack', 'protobuf'];
    if (!VALID_FORMATS.includes(format)) {
      return res.status(400).json({ error: 'Invalid format', allowed: VALID_FORMATS });
    }

    const payload = await getNormalisedPayload(id);

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      return res.json(payload);
    }

    if (format === 'msgpack') {
      const encoded = msgpack.encode(payload);
      res.setHeader('Content-Type', 'application/x-msgpack');
      res.setHeader('Content-Length', encoded.length);
      return res.send(encoded);
    }

    if (format === 'protobuf') {
      const verifyErr = RecipeDetail.verify(payload);
      if (verifyErr) throw new Error(`Protobuf verify failed: ${verifyErr}`);
      const encoded = Buffer.from(RecipeDetail.encode(RecipeDetail.create(payload)).finish());
      res.setHeader('Content-Type', 'application/x-protobuf');
      res.setHeader('Content-Length', encoded.length);
      return res.send(encoded);
    }

  } catch (err) {
    if (err.response?.status === 404) {
      return res.status(404).json({ error: 'Recipe not found', id: req.params.id });
    }
    next(err);
  }
});

// ── 404 + error handlers ──────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.originalUrl });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack || err.message);
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

// ── Startup ───────────────────────────────────────────────────────────────────

async function main() {
  await loadProto();
  app.listen(PORT, () => {
    console.log(`dishcovery-proxy listening on http://localhost:${PORT}`);
    console.log(`  Health   : http://localhost:${PORT}/health`);
    console.log(`  IDs      : http://localhost:${PORT}/recipes/ids?count=100`);
    console.log(`  JSON     : http://localhost:${PORT}/recipe/716429?format=json`);
    console.log(`  MsgPack  : http://localhost:${PORT}/recipe/716429?format=msgpack`);
    console.log(`  Protobuf : http://localhost:${PORT}/recipe/716429?format=protobuf`);
  });
}

main().catch(err => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
