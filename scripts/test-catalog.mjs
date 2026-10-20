/**
 * scripts/test-catalog.mjs
 *
 * Hosted (catalog) mode with no Spoonacular key: browsing and recipe detail
 * must work from the 150 generated recipes alone, without a single upstream
 * request.
 *
 *   node --experimental-strip-types --disable-warning=ExperimentalWarning \
 *     scripts/test-catalog.mjs
 *
 * Loads the Vercel entry (dishcovery-proxy/api/index.js) with VERCEL=1 and the
 * key removed, makes every axios request fail, and checks:
 *   - /health: hosted, catalog source, no points budget
 *   - search by query, by category (type) and paging
 *   - find by ingredients (ChefHat), ranked by overlap
 *   - recipe detail in all three formats, byte-identical to the bundled
 *     offline payloads; an unknown id is a 404, not an upstream call
 *
 * Prints PASS or FAIL; exit code 1 on FAIL.
 */

import { Buffer } from 'node:buffer';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
const require = createRequire(path.join(ROOT, 'dishcovery-proxy', 'server.js'));

process.env.VERCEL = '1';
// An empty value stops dotenv from loading a real key from dishcovery-proxy/.env.
process.env.SPOONACULAR_API_KEY = '';

let upstreamCalls = 0;
require('axios').interceptors.request.use((config) => {
  upstreamCalls++;
  throw new Error(`unexpected upstream request: ${config.url}`);
});

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`);
  if (!c) failed = true;
};

const log = console.log;
console.log = () => {}; // the proxy's request log
const handler = require(path.join(ROOT, 'dishcovery-proxy', 'api', 'index.js'));
const server = http.createServer(handler).listen(0);
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;
const get = async (p) => {
  const res = await fetch(base + p);
  return { status: res.status, type: res.headers.get('content-type'), body: Buffer.from(await res.arrayBuffer()) };
};
const json = async (p) => JSON.parse((await get(p)).body.toString('utf8'));

const health = await json('/health');
console.log = log;

ok(
  health.mode === 'hosted' && health.datasetTotal === 150,
  `health: mode ${health.mode}, datasetTotal ${health.datasetTotal}`
);
ok(health.source === 'catalog (150 Gemini-generated recipes)', `health source: "${health.source}"`);
ok(
  !Object.keys(health).some((k) => /points|quota|budget/i.test(k)),
  `health has no points/quota fields (${Object.keys(health).join(', ')})`
);

const pasta = await json('/api/search?query=pasta&number=50');
ok(
  pasta.results.length > 0 && pasta.results.every((r) => r.id >= 9000001 && typeof r.title === 'string'),
  `search "pasta": ${pasta.totalResults} generated recipes, e.g. "${pasta.results[0]?.title}"`
);
const upper = await json('/api/search?query=PASTA&number=50');
ok(upper.totalResults === pasta.totalResults, 'search is case-insensitive');
const none = await json('/api/search?query=zzqx-no-such-dish');
ok(none.totalResults === 0 && Array.isArray(none.results) && none.results.length === 0, 'no match: empty results, not an error');

const page1 = await json('/api/search?query=chicken&number=3&offset=0');
const page2 = await json('/api/search?query=chicken&number=3&offset=3');
ok(
  page1.number === 3 && page1.offset === 0 && page2.offset === 3 &&
    page1.results.length === 3 && !page1.results.some((a) => page2.results.some((b) => b.id === a.id)),
  `paging: ${page1.totalResults} "chicken" results, pages of 3 do not overlap`
);

const mp = await get('/api/search?query=pasta&number=50&format=msgpack');
ok(mp.status === 200 && mp.type === 'application/x-msgpack', 'search as MessagePack');

for (const [label, type] of [['Breakfast', 'breakfast'], ['Main course', 'main course'], ['Snack', 'snack'], ['Dessert', 'dessert']]) {
  // Home sends the chip label as the query and its type, exactly like this.
  const r = await json(`/api/search?query=${encodeURIComponent(label)}&type=${encodeURIComponent(type)}&number=8`);
  ok(r.results.length > 0, `home category ${label}: ${r.totalResults} recipes`);
}
const dessertPasta = await json('/api/search?query=pasta&type=dessert&number=50');
ok(dessertPasta.totalResults < pasta.totalResults, `type narrows a search (pasta ${pasta.totalResults}, pasta + dessert ${dessertPasta.totalResults})`);

const chef = await json('/api/search?includeIngredients=garlic,onion,chicken&type=&number=5');
const ranks = [];
for (const r of chef.results) {
  const recipe = await json(`/api/recipes/${r.id}`);
  const names = recipe.extendedIngredients.map((i) => i.name.toLowerCase());
  ranks.push(['garlic', 'onion', 'chicken'].filter((w) => names.some((n) => n.includes(w))).length);
}
ok(
  chef.results.length === 5 && ranks.every((n, i) => n >= 1 && (i === 0 || n <= ranks[i - 1])),
  `find by ingredients (garlic, onion, chicken): overlap ${ranks.join(', ')}, ranked high to low`
);
const anyTime = await json('/api/search?includeIngredients=garlic&number=50');
const quick = await json('/api/search?includeIngredients=garlic&maxReadyTime=45&number=50');
let quickOk = quick.totalResults > 0 && quick.totalResults < anyTime.totalResults;
for (const r of quick.results) {
  const recipe = await json(`/api/recipes/${r.id}`);
  if (recipe.readyInMinutes > 45) quickOk = false;
}
ok(quickOk, `maxReadyTime 45: ${quick.totalResults} of ${anyTime.totalResults} garlic recipes, none slower`);

const offline = JSON.parse(readFileSync(path.join(ROOT, 'assets', 'offline', 'payloads.json'), 'utf8'));
let identical = 0;
const sample = offline.entries.filter((_, i) => i % 15 === 0);
for (const e of sample) {
  for (const f of ['json', 'msgpack', 'protobuf']) {
    const r = await get(`/api/recipes/${e.recipeId}?format=${f}`);
    if (r.status === 200 && r.body.equals(Buffer.from(e.base64[f], 'base64'))) identical++;
  }
}
ok(identical === sample.length * 3, `detail: ${identical}/${sample.length * 3} sampled payloads byte-identical to the bundled ones`);

const plain = await get(`/api/recipes/${pasta.results[0].id}`);
ok(plain.status === 200 && plain.type.startsWith('application/json'), 'detail without format: app JSON');
const missing = await get('/api/recipes/716429');
ok(missing.status === 404, `non-catalog id 716429: ${missing.status}`);

ok(upstreamCalls === 0, `upstream requests: ${upstreamCalls}`);

server.close();
process.exit(failed ? 1 : 0);
