/**
 * scripts/verify-offline-payloads.ts
 *
 * Checks assets/offline/payloads.json before it is shipped in the app.
 *
 *   node --experimental-strip-types scripts/verify-offline-payloads.ts [artifactDir]
 *
 * 1. Integrity: every base64 buffer decodes to bytes whose SHA-256 and length
 *    match what the file records.
 * 2. Same bytes as the proxy: a freshly started dishcovery-proxy serves exactly
 *    these bytes for all 150 payloads x 3 formats.
 * 3. Same sizes as the paper: every length equals the published
 *    dataset/payload_sizes.csv in the reproducibility package (default
 *    ../dishcovery-benchmark-artifact).
 * 4. Decodes with the app's own codecs: JSON equals the generated source file
 *    exactly, MessagePack equals JSON, Protocol Buffers decodes to the same id
 *    and title.
 * 5. No Spoonacular payload is present.
 *
 * Prints PASS or FAIL; exit code 1 on FAIL.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import path from 'node:path';

import { ROUTES, SERIALIZATION_FORMATS, isGeneratedRecipeId } from '../shared/contract.ts';
import { jsonCodec } from '../src/api/codecs/json.ts';
import { msgpackCodec } from '../src/api/codecs/msgpack.ts';
import { protobufCodec } from '../src/api/codecs/protobuf.ts';
import { startProxy } from './proxyProcess.ts';

const ROOT = path.join(import.meta.dirname, '..');
const OFFLINE_FILE = path.join(ROOT, 'assets', 'offline', 'payloads.json');
const ARTIFACT = path.resolve(process.argv[2] ?? path.join(ROOT, '..', 'dishcovery-benchmark-artifact'));
const SIZES = path.join(ARTIFACT, 'dataset', 'payload_sizes.csv');

interface Entry {
  recipeId: number;
  tier: string;
  source: string;
  wireBytes: Record<string, number>;
  sha256: Record<string, string>;
  base64: Record<string, string>;
}

const file = JSON.parse(readFileSync(OFFLINE_FILE, 'utf8')) as { count: number; entries: Entry[] };
let failures = 0;
function check(ok: boolean, label: string) {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`);
  if (!ok) failures++;
}

const toArrayBuffer = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const bytes = new Map<string, Buffer>();
for (const e of file.entries) for (const f of SERIALIZATION_FORMATS) bytes.set(`${e.recipeId}:${f}`, Buffer.from(e.base64[f], 'base64'));

// 1. Integrity
let intact = 0;
for (const e of file.entries) {
  for (const f of SERIALIZATION_FORMATS) {
    const b = bytes.get(`${e.recipeId}:${f}`)!;
    if (b.length === e.wireBytes[f] && createHash('sha256').update(b).digest('hex') === e.sha256[f]) intact++;
  }
}
check(file.count === 150 && file.entries.length === 150, `150 payloads in the file (count ${file.count}, entries ${file.entries.length})`);
check(intact === 450, `integrity: ${intact}/450 buffers match their recorded SHA-256 and length`);

// 5. Provenance
const tiers = { low: 0, medium: 0, high: 0 } as Record<string, number>;
for (const e of file.entries) tiers[e.tier]++;
check(
  file.entries.every((e) => e.source === 'generated' && isGeneratedRecipeId(e.recipeId)),
  `generated only, no Spoonacular payload (tiers: low ${tiers.low}, medium ${tiers.medium}, high ${tiers.high})`
);

// 3. Published sizes
const sizes = new Map(
  readFileSync(SIZES, 'utf8').replace(/\r\n/g, '\n').trim().split('\n').slice(1).map((line) => {
    const c = line.split(',');
    return [Number(c[0]), { tier: c[2], json: Number(c[3]), msgpack: Number(c[4]), protobuf: Number(c[5]) }] as const;
  })
);
let sizeOk = 0;
for (const e of file.entries) {
  const s = sizes.get(e.recipeId);
  for (const f of SERIALIZATION_FORMATS) {
    if (s !== undefined && s.tier === e.tier && s[f] === bytes.get(`${e.recipeId}:${f}`)!.length) sizeOk++;
  }
}
check(sizeOk === 450, `sizes and tiers: ${sizeOk}/450 match ${path.relative(ROOT, SIZES)}`);

// 4. Decoding with the app's codecs
let jsonOk = 0;
let msgpackOk = 0;
let protobufOk = 0;
for (const e of file.entries) {
  const source = JSON.parse(readFileSync(path.join(ROOT, 'fixtures', 'generated', 'payloads', `${e.recipeId}.json`), 'utf8'));
  const j = jsonCodec.decode(toArrayBuffer(bytes.get(`${e.recipeId}:json`)!));
  const m = msgpackCodec.decode(toArrayBuffer(bytes.get(`${e.recipeId}:msgpack`)!));
  const p = protobufCodec.decode(toArrayBuffer(bytes.get(`${e.recipeId}:protobuf`)!)) as { id: number; title: string };
  if (isDeepStrictEqual(j, source)) jsonOk++;
  if (isDeepStrictEqual(m, j)) msgpackOk++;
  if (Number(p.id) === source.id && p.title === source.title) protobufOk++;
}
check(jsonOk === 150, `JSON decodes to the generated source file: ${jsonOk}/150`);
check(msgpackOk === 150, `MessagePack decodes to the same object as JSON: ${msgpackOk}/150`);
check(protobufOk === 150, `Protocol Buffers decodes to the same id and title: ${protobufOk}/150`);

// 2. A fresh proxy serves the same bytes
const proxy = await startProxy(3312);
try {
  let same = 0;
  for (const e of file.entries) {
    for (const f of SERIALIZATION_FORMATS) {
      const served = Buffer.from(await (await fetch(`${proxy.baseUrl}${ROUTES.recipe(e.recipeId, f)}`)).arrayBuffer());
      if (served.equals(bytes.get(`${e.recipeId}:${f}`)!)) same++;
    }
  }
  check(same === 450, `byte-identical to a freshly started proxy: ${same}/450`);
} finally {
  proxy.stop();
}

console.log(failures === 0 ? 'PASS' : `FAIL (${failures} check${failures === 1 ? '' : 's'})`);
process.exit(failures === 0 ? 0 : 1);
