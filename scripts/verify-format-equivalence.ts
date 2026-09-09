/**
 * scripts/verify-format-equivalence.ts
 *
 * CROSS-FORMAT EQUIVALENCE CHECK — the evidence that "identical logical content
 * across formats" actually holds.
 *
 * Fetches the same recipe as JSON, MessagePack and protobuf, decodes each with
 * the SAME codecs the app uses, and deep-compares the three reconstructions
 * field by field. Reports missing fields, extra fields, differing values and
 * array-length mismatches.
 *
 * Run it:
 *   npm run verify:formats                  # live, against the proxy
 *   npm run verify:formats -- --fixtures    # offline, against committed fixtures
 *   npm run verify:formats -- --capture     # live + write fixtures to disk
 *
 * Options:
 *   --base=http://host:port   proxy base URL (default http://localhost:3001)
 *   --ids=1,2,3               recipe ids to check (default: from the proxy dataset)
 *
 * This is a committed, reproducible artefact, not a throwaway. The --fixtures
 * mode exists so the check still runs months from now without depending on
 * Spoonacular returning identical data, and so the multi-instruction-set case
 * that the old truncation bug destroyed stays covered forever.
 *
 * NOTE ON DECODE OUTPUT: the protobuf codec returns a generated Message
 * instance, not a plain object. Normalisation to a plain object happens HERE,
 * outside any measured window, purely so the deep-compare has like-for-like
 * inputs. It is never done inside src/api/measure.ts.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  SERIALIZATION_FORMATS,
  ROUTES,
  classifyComplexity,
  measureComplexity,
  type SerializationFormat,
} from '../shared/contract.ts';
import type { Codec } from '../src/api/codecs/types.ts';
import { jsonCodec } from '../src/api/codecs/json.ts';
import { msgpackCodec } from '../src/api/codecs/msgpack.ts';
import { protobufCodec } from '../src/api/codecs/protobuf.ts';

const CODECS: Record<SerializationFormat, Codec> = {
  json: jsonCodec,
  msgpack: msgpackCodec,
  protobuf: protobufCodec,
};

const FIXTURE_DIR = path.join(import.meta.dirname, '..', 'fixtures', 'recipes');

// ─── Difference reporting ─────────────────────────────────────────────────────

interface Difference {
  path: string;
  kind: 'missing' | 'extra' | 'value' | 'length' | 'type';
  detail: string;
}

/**
 * Deep structural comparison.
 *
 * `baseline` is the JSON reconstruction (the study's baseline format);
 * `other` is the format being checked against it.
 */
function diff(baseline: unknown, other: unknown, at = '', out: Difference[] = []): Difference[] {
  if (Array.isArray(baseline) || Array.isArray(other)) {
    if (!Array.isArray(baseline) || !Array.isArray(other)) {
      out.push({ path: at, kind: 'type', detail: `${typeName(baseline)} vs ${typeName(other)}` });
      return out;
    }
    if (baseline.length !== other.length) {
      out.push({
        path: at,
        kind: 'length',
        detail: `baseline has ${baseline.length}, other has ${other.length}`,
      });
    }
    const n = Math.max(baseline.length, other.length);
    for (let i = 0; i < n; i++) diff(baseline[i], other[i], `${at}[${i}]`, out);
    return out;
  }

  if (isPlainObject(baseline) || isPlainObject(other)) {
    if (!isPlainObject(baseline) || !isPlainObject(other)) {
      out.push({ path: at, kind: 'type', detail: `${typeName(baseline)} vs ${typeName(other)}` });
      return out;
    }
    const keys = new Set([...Object.keys(baseline), ...Object.keys(other)]);
    for (const key of [...keys].sort()) {
      const childPath = at === '' ? key : `${at}.${key}`;
      const inBaseline = key in baseline;
      const inOther = key in other;
      if (inBaseline && !inOther) {
        out.push({ path: childPath, kind: 'missing', detail: `absent; baseline has ${preview(baseline[key])}` });
      } else if (!inBaseline && inOther) {
        out.push({ path: childPath, kind: 'extra', detail: `present only in other: ${preview(other[key])}` });
      } else {
        diff(baseline[key], other[key], childPath, out);
      }
    }
    return out;
  }

  if (!Object.is(baseline, other)) {
    // Floating point: protobuf `double` is exact for JS numbers, so an
    // inequality here is a real defect, not a rounding artefact. Reported as-is.
    out.push({ path: at, kind: 'value', detail: `${preview(baseline)} !== ${preview(other)}` });
  }
  return out;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Count scalar fields whose value equals the proto3 default for their type.
 *
 * proto3 does not transmit default-valued scalars: an empty string or a zero is
 * simply absent from the wire. This counts, across the whole canonical payload,
 * how many scalars protobuf therefore omitted — the magnitude of that effect,
 * so it can be stated in the methodology rather than merely acknowledged.
 *
 * Counted on the JSON reconstruction, which carries every field explicitly.
 * Message fields and repeated fields are traversed, not counted themselves.
 */
function countProto3Omitted(value: unknown): { omitted: number; scalars: number } {
  let omitted = 0;
  let scalars = 0;

  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      for (const item of v) walk(item);
      return;
    }
    if (isPlainObject(v)) {
      for (const key of Object.keys(v)) walk(v[key]);
      return;
    }
    // Scalar leaf.
    scalars++;
    if (v === '' || v === 0) omitted++;
  };

  walk(value);
  return { omitted, scalars };
}
function typeName(v: unknown): string {
  return v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
}
function preview(v: unknown): string {
  const s = typeof v === 'string' ? JSON.stringify(v) : String(v);
  return s.length > 60 ? `${s.slice(0, 57)}...` : s;
}

/**
 * Convert any decoded value into a plain JSON-comparable tree.
 *
 * Done outside every measured window — this is comparison scaffolding, never
 * part of a timed decode.
 *
 * PROTO3 DEFAULTS. protobuf does not put default-valued scalars on the wire: an
 * empty string or a zero is simply absent. The decoded Message still reports
 * them correctly (msg.name returns "" from the message prototype), so no
 * logical content is lost. But a plain JSON.stringify round-trip calls
 * Message#toJSON, which omits those defaults and would make the comparison
 * report spurious "missing field" differences that do not exist in the data.
 *
 * toObject(..., { defaults: true }) materialises them explicitly, which is the
 * correct way to turn a Message into a plain object for structural comparison.
 */
function normalize(format: SerializationFormat, value: unknown): unknown {
  const codec = CODECS[format];
  const plain = codec.toPlainObject ? codec.toPlainObject(value) : value;
  return JSON.parse(JSON.stringify(plain));
}

// ─── Transport ────────────────────────────────────────────────────────────────

async function fetchFormat(base: string, id: number, format: SerializationFormat): Promise<ArrayBuffer> {
  const url = `${base}${ROUTES.recipe(id, format)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.arrayBuffer();
}

async function fetchDatasetIds(base: string, limit: number): Promise<number[]> {
  const res = await fetch(`${base}${ROUTES.dataset()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching dataset`);
  const body = (await res.json()) as { entries?: { recipeId: number }[] };
  return (body.entries ?? []).map((e) => e.recipeId).slice(0, limit);
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

interface Fixture {
  recipeId: number;
  note: string;
  /** base64 payload per format, exactly as the proxy served it */
  payloads: Record<SerializationFormat, string>;
}

function fixturePath(id: number): string {
  return path.join(FIXTURE_DIR, `${id}.json`);
}

function writeFixture(id: number, note: string, buffers: Record<SerializationFormat, ArrayBuffer>): void {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  const payloads = {} as Record<SerializationFormat, string>;
  for (const format of SERIALIZATION_FORMATS) {
    payloads[format] = Buffer.from(buffers[format]).toString('base64');
  }
  const fixture: Fixture = { recipeId: id, note, payloads };
  fs.writeFileSync(fixturePath(id), `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
}

function readFixtures(): Fixture[] {
  if (!fs.existsSync(FIXTURE_DIR)) return [];
  return fs
    .readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, f), 'utf8')) as Fixture)
    .sort((a, b) => a.recipeId - b.recipeId);
}

function fixtureBuffers(fixture: Fixture): Record<SerializationFormat, ArrayBuffer> {
  const out = {} as Record<SerializationFormat, ArrayBuffer>;
  for (const format of SERIALIZATION_FORMATS) {
    const buf = Buffer.from(fixture.payloads[format], 'base64');
    out[format] = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  }
  return out;
}

// ─── Check ────────────────────────────────────────────────────────────────────

interface CheckOutcome {
  recipeId: number;
  note: string;
  ok: boolean;
  bytes: Record<SerializationFormat, number>;
  tier: string;
  byteLength: number;
  charCount: number;
  maxDepth: number;
  instructionSets: number;
  totalSteps: number;
  nutrients: number;
  ingredients: number;
  /** Steps the pre-Stage-2 truncation would have discarded (all sets after [0]). */
  discardedSteps: number;
  /** proto3 default-valued scalars NOT transmitted on the wire. */
  proto3Omitted: number;
  /** Total scalar leaves in the canonical payload. */
  proto3Scalars: number;
  differences: Record<string, Difference[]>;
}

function checkOne(recipeId: number, note: string, buffers: Record<SerializationFormat, ArrayBuffer>): CheckOutcome {
  const decoded = {} as Record<SerializationFormat, unknown>;
  const bytes = {} as Record<SerializationFormat, number>;

  for (const format of SERIALIZATION_FORMATS) {
    bytes[format] = buffers[format].byteLength;
    decoded[format] = normalize(format, CODECS[format].decode(buffers[format]));
  }

  const baseline = decoded.json as Record<string, unknown>;
  const differences: Record<string, Difference[]> = {};
  let ok = true;

  for (const format of SERIALIZATION_FORMATS) {
    if (format === 'json') continue;
    const d = diff(baseline, decoded[format], '');
    differences[format] = d;
    if (d.length > 0) ok = false;
  }

  const instructions = (baseline?.analyzedInstructions as { steps?: unknown[] }[] | undefined) ?? [];
  const measures = measureComplexity(baseline);

  return {
    recipeId,
    note,
    ok,
    bytes,
    tier: classifyComplexity(baseline),
    byteLength: measures.byteLength,
    charCount: measures.charCount,
    maxDepth: measures.maxDepth,
    instructionSets: instructions.length,
    totalSteps: instructions.reduce((sum, s) => sum + (s.steps?.length ?? 0), 0),
    nutrients: ((baseline?.nutrition as { nutrients?: unknown[] })?.nutrients ?? []).length,
    ingredients: ((baseline?.extendedIngredients as unknown[]) ?? []).length,
    discardedSteps: instructions.slice(1).reduce((sum, s) => sum + (s.steps?.length ?? 0), 0),
    proto3Omitted: countProto3Omitted(baseline).omitted,
    proto3Scalars: countProto3Omitted(baseline).scalars,
    differences,
  };
}

// ─── Report ───────────────────────────────────────────────────────────────────

function report(results: CheckOutcome[], mode: string): boolean {
  const pad = (s: string | number, n: number) => String(s).padEnd(n);
  const padL = (s: string | number, n: number) => String(s).padStart(n);

  console.log(`\nCROSS-FORMAT EQUIVALENCE CHECK  (${mode})`);
  console.log('='.repeat(104));
  console.log(
    pad('recipe', 9) + pad('tier', 8) + padL('bytes', 8) + padL('depth', 6) +
    padL('sets', 6) + padL('steps', 7) + padL('nutr', 6) + padL('ingr', 6) +
    padL('json B', 9) + padL('mpack B', 9) + padL('proto B', 9) + '  result'
  );
  console.log('-'.repeat(104));

  let allOk = true;
  for (const r of results) {
    if (!r.ok) allOk = false;
    console.log(
      pad(r.recipeId, 9) + pad(r.tier, 8) + padL(r.byteLength, 8) + padL(r.maxDepth, 6) +
      padL(r.instructionSets, 6) + padL(r.totalSteps, 7) + padL(r.nutrients, 6) + padL(r.ingredients, 6) +
      padL(r.bytes.json, 9) + padL(r.bytes.msgpack, 9) + padL(r.bytes.protobuf, 9) +
      '  ' + (r.ok ? 'IDENTICAL' : 'MISMATCH')
    );
  }
  console.log('-'.repeat(104));

  for (const r of results) {
    for (const [format, diffs] of Object.entries(r.differences)) {
      if (diffs.length === 0) continue;
      console.log(`\nrecipe ${r.recipeId} — json vs ${format}: ${diffs.length} difference(s)`);
      for (const d of diffs.slice(0, 25)) {
        console.log(`   [${d.kind}] ${d.path || '<root>'} : ${d.detail}`);
      }
      if (diffs.length > 25) console.log(`   ... ${diffs.length - 25} more`);
    }
  }

  // ── Tier distribution ──────────────────────────────────────────────────────
  const tally: Record<string, number> = { low: 0, medium: 0, high: 0 };
  for (const r of results) tally[r.tier] = (tally[r.tier] ?? 0) + 1;
  const pct = (n: number) => `${((n / results.length) * 100).toFixed(1)}%`;
  console.log(
    `\nTier distribution (UTF-8 bytes: <8192 low, <=20480 medium | depth: <=6 low, <=8 medium)` +
      `\n   low=${tally.low} (${pct(tally.low)})   medium=${tally.medium} (${pct(tally.medium)})   high=${tally.high} (${pct(tally.high)})`
  );

  // ── Boundary separation evidence ───────────────────────────────────────────
  const chars = results.map((r) => r.byteLength).sort((a, b) => a - b);
  const depths = results.map((r) => r.maxDepth).sort((a, b) => a - b);
  const median = (xs: number[]) => xs[Math.floor(xs.length / 2)];
  console.log(
    `\nbyteLength: min=${chars[0]}  median=${median(chars)}  max=${chars[chars.length - 1]}` +
      `\nmaxDepth  : min=${depths[0]}  median=${median(depths)}  max=${depths[depths.length - 1]}`
  );
  console.log(
    `boundary  : byteLength ${chars[0] < 8192 && chars[chars.length - 1] >= 8192 ? 'DOES' : 'does NOT'} ` +
      `cross 8192; maxDepth ${depths[0] !== depths[depths.length - 1] ? 'varies' : 'is CONSTANT'} across the set`
  );

  // ── Impact of the old truncation ───────────────────────────────────────────
  const multi = results.filter((r) => r.instructionSets > 1);
  const discardedSets = results.reduce((n, r) => n + Math.max(0, r.instructionSets - 1), 0);
  const discardedSteps = results.reduce((n, r) => n + r.discardedSteps, 0);
  const totalSteps = results.reduce((n, r) => n + r.totalSteps, 0);
  console.log(
    `\nOld-truncation impact across this set:` +
      `\n   recipes with >1 instruction set : ${multi.length} of ${results.length}` +
      `\n   instruction sets discarded      : ${discardedSets}` +
      `\n   steps discarded                 : ${discardedSteps} of ${totalSteps}` +
      (totalSteps ? ` (${((discardedSteps / totalSteps) * 100).toFixed(1)}%)` : '') +
      (multi.length
        ? `\n   affected recipes                : ${multi.map((m) => `${m.recipeId}(${m.instructionSets} sets)`).join(', ')}`
        : '')
  );

  // ── proto3 wire omission magnitude ─────────────────────────────────────────
  const omitted = results.reduce((n, r) => n + r.proto3Omitted, 0);
  const scalars = results.reduce((n, r) => n + r.proto3Scalars, 0);
  console.log(
    `\nproto3 default-valued scalars omitted from the wire:` +
      `\n   ${omitted} of ${scalars} scalar fields` +
      (scalars ? ` (${((omitted / scalars) * 100).toFixed(2)}%)` : '')
  );

  console.log(
    `\n${allOk ? 'PASS' : 'FAIL'} — ${results.length} recipe(s), ` +
      `${results.filter((r) => r.ok).length} identical across all three formats.`
  );
  return allOk;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const arg = (name: string): string | undefined =>
    argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

  const useFixtures = argv.includes('--fixtures');
  const capture = argv.includes('--capture');
  const base = arg('base') ?? 'http://localhost:3001';
  const idsArg = arg('ids');

  if (useFixtures) {
    const fixtures = readFixtures();
    if (fixtures.length === 0) {
      console.error(`No fixtures in ${FIXTURE_DIR}. Run with --capture against a live proxy first.`);
      process.exit(1);
    }
    const results = fixtures.map((f) => checkOne(f.recipeId, f.note, fixtureBuffers(f)));
    process.exit(report(results, `offline fixtures — ${FIXTURE_DIR}`) ? 0 : 1);
  }

  // --all covers the whole combined dataset (both strata); --limit=N takes the
  // first N. Default stays at 8 for a quick smoke check.
  const limit = argv.includes('--all')
    ? Number.MAX_SAFE_INTEGER
    : Number(arg('limit') ?? 8);

  const ids = idsArg
    ? idsArg.split(',').map((s) => Number(s.trim())).filter(Number.isFinite)
    : await fetchDatasetIds(base, limit);

  if (ids.length === 0) {
    console.error(
      'No recipe ids available. The proxy dataset is empty — this usually means ' +
        'SPOONACULAR_API_KEY is unset or still "placeholder" in dishcovery-proxy/.env.'
    );
    process.exit(1);
  }

  const results: CheckOutcome[] = [];
  for (const id of ids) {
    const buffers = {} as Record<SerializationFormat, ArrayBuffer>;
    for (const format of SERIALIZATION_FORMATS) {
      buffers[format] = await fetchFormat(base, id, format);
    }
    const outcome = checkOne(id, '', buffers);
    results.push(outcome);

    if (capture) {
      const note =
        outcome.instructionSets > 1
          ? `multi-instruction-set (${outcome.instructionSets} sets) — the case the pre-Stage-2 truncation destroyed`
          : `${outcome.instructionSets} instruction set, ${outcome.nutrients} nutrients`;
      writeFixture(id, note, buffers);
    }
  }

  if (capture) console.log(`\nCaptured ${results.length} fixture(s) to ${FIXTURE_DIR}`);
  process.exit(report(results, capture ? `live ${base} (captured)` : `live ${base}`) ? 0 : 1);
}

main().catch((err) => {
  console.error('[verify:formats] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
