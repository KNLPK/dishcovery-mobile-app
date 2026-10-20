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

// ── Hosted mode ───────────────────────────────────────────────────────────────
//
// DISHCOVERY_MODE=hosted is the public deployment (render.yaml). It differs
// from the laptop setup in four ways and in nothing else:
//
//   1. Generated-only dataset. The 100 Spoonacular snapshots are never read:
//      Spoonacular's terms allow caching user-requested data for at most one
//      hour, so a public server must not serve stored copies. The benchmark
//      dataset is the 150 generated payloads, which are ours.
//   2. Recipes fetched live are cached for at most RECIPE_CACHE_TTL_SECONDS
//      (default and maximum 3600) and then deleted.
//   3. Per-IP rate limits, plus a server-wide daily budget in Spoonacular
//      points, so a handful of testers cannot exhaust the free plan's daily
//      quota for everyone. In-memory, no dependency; a restart resets the
//      counters (the quota header, when sent, restores the day's usage).
//   4. Upstream error text is redacted before it reaches a response.
//
// Without the variable the proxy behaves exactly as it did for the published
// measurements: full 250-payload dataset, snapshots, no limits.
//
// Fail-safe: Render sets RENDER and Vercel sets VERCEL in every deployment's
// environment, so on either host the proxy is hosted even if DISHCOVERY_MODE
// is missing or mistyped. A public instance can never fall back to serving the
// snapshots.
const ON_RENDER = Boolean(process.env.RENDER);
const ON_VERCEL = Boolean(process.env.VERCEL);
const HOST_FLAG = ON_RENDER ? 'RENDER' : ON_VERCEL ? 'VERCEL' : null;
const HOSTED = HOST_FLAG !== null || process.env.DISHCOVERY_MODE === 'hosted';
const MODE_REASON = HOST_FLAG !== null
  ? `${HOST_FLAG} is set${process.env.DISHCOVERY_MODE === 'hosted' ? ' and DISHCOVERY_MODE=hosted' : ', forced regardless of DISHCOVERY_MODE'}`
  : HOSTED
    ? 'DISHCOVERY_MODE=hosted'
    : 'DISHCOVERY_MODE not set to hosted, not on Render or Vercel';
console.log(`[mode] ${HOSTED ? 'HOSTED' : 'LOCAL'} (${MODE_REASON})`);

const MAX_CACHE_TTL_SECONDS = 3600;
const RECIPE_CACHE_TTL_MS =
  Math.min(
    Number(process.env.RECIPE_CACHE_TTL_SECONDS) || MAX_CACHE_TTL_SECONDS,
    MAX_CACHE_TTL_SECONDS
  ) * 1000;

const RATE_WINDOW_MS = 10 * 60 * 1000;
// Every route, per IP per 10 minutes. A Quick test fetches 90 payloads and a
// full pass over the hosted dataset 450, so this leaves room for both.
const RATE_LIMIT_ALL = Number(process.env.RATE_LIMIT_PER_10_MIN) || 1200;
// Requests that spend Spoonacular quota, per IP per 10 minutes.
const RATE_LIMIT_UPSTREAM = Number(process.env.UPSTREAM_LIMIT_PER_10_MIN) || 20;
// Spoonacular points per UTC day, all clients together. The free plan allows
// 50; stopping at 40 leaves room for estimation error and manual checks.
const UPSTREAM_DAILY_POINTS = Number(process.env.UPSTREAM_DAILY_POINTS) || 40;

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
    // `inDataset === false` marks surplus payloads beyond the balanced target;
    // they stay on disk for audit but are not part of the benchmark dataset.
    const ids = (manifest.recipes || [])
      .filter((r) => r.inDataset !== false)
      .map((r) => r.recipeId)
      .filter(Number.isFinite);
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

const BENCHMARK_RECIPE_IDS = HOSTED ? [] : loadBenchmarkRecipeIds();
if (HOSTED) {
  console.log('[dataset] hosted mode: Spoonacular snapshots are not served; generated payloads only.');
}
const GENERATED_RECIPE_IDS = loadGeneratedRecipeIds();

// Complexity tiering now comes from shared/contract.ts (COMPLEXITY_THRESHOLDS,
// measureComplexity, classifyFromMeasures) so client and server can never
// disagree on a tier assignment.

// In-memory cache: recipeId (string) → { recipe }  (the one canonical shape)
// Spoonacular entries carry an expiresAt; generated entries never expire.
const recipeCache = new Map();

function isFresh(entry) {
  return entry.expiresAt === undefined || entry.expiresAt > Date.now();
}

// Expired entries are deleted, not merely ignored, so no Spoonacular content
// outlives the TTL in memory either.
setInterval(() => {
  for (const [key, entry] of recipeCache) {
    if (!isFresh(entry)) recipeCache.delete(key);
  }
}, 60 * 1000).unref();

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

// ── Rate limits (hosted mode only) ──────────────────────────────────────────────

/**
 * Fixed-window counter keyed by client IP. The whole map is dropped when the
 * window rolls over, so memory is bounded by the clients seen in one window.
 */
function makeLimiter(limit, windowMs) {
  let windowStart = Date.now();
  let counts = new Map();
  return function hit(key) {
    const now = Date.now();
    if (now - windowStart >= windowMs) {
      windowStart = now;
      counts = new Map();
    }
    const n = (counts.get(key) || 0) + 1;
    counts.set(key, n);
    return {
      allowed: n <= limit,
      retryAfterSeconds: Math.ceil((windowStart + windowMs - now) / 1000),
    };
  };
}

const hitAll = makeLimiter(RATE_LIMIT_ALL, RATE_WINDOW_MS);
const hitUpstream = makeLimiter(RATE_LIMIT_UPSTREAM, RATE_WINDOW_MS);

// ── Spoonacular point budget (hosted mode only) ─────────────────────────────────
//
// The daily cap is counted in Spoonacular points, the unit the quota is sold
// in, not in calls. Documented costs (spoonacular.com/food-api/docs, read
// 2026-10-19):
//
//   GET /recipes/{id}/information   1 point, +0.1 with includeNutrition=true
//   GET /recipes/complexSearch      1 point + 0.01 per result returned;
//                                   +0.025 per result for each of
//                                   addRecipeInformation, fillIngredients,
//                                   addRecipeInstructions, addRecipeNutrition
//                                   (which also implies addRecipeInformation);
//                                   +1 when a nutrient filter is set
//
// When Spoonacular sends quota headers they win over these estimates:
// x-api-quota-request is what this call cost, x-api-quota-used the key's total
// for the day (which also covers points spent before a restart).

const RECIPE_INFORMATION_POINTS = 1 + 0.1; // fetchFromSpoonacular sends includeNutrition=true

// complexSearch min/max parameters that are not nutrient filters.
const NON_NUTRIENT_MIN_MAX = new Set(['maxReadyTime', 'minServings', 'maxServings']);

function searchPoints(params, resultCount) {
  const on = (v) => v === true || v === 'true';
  let perResult = 0.01;
  if (on(params.addRecipeInformation) || on(params.addRecipeNutrition)) perResult += 0.025;
  if (on(params.fillIngredients)) perResult += 0.025;
  if (on(params.addRecipeInstructions)) perResult += 0.025;
  if (on(params.addRecipeNutrition)) perResult += 0.025;
  const nutrientFilter = Object.keys(params).some(
    (k) => /^(min|max)[A-Z]/.test(k) && !NON_NUTRIENT_MIN_MAX.has(k)
  );
  return 1 + perResult * resultCount + (nutrientFilter ? 1 : 0);
}

const pointsDay = { date: '', used: 0 };

function utcDate() {
  return new Date().toISOString().slice(0, 10);
}

function rollDay() {
  const today = utcDate();
  if (pointsDay.date !== today) {
    pointsDay.date = today;
    pointsDay.used = 0;
  }
}

const round2 = (x) => Math.round(x * 100) / 100;

function pointsRemainingToday() {
  if (!HOSTED) return null;
  rollDay();
  return Math.max(round2(UPSTREAM_DAILY_POINTS - pointsDay.used), 0);
}

function pointsUsedToday() {
  if (!HOSTED) return null;
  rollDay();
  return round2(pointsDay.used);
}

function tooMany(message, retryAfterSeconds) {
  const err = new Error(message);
  err.status = 429;
  err.retryAfterSeconds = retryAfterSeconds;
  return err;
}

/**
 * Called immediately before every request that spends Spoonacular quota.
 * Throws a 429 instead of letting the call through when this device is over
 * its per-IP limit, or when the call's estimated cost would take the day past
 * the point budget.
 */
function reserveUpstream(req, estimatedPoints) {
  if (!HOSTED) return;
  const perIp = hitUpstream(req.ip);
  if (!perIp.allowed) {
    throw tooMany('Too many live recipe requests from this device. Try again shortly.', perIp.retryAfterSeconds);
  }
  rollDay();
  if (pointsDay.used + estimatedPoints > UPSTREAM_DAILY_POINTS) {
    const midnight = Date.parse(`${pointsDay.date}T00:00:00Z`) + 24 * 3600 * 1000;
    throw tooMany(
      "Today's allowance for live recipes is used up. It resets at 00:00 UTC (07:00 in Jakarta). " +
        'The offline Quick test and the generated recipes still work.',
      Math.ceil((midnight - Date.now()) / 1000)
    );
  }
}

/** A numeric response header, or null when absent or not a number. */
function headerNumber(headers, name) {
  const raw = headers?.[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Called after every upstream response, success or failure. Charges the cost
 * Spoonacular reports, or the documented estimate when it reports none. A
 * failed call without quota headers (a refused key, a network error) is not
 * charged; a 402 means the key's real quota is exhausted, so the day is closed.
 */
function chargeUpstream({ headers, status }, estimatedPoints) {
  if (!HOSTED) return;
  rollDay();
  const cost = headerNumber(headers, 'x-api-quota-request');
  const total = headerNumber(headers, 'x-api-quota-used');
  const ok = status !== undefined && status >= 200 && status < 300;
  if (cost !== null) pointsDay.used += cost;
  else if (ok) pointsDay.used += estimatedPoints;
  if (total !== null && total > pointsDay.used) pointsDay.used = total;
  if (status === 402) pointsDay.used = Math.max(pointsDay.used, UPSTREAM_DAILY_POINTS);
}

/** Run one upstream request under the budget: reserve, call, charge. */
async function spendUpstream(req, estimatedPoints, call, actualPoints = () => estimatedPoints) {
  if (req !== null) reserveUpstream(req, estimatedPoints);
  try {
    const response = await call();
    chargeUpstream(response, actualPoints(response));
    return response;
  } catch (err) {
    if (err.response) chargeUpstream(err.response, estimatedPoints);
    throw err;
  }
}

/** Never let the key reach a response body, whatever an upstream error says. */
function redact(text) {
  const s = String(text);
  return SPOONACULAR_API_KEY ? s.split(SPOONACULAR_API_KEY).join('[redacted]') : s;
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

async function fetchFromSpoonacular(id, req = null) {
  const { data } = await spendUpstream(req, RECIPE_INFORMATION_POINTS, () =>
    axios.get(`https://api.spoonacular.com/recipes/${id}/information`, {
      params: { apiKey: SPOONACULAR_API_KEY, includeNutrition: true },
    })
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
async function getRecipe(id, { allowLive = true, req = null } = {}) {
  const key = String(id);

  const cached = recipeCache.get(key);
  if (cached !== undefined) {
    if (isFresh(cached)) return cached;
    recipeCache.delete(key);
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

  if (!LIVE_REFETCH && !HOSTED) {
    raw = readSnapshot(id);
    if (raw) source = 'snapshot';
  }

  if (!raw) {
    if (!allowLive) {
      return null;
    }
    raw = await fetchFromSpoonacular(id, req);
  }

  const entry = {
    recipe: toCanonicalShape(raw),
    source: 'spoonacular',
    expiresAt: Date.now() + RECIPE_CACHE_TTL_MS,
  };
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

if (HOSTED) {
  // Render and Vercel terminate TLS at one proxy hop; without this every client would
  // share the load balancer's address and therefore one rate-limit bucket.
  app.set('trust proxy', 1);
}

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

app.use((req, res, next) => {
  if (!HOSTED) return next();
  const { allowed, retryAfterSeconds } = hitAll(req.ip);
  if (allowed) return next();
  next(tooMany('Too many requests from this device. Try again shortly.', retryAfterSeconds));
});

// ── Routes ──────────────────────────────────────────────────────────────────────

app.get(ROUTES.health(), (req, res) => {
  res.json({
    status: 'ok',
    server: 'dishcovery-proxy',
    mode: HOSTED ? 'hosted' : 'local',
    datasetTotal: benchmarkDataset.entries.length,
    // Spoonacular points, hosted mode only (null locally).
    pointsBudgetToday: HOSTED ? UPSTREAM_DAILY_POINTS : null,
    pointsUsedToday: pointsUsedToday(),
    pointsRemainingToday: pointsRemainingToday(),
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

    // Format support on search is JSON and MessagePack only.
    //
    // MessagePack is self-describing, so it encodes this response as-is. Protobuf
    // cannot: it would need a message type for the search result list, and
    // shared/proto/recipe.proto is frozen for the duration of data collection —
    // regenerating it would alter the very code whose decode time is being
    // measured. A protobuf search is therefore refused explicitly rather than
    // served as JSON under a protobuf label, which would corrupt any reading of
    // the metrics panel.
    const format = req.query.format;
    if (format !== undefined && format !== 'json' && format !== 'msgpack') {
      return res.status(400).json({
        error: 'Unsupported format for search',
        allowed: ['json', 'msgpack'],
        detail:
          'Protobuf requires a compiled message type and shared/proto/recipe.proto ' +
          'covers recipe documents only. Search supports JSON and MessagePack.',
      });
    }

    // `format` is ours, not Spoonacular's — forwarding it upstream would make
    // the request differ between formats, which is exactly what must not vary.
    const { format: _ignored, ...forwarded } = req.query;

    const params = {
      ...forwarded,
      apiKey: SPOONACULAR_API_KEY,
      addRecipeInformation: false,
      number: Math.min(Number(req.query.number) || 10, 50),
    };

    // Reserved at the requested result count (an upper bound), charged at the
    // count actually returned unless Spoonacular reports the cost itself.
    const { data } = await spendUpstream(
      req,
      searchPoints(params, params.number),
      () => axios.get('https://api.spoonacular.com/recipes/complexSearch', { params }),
      (response) =>
        searchPoints(params, Array.isArray(response.data?.results) ? response.data.results.length : params.number)
    );

    if (format === 'msgpack') {
      return sendBytes(res, {
        body: Buffer.from(encodeMsgPack(data)),
        contentType: CONTENT_TYPES.msgpack,
      });
    }

    res.setHeader('Content-Type', CONTENT_TYPES.json);
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

    const resolved = await getRecipe(id, { req });
    if (resolved === null) {
      return res.status(404).json({ error: 'Recipe not found', id });
    }
    const { recipe } = resolved;

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
    bySource: benchmarkDataset.bySource,
  });
});

// ── Error handling ──────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.originalUrl });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.status === 429) {
    console.warn('[limit]', req.ip, req.originalUrl, err.message);
    res.setHeader('Retry-After', String(err.retryAfterSeconds));
    return res.status(429).json({
      error: 'Too many requests',
      detail: err.message,
      retryAfterSeconds: err.retryAfterSeconds,
    });
  }
  console.error('[ERROR]', redact(err.stack || err.message));
  res.status(err.response?.status || 500).json({
    error: 'Internal server error',
    detail: redact(err.message),
  });
});

// ── Startup ─────────────────────────────────────────────────────────────────────

/** Everything the routes need before the first request. */
async function init() {
  assertApiKey();
  await loadProto();
  await buildBenchmarkDataset();
}

async function main() {
  await init();

  app.listen(PORT, () => {
    console.log(`dishcovery-proxy listening on http://localhost:${PORT}`);
    console.log(`  Health    : http://localhost:${PORT}${ROUTES.health()}`);
    console.log(`  Search    : http://localhost:${PORT}${ROUTES.search()}?query=pasta`);
    console.log(`  App JSON  : http://localhost:${PORT}${ROUTES.recipe(716429)}`);
    console.log(`  Benchmark : http://localhost:${PORT}${ROUTES.recipe(716429, 'msgpack')}`);
    console.log(`  Dataset   : http://localhost:${PORT}${ROUTES.dataset()}`);
    console.log(`  Formats   : ${SERIALIZATION_FORMATS.join(', ')}`);
    console.log(
      HOSTED
        ? `  Mode      : hosted (generated-only, cache TTL ${RECIPE_CACHE_TTL_MS / 1000} s, ` +
            `${RATE_LIMIT_ALL}/${RATE_LIMIT_UPSTREAM} req per IP per 10 min, ` +
            `${UPSTREAM_DAILY_POINTS} Spoonacular points/day)`
        : '  Mode      : local (full dataset, snapshots, no limits)'
    );
  });
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[FATAL]', err.message);
    process.exit(1);
  });
} else {
  // Imported by the serverless entry (api/index.js on Vercel): no listen. The
  // entry awaits `ready` before handing each request to the app.
  const ready = init();
  ready.catch((err) => console.error('[FATAL]', err.message));
  module.exports = { app, ready };
}
