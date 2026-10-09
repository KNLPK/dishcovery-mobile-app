/**
 * scripts/test-comparability.ts
 *
 * Tests the rule that decides which benchmark runs may be pooled for between-run
 * variation. Run with:  npm run test:comparability
 *
 * Imports the shipped module directly. comparability.ts has only type imports,
 * so it loads under Node's type stripping without Expo or React Native.
 *
 * The fixtures are the runs actually on the study phone: the 2026-09-26 debug
 * pass, the 2026-10-08 stale-bundle release run (warmupIterations 3, no
 * pre-warm), and three valid runs. The two defects under test:
 *   - config was not a refusal criterion, so the 10-08 run would be pooled;
 *   - the reference was the OLDEST run, so the debug pass would become the
 *     reference and the three valid runs would be the ones excluded.
 */

import {
  comparabilityReasons,
  partitionRuns,
  type ComparisonReference,
} from '../src/bench/comparability.ts';

let pass = 0;
const fails: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) pass++;
  else fails.push(`${name}${detail === '' ? '' : ` — ${detail}`}`);
}

// The reference: the APK build the three real runs come from.
const ref: ComparisonReference = {
  config: { prewarmDecodes: 200, warmupIterations: 10, measuredIterations: 30 },
  environment: {
    buildType: 'release', executionEnvironment: 'standalone', deviceModel: 'SM-A546E',
    reactNativeVersion: '0.79.2', hermesVersion: '0.12.0', protobufjs: '8.8.0', msgpack: '3.1.2',
  },
};

function run(id: string, startedAt: string, config: any, env: Partial<Record<string, any>> = {}): any {
  return {
    runId: id,
    startedAt,
    config,
    environment: {
      buildType: env.buildType ?? 'release',
      executionEnvironment: env.executionEnvironment ?? 'standalone',
      device: { model: env.deviceModel ?? 'SM-A546E' },
      runtime: { reactNativeVersion: env.rn ?? '0.79.2', hermesVersion: env.hermes ?? '0.12.0' },
      libraries: { protobufjs: env.pbjs ?? '8.8.0', msgpack: env.msgpack ?? '3.1.2' },
    },
  };
}

const good = { prewarmDecodes: 200, warmupIterations: 10, measuredIterations: 30 };

// The runs actually on the study phone, oldest first.
const debugSep26 = run('2026-09-26-debug', '2026-09-26T10:00:00Z',
  { warmupIterations: 3, measuredIterations: 30 },
  { buildType: 'debug', executionEnvironment: 'storeClient' });
const staleOct8 = run('2026-10-08-stale', '2026-10-08T09:00:00Z',
  { warmupIterations: 3, measuredIterations: 30 },
  { executionEnvironment: 'storeClient' });
const real1 = run('real-1', '2026-10-10T09:00:00Z', good);
const real2 = run('real-2', '2026-10-11T09:00:00Z', good);
const real3 = run('real-3', '2026-10-12T09:00:00Z', good);

// ── the hole you named: release, warmup 3, would pass an environment check ──
const releaseStale = run('release-warmup-3', '2026-10-08T09:00:00Z',
  { warmupIterations: 3, measuredIterations: 30 });  // same env as ref, old config
const r = comparabilityReasons(releaseStale, ref);
check('release + warmup 3 is REFUSED', r.length > 0, JSON.stringify(r));
check('names warmupIterations with both values', r.some((x: string) => x.includes('warmupIterations 3 vs 10')), r.join(' | '));
check('names missing prewarmDecodes as absent', r.some((x: string) => x.includes('prewarmDecodes absent vs 200')), r.join(' | '));
check('explains what absent pre-warm means', r.some((x: string) => x.includes('had none')));
check('environment matched, so ONLY config is blamed', r.every((x: string) => x.startsWith('config.')), r.join(' | '));

// ── each config field independently ──
for (const [field, value] of [['prewarmDecodes', 100], ['warmupIterations', 2], ['measuredIterations', 20]] as const) {
  const one = comparabilityReasons(run(`only-${field}`, 't', { ...good, [field]: value }), ref);
  check(`${field} alone refuses`, one.length === 1, JSON.stringify(one));
  check(`${field} reason names the field`, one[0]?.startsWith(`config.${field} ${value} vs`), one[0]);
}

// ── a matching run passes, with zero reasons ──
check('identical run passes', comparabilityReasons(real1, ref).length === 0, JSON.stringify(comparabilityReasons(real1, ref)));

// ── environment differences still refuse ──
const dbg = comparabilityReasons(debugSep26, ref);
check('debug run refused', dbg.length > 0);
check('debug: buildType named', dbg.some((x: string) => x.includes('buildType debug vs release')), dbg.join(' | '));
check('debug: execution environment named', dbg.some((x: string) => x.includes('executionEnvironment storeClient vs standalone')));
check('debug: config also named, not hidden behind env', dbg.some((x: string) => x.startsWith('config.warmupIterations')));
check('library version change refuses', comparabilityReasons(run('pb', 't', good, { pbjs: '8.9.0' }), ref).some((x: string) => x.includes('libraries.protobufjs 8.8.0')) === false &&
  comparabilityReasons(run('pb', 't', good, { pbjs: '8.9.0' }), ref).some((x: string) => x.includes('libraries.protobufjs 8.9.0 vs 8.8.0')));
check('device change refuses', comparabilityReasons(run('dev', 't', good, { deviceModel: 'Pixel 7' }), ref).length === 1);

// ── THE ORDERING DEFECT: oldest run must not become the reference ──
const all = [debugSep26, staleOct8, real1, real2, real3];  // oldest first, as compareRuns sorts
const { comparable, excluded } = partitionRuns(all, ref);
check('exactly the three real runs are pooled', comparable.map((a: any) => a.runId).join() === 'real-1,real-2,real-3',
  comparable.map((a: any) => a.runId).join());
check('both invalid runs excluded', excluded.map((e: any) => e.runId).join() === '2026-09-26-debug,2026-10-08-stale',
  excluded.map((e: any) => e.runId).join());
check('excluded entries carry startedAt', excluded.every((e: any) => typeof e.startedAt === 'string' && e.startedAt.length > 0));
check('excluded entries carry reasons', excluded.every((e: any) => e.reasons.length > 0));

// Same answer in any order — the result must not depend on which run is first.
const shuffled = partitionRuns([real2, staleOct8, real3, debugSep26, real1], ref);
check('order-independent: same pooled set',
  shuffled.comparable.map((a: any) => a.runId).sort().join() === 'real-1,real-2,real-3');
check('order-independent: same excluded set',
  shuffled.excluded.map((e: any) => e.runId).sort().join() === '2026-09-26-debug,2026-10-08-stale');

// ── robustness against aggregates written by older code ──
const noConfig = comparabilityReasons({ runId: 'x', startedAt: 't', environment: debugSep26.environment } as any, ref);
check('missing config block refuses, does not throw', noConfig.filter((x: string) => x.startsWith('config.')).length === 3, noConfig.join(' | '));
const noEnv = comparabilityReasons({ runId: 'y', startedAt: 't', config: good } as any, ref);
check('missing environment refuses, does not throw', noEnv.length === 7, String(noEnv.length));
check('missing values print as absent', noEnv.every((x: string) => x.includes('absent')));

console.log(`${pass} passed, ${fails.length} failed`);
for (const f of fails) console.log(`  FAIL ${f}`);
process.exit(fails.length === 0 ? 0 : 1);
