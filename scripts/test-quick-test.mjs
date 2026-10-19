/**
 * scripts/test-quick-test.mjs
 *
 * Runs the real Quick test (src/quick/quickTest.ts, with the frozen codecs,
 * measureDecode and calibrateBracket) under Node, against the bundled payloads
 * and against a locally started proxy. Node has no Hermes heap counter, so
 * memory comes out null, which is also checked. Timings under Node's engine
 * mean nothing and are printed only as a smoke test.
 *
 *   node --experimental-strip-types --disable-warning=ExperimentalWarning \
 *     --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
 *     --import ./scripts/node-rn/register.mjs scripts/test-quick-test.mjs
 */
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const ROOT = path.join(import.meta.dirname, '..');
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { runQuickTest, QUICK_TEST_CONFIG } = await import(at("src/quick/quickTest.ts"));
const { selectPayloads } = await import(at("src/quick/selection.ts"));
const { base64ToArrayBuffer, loadOfflineDataset } = await import(at("src/offline/payloads.ts"));
const { startProxy } = await import(at("scripts/proxyProcess.ts"));
const { readFileSync } = await import('node:fs');
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) process.exitCode = 1; };

// base64 decoder == Node's, for every bundled buffer
const file = JSON.parse(readFileSync(path.join(ROOT, "assets", "offline", "payloads.json"), 'utf8'));
let same = 0;
for (const e of file.entries) for (const f of ['json', 'msgpack', 'protobuf']) {
  const a = new Uint8Array(base64ToArrayBuffer(e.base64[f])), b = Buffer.from(e.base64[f], 'base64');
  if (a.length === b.length && Buffer.compare(Buffer.from(a), b) === 0) same++;
}
ok(same === 450, `app base64 decoder == Node Buffer for ${same}/450 buffers`);

const ds = loadOfflineDataset();
const sel = selectPayloads(ds.entries, 10);
const byTier = (t) => sel.filter((e) => e.tier === t);
ok(sel.length === 30 && new Set(sel.map((e) => e.recipeId)).size === 30 && ['low', 'medium', 'high'].every((t) => byTier(t).length === 10), 'selection: 30 distinct payloads, 10 per tier');
for (const t of ['low', 'medium', 'high']) {
  const all = ds.entries.filter((e) => e.tier === t).map((e) => e.byteLength).sort((a, b) => a - b);
  const s = byTier(t).map((e) => e.byteLength);
  console.log(`      ${t}: tier range ${all[0]}..${all[all.length - 1]} B, selected ${s[0]}..${s[s.length - 1]} B`);
}
ok(JSON.stringify(selectPayloads([...ds.entries].reverse(), 10).map((e) => e.recipeId)) === JSON.stringify(sel.map((e) => e.recipeId)), 'selection is deterministic (independent of input order)');

const phases = new Set();
const t0 = Date.now();
const r = await runQuickTest({ source: { kind: 'offline' }, onProgress: (p) => phases.add(p.phase) });
ok(r.protocol === 'quick-test' && r.label === 'Quick test — not the paper protocol', `result labelled: "${r.label}" (${Date.now() - t0} ms in Node)`);
ok(r.cells.length === 9 && r.cells.every((c) => c.payloads === 10 && c.decodes === 10 * QUICK_TEST_CONFIG.measuredIterations), `9 cells, each 10 payloads x ${QUICK_TEST_CONFIG.measuredIterations} measured decodes`);
ok(['loading', 'prewarming', 'calibrating', 'measuring'].every((p) => phases.has(p)), `progress phases: ${[...phases].join(', ')}`);
let kbOk = 0;
for (const c of r.cells) {
  const expect = sel.filter((e) => e.tier === c.tier).reduce((a, e) => a + e.wireBytes[c.format], 0) / 10 / 1000;
  if (Math.abs(c.kbMean - expect) < 1e-12) kbOk++;
}
ok(kbOk === 9, `kbMean equals the selected payloads' mean wire size in all ${kbOk}/9 cells`);
ok(r.cells.filter((c) => c.format === 'json').every((c) => c.msPctVsJson === null) && r.cells.filter((c) => c.format !== 'json').every((c) => typeof c.msPctVsJson === 'number'), '% vs JSON: null for JSON, set for the others');
ok(r.cells.every((c) => c.mbMean === null) && r.bracketOffsetBytes === null, 'no heap counter in Node -> memory null (not invented)');
console.log('      ' + r.cells.map((c) => `${c.tier[0]}/${c.format.slice(0, 4)} ${c.msMean.toFixed(3)}ms ${c.kbMean.toFixed(2)}kB`).join('  '));

const proxy = await startProxy(3321);
try {
  const s = await runQuickTest({ source: { kind: 'server', baseUrl: proxy.baseUrl } });
  ok(s.source.kind === 'server' && s.cells.every((c, i) => c.kbMean === r.cells[i].kbMean), 'server source: same payloads, identical sizes to the bundled ones');
} finally { proxy.stop(); }
let stopped = await runQuickTest({ source: { kind: 'offline' }, shouldStop: () => true });
ok(stopped === null, 'Stop returns null and nothing is produced');
