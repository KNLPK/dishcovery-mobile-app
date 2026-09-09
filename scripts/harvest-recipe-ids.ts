/**
 * scripts/harvest-recipe-ids.ts
 *
 * Harvests a VERIFIED benchmark recipe ID list from Spoonacular, replacing the
 * partly-fabricated hand-written array that lived in dishcovery-proxy/server.js
 * (41 of its 100 IDs returned 404).
 *
 * Method:
 *   1. Query /recipes/complexSearch for candidate IDs across several queries.
 *   2. Verify every candidate resolves on /recipes/{id}/information
 *      (includeNutrition=true — the same call the proxy makes).
 *   3. Record six structural measures per verified recipe.
 *   4. Write the verified list to fixtures/benchmark-recipe-ids.json, which the
 *      proxy reads at startup.
 *
 * Nothing is padded. If fewer than the target resolve, the real number is what
 * gets written and reported.
 *
 * Usage:
 *   npm run harvest:ids -- --quota          # 1 request: report quota only, harvest nothing
 *   npm run harvest:ids -- --dry-run        # print the plan and cost, make NO requests
 *   npm run harvest:ids                     # full harvest (default target 100)
 *   npm run harvest:ids -- --target=60      # harvest a smaller set
 *
 * Quota: Spoonacular bills 1 point per request plus 0.01 per result returned.
 * --dry-run prints the projected cost before anything is spent.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  classifyFromMeasures,
  measureComplexity,
  type HarvestManifest,
  type HarvestedRecipe,
} from '../shared/contract.ts';

// ─── Config ───────────────────────────────────────────────────────────────────

const OUT_PATH = path.join(import.meta.dirname, '..', 'fixtures', 'benchmark-recipe-ids.json');
const ENV_PATH = path.join(import.meta.dirname, '..', 'dishcovery-proxy', '.env');

/**
 * Raw upstream snapshots, one file per recipe.
 *
 * Each file holds the response body EXACTLY as Spoonacular returned it — the
 * original response text, byte for byte, with no reshaping, reformatting or
 * key reordering. toCanonicalShape is applied downstream at serve time, never
 * at capture time, so the snapshot stays authoritative: if the canonical shape
 * changes later, it can be rebuilt from these files without spending quota.
 */
const RAW_DIR = path.join(import.meta.dirname, '..', 'fixtures', 'recipes-raw');

/**
 * Search queries. Spread across cuisines and dish types so the harvested set is
 * not a single narrow slice, and so payload sizes vary as much as the API
 * allows. Recorded in the manifest to keep the harvest reproducible.
 */
const QUERIES = [
  'pasta',
  'chicken',
  'salad',
  'soup',
  'curry',
  'dessert',
  'breakfast',
  'seafood',
];

const RESULTS_PER_QUERY = 20;
const DELAY_MS = 350;

// ─── Key handling ─────────────────────────────────────────────────────────────

/**
 * Read the key from dishcovery-proxy/.env, the same file the proxy uses.
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
    const match = /^\s*SPOONACULAR_API_KEY\s*=\s*(.*)$/.exec(line);
    if (match) {
      const value = match[1].trim();
      if (!value || value === 'placeholder') {
        throw new Error('SPOONACULAR_API_KEY is unset or still "placeholder" in dishcovery-proxy/.env');
      }
      return value;
    }
  }
  throw new Error('SPOONACULAR_API_KEY not found in dishcovery-proxy/.env');
}

// ─── Quota accounting ─────────────────────────────────────────────────────────

interface Quota {
  used: number | null;
  left: number | null;
  lastRequest: number | null;
}

function readQuotaHeaders(res: Response): Quota {
  const num = (name: string): number | null => {
    const v = res.headers.get(name);
    return v === null || v === '' ? null : Number(v);
  };
  return {
    used: num('x-api-quota-used'),
    left: num('x-api-quota-left'),
    lastRequest: num('x-api-quota-request'),
  };
}

function projectedCost(target: number): { requests: number; points: number; detail: string } {
  const searchRequests = QUERIES.length;
  const searchPoints = searchRequests * (1 + RESULTS_PER_QUERY * 0.01);
  const verifyRequests = target;
  const verifyPoints = verifyRequests * (1 + 0.01);
  return {
    requests: searchRequests + verifyRequests,
    points: searchPoints + verifyPoints,
    detail:
      `${searchRequests} complexSearch x (1 + ${RESULTS_PER_QUERY}x0.01) = ${searchPoints.toFixed(2)} pts\n` +
      `  ${verifyRequests} information  x (1 + 1x0.01)  = ${verifyPoints.toFixed(2)} pts`,
  };
}

// ─── Spoonacular calls ────────────────────────────────────────────────────────

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

let lastQuota: Quota = { used: null, left: null, lastRequest: null };

/**
 * Response headers worth keeping for provenance.
 *
 * Spoonacular publishes no explicit API-version header. Rather than invent one,
 * this records every header that actually carries version or provenance
 * meaning, and the manifest reports exactly what was present.
 */
const PROVENANCE_HEADERS = [
  'date',
  'server',
  'via',
  'x-powered-by',
  'content-type',
  'x-api-quota-request',
  'x-api-quota-used',
  'x-api-quota-left',
  'cf-ray',
];

function captureHeaders(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of PROVENANCE_HEADERS) {
    const value = res.headers.get(name);
    if (value !== null && value !== '') out[name] = value;
  }
  return out;
}

/** Strip the API key from a URL before it is ever recorded or logged. */
function redactUrl(url: string): string {
  return url.replace(/([?&]apiKey=)[^&]*/i, '$1REDACTED');
}

/**
 * Returns the raw response text alongside the parsed body, so the caller can
 * persist the original bytes rather than a re-serialised copy.
 */
async function spoonacular(
  url: string
): Promise<{ res: Response; text: string | null; body: unknown }> {
  const res = await fetch(url);
  lastQuota = readQuotaHeaders(res);
  if (!res.ok) {
    return { res, text: null, body: null };
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { res, text, body };
}

async function searchCandidates(apiKey: string, query: string): Promise<number[]> {
  const url =
    `https://api.spoonacular.com/recipes/complexSearch` +
    `?apiKey=${encodeURIComponent(apiKey)}` +
    `&query=${encodeURIComponent(query)}` +
    `&number=${RESULTS_PER_QUERY}` +
    `&addRecipeInformation=false` +
    `&instructionsRequired=true` +
    `&sort=popularity`;
  const { res, body } = await spoonacular(url);
  if (!res.ok) {
    console.warn(`[harvest] search "${query}" failed: HTTP ${res.status}`);
    return [];
  }
  const results = (body as { results?: { id: number }[] })?.results ?? [];
  return results.map((r) => r.id).filter((id) => Number.isFinite(id));
}

/** Same shaping the proxy performs, so measures match what the proxy will serve. */
function toCanonicalShape(data: Record<string, any>) {
  return {
    id: data.id || 0,
    title: data.title || '',
    image: data.image || '',
    readyInMinutes: data.readyInMinutes || 0,
    servings: data.servings || 0,
    summary: data.summary || '',
    nutrition: {
      nutrients: (data.nutrition?.nutrients || []).map((n: any) => ({
        name: n.name || '',
        amount: n.amount || 0,
        unit: n.unit || '',
        percentOfDailyNeeds: n.percentOfDailyNeeds || 0,
      })),
    },
    extendedIngredients: (data.extendedIngredients || []).map((i: any) => ({
      id: i.id || 0,
      amount: i.amount || 0,
      unit: i.unit || '',
      name: i.name || '',
    })),
    analyzedInstructions: (data.analyzedInstructions || []).map((ai: any) => ({
      name: ai.name || '',
      steps: (ai.steps || []).map((s: any) => ({
        number: s.number || 0,
        step: s.step || '',
      })),
    })),
  };
}

async function verifyRecipe(apiKey: string, id: number): Promise<HarvestedRecipe | null> {
  const url =
    `https://api.spoonacular.com/recipes/${id}/information` +
    `?apiKey=${encodeURIComponent(apiKey)}&includeNutrition=true`;
  const { res, text, body } = await spoonacular(url);
  if (!res.ok || text === null || body === null) return null;

  // Persist the upstream body VERBATIM — the exact response text, unmodified.
  // This is what makes the proxy's boot cost zero and the snapshot citable.
  fs.mkdirSync(RAW_DIR, { recursive: true });
  fs.writeFileSync(path.join(RAW_DIR, `${id}.json`), text, 'utf8');

  const capturedAt = new Date().toISOString();
  const headers = captureHeaders(res);

  const recipe = toCanonicalShape(body as Record<string, any>);
  const measures = measureComplexity(recipe);
  const instructionSetCount = recipe.analyzedInstructions.length;

  return {
    recipeId: id,
    title: recipe.title,
    byteLength: measures.byteLength,
    charCount: measures.charCount,
    maxDepth: measures.maxDepth,
    nutrientCount: recipe.nutrition.nutrients.length,
    ingredientCount: recipe.extendedIngredients.length,
    stepCount: recipe.analyzedInstructions.reduce(
      (n: number, a: { steps: unknown[] }) => n + a.steps.length,
      0
    ),
    instructionSetCount,
    // ── Provenance ──
    capturedAt,
    httpStatus: res.status,
    rawFile: `recipes-raw/${id}.json`,
    rawBytes: Buffer.byteLength(text, 'utf8'),
    requestUrl: redactUrl(url),
    responseHeaders: headers,
  };
}

// ─── Distribution reporting ───────────────────────────────────────────────────

function histogram(values: number[], bucketSize: number, unit: string): string {
  if (values.length === 0) return '  (none)';
  const max = Math.max(...values);
  const buckets = Math.ceil((max + 1) / bucketSize);
  const lines: string[] = [];
  for (let b = 0; b < buckets; b++) {
    const lo = b * bucketSize;
    const hi = (b + 1) * bucketSize;
    const n = values.filter((v) => v >= lo && v < hi).length;
    lines.push(
      `  ${String(lo).padStart(6)}-${String(hi).padStart(6)} ${unit} : ${'#'.repeat(n).padEnd(40)} ${n}`
    );
  }
  return lines.join('\n');
}

function counts(values: number[]): string {
  const uniq = [...new Set(values)].sort((a, b) => a - b);
  return uniq.map((v) => `${v} -> ${values.filter((x) => x === v).length}`).join(',  ');
}

function stats(values: number[]): string {
  if (values.length === 0) return 'n/a';
  const s = [...values].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return `min=${s[0]} p25=${q(0.25)} median=${q(0.5)} p75=${q(0.75)} max=${s[s.length - 1]}`;
}

function report(manifest: HarvestManifest): void {
  const r = manifest.recipes;
  console.log(`\n${'='.repeat(78)}`);
  console.log('HARVEST RESULT');
  console.log('='.repeat(78));
  console.log(`candidates seen : ${manifest.candidatesSeen}`);
  console.log(`verified        : ${manifest.verified}`);
  console.log(`failed          : ${manifest.failed}`);

  console.log('\n── Distributions ──');
  console.log(`byteLength      : ${stats(r.map((x) => x.byteLength))}`);
  console.log(`charCount       : ${stats(r.map((x) => x.charCount))}`);
  console.log(`maxDepth        : ${counts(r.map((x) => x.maxDepth))}`);
  console.log(`nutrientCount   : ${counts(r.map((x) => x.nutrientCount))}`);
  console.log(`ingredientCount : ${counts(r.map((x) => x.ingredientCount))}`);
  console.log(`stepCount       : ${counts(r.map((x) => x.stepCount))}`);
  console.log(`instructionSets : ${counts(r.map((x) => x.instructionSetCount))}`);

  console.log('\n── byteLength histogram (1024-byte buckets) ──');
  console.log(histogram(r.map((x) => x.byteLength), 1024, 'B'));

  const multi = r.filter((x) => x.instructionSetCount > 1);
  console.log(`\n── Multi-instruction-set recipes: ${multi.length} of ${r.length} ──`);
  for (const m of multi) {
    console.log(`  ${m.recipeId}  ${m.instructionSetCount} sets, ${m.stepCount} steps  — ${m.title}`);
  }

  const tally: Record<string, number> = { low: 0, medium: 0, high: 0 };
  for (const x of r) {
    tally[classifyFromMeasures({ byteLength: x.byteLength, charCount: x.charCount, maxDepth: x.maxDepth })]++;
  }
  console.log(
    `\n── Tier distribution under CURRENT (un-retuned) thresholds ──\n` +
      `  low=${tally.low}  medium=${tally.medium}  high=${tally.high}`
  );
  console.log(`\nwritten to ${OUT_PATH}`);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const arg = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
  const target = Number(arg('target') ?? 100);

  const cost = projectedCost(target);

  if (argv.includes('--dry-run')) {
    console.log(`\nHARVEST PLAN (no requests made)`);
    console.log(`  queries        : ${QUERIES.join(', ')}`);
    console.log(`  per query      : ${RESULTS_PER_QUERY} results`);
    console.log(`  target verified: ${target}`);
    console.log(`\nPROJECTED QUOTA COST`);
    console.log(`  ${cost.detail}`);
    console.log(`  total          : ${cost.requests} requests, ~${cost.points.toFixed(2)} points`);
    return;
  }

  const apiKey = readApiKey();

  if (argv.includes('--quota')) {
    // Single cheapest possible request, purely to read the quota headers.
    await spoonacular(
      `https://api.spoonacular.com/recipes/complexSearch?apiKey=${encodeURIComponent(apiKey)}&number=1`
    );
    console.log('\nQUOTA (from Spoonacular response headers)');
    console.log(`  used this billing period : ${lastQuota.used ?? 'not reported'}`);
    console.log(`  left                     : ${lastQuota.left ?? 'not reported'}`);
    console.log(`  cost of that one request : ${lastQuota.lastRequest ?? 'not reported'}`);
    console.log(`\nPROJECTED COST OF A ${target}-RECIPE HARVEST`);
    console.log(`  ${cost.detail}`);
    console.log(`  total : ${cost.requests} requests, ~${cost.points.toFixed(2)} points`);
    if (lastQuota.left !== null) {
      console.log(
        `\n  ${lastQuota.left >= cost.points ? 'FITS' : 'DOES NOT FIT'} in the remaining quota ` +
          `(${lastQuota.left} left vs ~${cost.points.toFixed(2)} needed)`
      );
    }
    return;
  }

  // ── Full harvest ────────────────────────────────────────────────────────────
  console.log(`[harvest] target ${target} verified recipes`);
  console.log(`[harvest] projected cost ~${cost.points.toFixed(2)} points`);
  const captureStartedAt = new Date().toISOString();

  const candidates: number[] = [];
  const seen = new Set<number>();
  for (const query of QUERIES) {
    const ids = await searchCandidates(apiKey, query);
    for (const id of ids) {
      if (!seen.has(id)) {
        seen.add(id);
        candidates.push(id);
      }
    }
    console.log(`[harvest] "${query}" -> ${ids.length} results, ${candidates.length} unique so far`);
    await delay(DELAY_MS);
  }

  const recipes: HarvestedRecipe[] = [];
  let failed = 0;
  for (const id of candidates) {
    if (recipes.length >= target) break;
    const verified = await verifyRecipe(apiKey, id);
    if (verified) {
      recipes.push(verified);
      console.log(
        `[harvest] ${recipes.length}/${target} verified ${id} ` +
          `(${verified.byteLength} B, ${verified.instructionSetCount} sets, ${verified.stepCount} steps)`
      );
    } else {
      failed++;
      console.warn(`[harvest] failed ${id}`);
    }
    await delay(DELAY_MS);
  }

  const observedHeaders = [
    ...new Set(recipes.flatMap((r) => Object.keys(r.responseHeaders))),
  ].sort();

  const manifest: HarvestManifest = {
    generatedAt: new Date().toISOString(),
    queries: [...QUERIES],
    candidatesSeen: candidates.length,
    verified: recipes.length,
    failed,
    provenance: {
      host: 'api.spoonacular.com',
      endpoint: '/recipes/{id}/information',
      params: { apiKey: 'REDACTED', includeNutrition: 'true' },
      apiVersionNote:
        'Spoonacular publishes no API-version header. Provenance is therefore ' +
        'established by capture timestamp and the response headers recorded ' +
        'per recipe, not by a version string.',
      observedHeaders,
      captureStartedAt,
      captureFinishedAt: new Date().toISOString(),
    },
    recipes,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  report(manifest);
  if (lastQuota.left !== null) {
    console.log(`\nquota left after harvest: ${lastQuota.left}`);
  }
  if (recipes.length < target) {
    console.log(
      `\nNOTE: only ${recipes.length} of the requested ${target} verified. ` +
        `The list was NOT padded — this is the real reachable number.`
    );
  }
}

main().catch((err) => {
  console.error('[harvest] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
