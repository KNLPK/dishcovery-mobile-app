/**
 * scripts/check-frozen.mjs
 *
 * Proves that nothing the published measurements depend on has changed since
 * the tag `thesis-measurement-v1` (app commit bba2d02, the measured build).
 *
 *   node scripts/check-frozen.mjs [ref]      (ref defaults to the tag)
 *
 * 1. `git diff <ref> -- <path>` must be empty for every frozen path, in the
 *    working tree, so uncommitted edits count too.
 * 2. dishcovery-proxy/server.js is not frozen as a whole, but the code that
 *    produces the measured bytes is: serializeRecipe, loadProto and the
 *    declarations they read must be character-identical to the tag.
 *
 * Exit code 0 and "FROZEN: OK" when everything matches.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const REF = process.argv[2] ?? 'thesis-measurement-v1';

const FROZEN_PATHS = [
  'src/api/measure.ts',
  'src/api/codecs',
  'shared/proto/recipe.proto',
  'shared/contract.ts', // includes BENCHMARK_CONFIG
  'src/bench', // warm-up, sentinel, drift, comparability, runner: all of it
  'fixtures/generated',
  // No package changes: the dependency set is part of the measured build.
  'package.json',
  'package-lock.json',
  'dishcovery-proxy/package.json',
  'dishcovery-proxy/package-lock.json',
];

const SERVER = 'dishcovery-proxy/server.js';
const FROZEN_FUNCTIONS = ['serializeRecipe', 'loadProto'];
const FROZEN_LINES = [
  "const { encode: encodeMsgPack } = require('@msgpack/msgpack');",
  "const protobuf = require('protobufjs');",
  "const PROTO_PATH = path.join(__dirname, '..', 'shared', 'proto', 'recipe.proto');",
  'let RecipeType;',
];

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });

let failed = false;

for (const p of FROZEN_PATHS) {
  const diff = git('diff', REF, '--', p);
  const untracked = git('ls-files', '--others', '--exclude-standard', '--', p).trim();
  const clean = diff.length === 0 && untracked.length === 0;
  console.log(`${clean ? 'ok     ' : 'CHANGED'}  git diff ${REF} -- ${p}`);
  if (!clean) {
    failed = true;
    console.log(diff.split('\n').slice(0, 20).join('\n'));
    if (untracked) console.log(`untracked: ${untracked}`);
  }
}

/** A top-level function, from its declaration to the first line that is exactly "}". */
function extractFunction(source, name) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((l) => new RegExp(`^(async )?function ${name}\\(`).test(l));
  if (start === -1) return null;
  const end = lines.findIndex((l, i) => i > start && l === '}');
  return end === -1 ? null : lines.slice(start, end + 1).join('\n');
}

const before = git('show', `${REF}:${SERVER}`);
const now = readFileSync(SERVER, 'utf8');

for (const name of FROZEN_FUNCTIONS) {
  const a = extractFunction(before, name);
  const b = extractFunction(now, name);
  const same = a !== null && a === b;
  console.log(`${same ? 'ok     ' : 'CHANGED'}  ${SERVER}: function ${name} (${a?.split('\n').length ?? 0} lines)`);
  if (!same) failed = true;
}

for (const line of FROZEN_LINES) {
  const count = (s) => s.replace(/\r\n/g, '\n').split('\n').filter((l) => l === line).length;
  const same = count(before) === 1 && count(now) === 1;
  console.log(`${same ? 'ok     ' : 'CHANGED'}  ${SERVER}: ${line}`);
  if (!same) failed = true;
}

console.log(failed ? 'FROZEN: CHANGED' : 'FROZEN: OK');
process.exit(failed ? 1 : 0);
