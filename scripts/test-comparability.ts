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
  DRIFT_LIMIT_PERCENT,
  SENTINEL_DECODES,
  assessDrift,
  driftFromSentinels,
  comparabilityReasons,
  driftReasons,
  partitionRuns,
  runGaps,
  type ComparisonReference,
} from '../src/bench/comparability.ts';
import { MIN_COOLDOWN_SECONDS, assessCooldown, runActivity, secondsRemaining } from '../src/bench/cooldown.ts';

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

/** start/end sentinel means per format; sd 0.75 ms, the post-pre-warm figure. */
function sentinels(start: Record<string, number>, end: Record<string, number>, sd = 0.75): any[] {
  const block = (at: string, m: Record<string, number>) => ({
    at, progressPercent: 0, timestamp: 0, payloadId: 1,
    perFormat: Object.entries(m).map(([format, meanMs]) => ({ format, meanMs, sd })),
  });
  return [block('start', start), block('end', end)];
}
const CLEAN = sentinels({ json: 8.43, msgpack: 6.0, protobuf: 5.0 }, { json: 8.56, msgpack: 6.09, protobuf: 5.07 });

/** Five minutes after start, the length of a real run. */
function plus5min(iso: string): string {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t + 5 * 60 * 1000).toISOString() : iso;
}

function run(
  id: string,
  startedAt: string,
  config: any,
  env: Partial<Record<string, any>> = {},
  extra: Partial<Record<string, any>> = {}
): any {
  return {
    runId: id,
    startedAt,
    finishedAt: extra.finishedAt ?? plus5min(startedAt),
    sentinels: extra.sentinels ?? CLEAN,
    cooldown: extra.cooldown,
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
const envOnly = noEnv.filter((x: string) => !x.includes('sentinel') && !x.startsWith('drift'));
check('missing environment refuses, does not throw', envOnly.length === 7, String(envOnly.length));
check('missing values print as absent', envOnly.every((x: string) => x.includes('absent')));

// ═══ THERMAL ═══

// ── drift: the protobuf-led run you reported ──
// json 8.43 -> 11.57 (+37.2%), msgpack +28.3%, protobuf +25.6%.
const hot = run('protobuf-led', '2026-10-09T03:41:50Z', good, {}, {
  finishedAt: '2026-10-09T03:46:30Z',
  sentinels: sentinels({ json: 8.43, msgpack: 6.0, protobuf: 5.0 }, { json: 11.57, msgpack: 7.698, protobuf: 6.28 }),
});
const hotDrift = assessDrift(hot)!;
check('drift: json computed', Math.abs(hotDrift.find((d) => d.format === 'json')!.driftPercent - 37.25) < 0.05,
  String(hotDrift.find((d) => d.format === 'json')!.driftPercent));
check('drift: msgpack computed', Math.abs(hotDrift.find((d) => d.format === 'msgpack')!.driftPercent - 28.3) < 0.05);
check('drift: protobuf computed', Math.abs(hotDrift.find((d) => d.format === 'protobuf')!.driftPercent - 25.6) < 0.05);
const hotReasons = comparabilityReasons(hot, ref);
check('drift: hot run REFUSED', hotReasons.length > 0, JSON.stringify(hotReasons));
check('drift: all three formats named', ['json', 'msgpack', 'protobuf'].every((f) => hotReasons.some((x: string) => x.startsWith(`drift ${f} +`))), hotReasons.join(' | '));
check('drift: reason carries sentinel values', hotReasons.some((x: string) => x.includes('8.43 -> 11.57')), hotReasons.join(' | '));
check('drift: reason carries SE and z', hotReasons.every((x: string) => !x.startsWith('drift') || (x.includes('SE ') && x.includes('z '))));
check('drift: hot run refused on drift ALONE (config and env match)', hotReasons.every((x: string) => x.startsWith('drift')), hotReasons.join(' | '));

// SE: sqrt(0.75^2/30 * 2) / 8.43 = 2.30%, so 37.2% is z ~16.
const jsonHot = hotDrift.find((d) => d.format === 'json')!;
check('drift: SE from sentinel sds', Math.abs(jsonHot.standardErrorPercent - 2.298) < 0.01, String(jsonHot.standardErrorPercent));
check('drift: z = drift / SE', Math.abs(jsonHot.z - jsonHot.driftPercent / jsonHot.standardErrorPercent) < 1e-9);

// ── clean and boundary ──
check('drift: clean 1.5% run passes', driftReasons(real1).length === 0, JSON.stringify(driftReasons(real1)));
const atLimit = run('at-limit', 't', good, {}, { sentinels: sentinels({ json: 10 }, { json: 10 * (1 + DRIFT_LIMIT_PERCENT / 100) }) });
check('drift: exactly at the limit passes', driftReasons(atLimit).length === 0, JSON.stringify(driftReasons(atLimit)));
const over = run('over', 't', good, {}, { sentinels: sentinels({ json: 10 }, { json: 10.51 }) });
check('drift: just over the limit refuses', driftReasons(over).length === 1);
const cooling = run('cooling', 't', good, {}, { sentinels: sentinels({ json: 10 }, { json: 9.0 }) });
check('drift: NEGATIVE drift beyond the limit refuses too', driftReasons(cooling).length === 1, JSON.stringify(driftReasons(cooling)));
const oneFormat = run('one', 't', good, {}, { sentinels: sentinels({ json: 10, protobuf: 5 }, { json: 10.1, protobuf: 5.5 }) });
check('drift: one format over the limit refuses the run', driftReasons(oneFormat).length === 1 && driftReasons(oneFormat)[0].startsWith('drift protobuf'));

// ── unknown drift is not zero drift ──
const noEnd = run('no-end', 't', good, {}, { sentinels: [sentinels({ json: 8 }, { json: 8 })[0]] });
check('drift: missing end sentinel refuses', driftReasons(noEnd).length === 1 && driftReasons(noEnd)[0].includes('unknown'), JSON.stringify(driftReasons(noEnd)));
check('drift: assessDrift returns null when unknown', assessDrift(noEnd) === null);

// ── the full device set: hot run joins the excluded ──
const withHot = partitionRuns([debugSep26, staleOct8, real1, hot, real2, real3], ref);
check('pool: hot run excluded alongside the two invalid ones',
  withHot.excluded.map((e: any) => e.runId).sort().join() === ['2026-09-26-debug', '2026-10-08-stale', 'protobuf-led'].sort().join(),
  withHot.excluded.map((e: any) => e.runId).join());
check('pool: still exactly the three real runs', withHot.comparable.map((a: any) => a.runId).join() === 'real-1,real-2,real-3');

// ── manual exclusion ──
const manual = [{ runId: 'protobuf-led', reason: 'Thermal: started 57 s after previous run', excludedAt: '2026-10-09T09:00:00Z' }];
const byHand = partitionRuns([real1, hot], ref, manual);
const hotEx = byHand.excluded.find((e: any) => e.runId === 'protobuf-led');
check('manual: reason recorded', hotEx !== undefined && hotEx.reasons[0].includes('Thermal: started 57 s'), JSON.stringify(hotEx));
check('manual: listed FIRST, automatic reasons kept as corroboration',
  hotEx !== undefined && hotEx.reasons[0].startsWith('excluded by hand on 2026-10-09T09:00:00Z') && hotEx.reasons.some((x: string) => x.startsWith('drift')));
const handOnly = partitionRuns([real1, real2], ref, [{ runId: 'real-2', reason: 'phone rang', excludedAt: 'x' }]);
check('manual: excludes an otherwise-clean run', handOnly.comparable.map((a: any) => a.runId).join() === 'real-1');
check('manual: unknown id is harmless', partitionRuns([real1], ref, [{ runId: 'nope', reason: 'x', excludedAt: 'x' }]).comparable.length === 1);

// ── gaps ──
const previous = run('previous', '2026-10-09T03:36:00Z', good, {}, { finishedAt: '2026-10-09T03:40:53Z' });
const gaps = runGaps([previous, hot]);
const hotGap = gaps.find((g: any) => g.runId === 'protobuf-led')!;
check('gap: 03:40:53 -> 03:41:50 is 57 s', hotGap.gapSeconds === 57, String(hotGap.gapSeconds));
check('gap: names the previous run', hotGap.previousId === 'previous' && hotGap.previousActivity === 'run');
check('gap: marked derived from timestamps', hotGap.source === 'derived');
check('gap: first run has none', gaps.find((g: any) => g.runId === 'previous')!.gapSeconds === null);
const recorded = run('recorded', '2026-10-09T05:00:00Z', good, {}, {
  cooldown: { previousActivity: 'per-cell-profile', previousId: 'per-cell', previousEndedAt: 'x', gapSeconds: 42, minimumSeconds: 600, satisfied: false, overridden: true },
});
const recGap = runGaps([previous, recorded]).find((g: any) => g.runId === 'recorded')!;
check('gap: a recorded block wins (it knows about profiles)', recGap.gapSeconds === 42 && recGap.previousActivity === 'per-cell-profile' && recGap.source === 'recorded');
check('gap: alone never refuses (cause, not effect)', comparabilityReasons(recorded, ref).length === 0, JSON.stringify(comparabilityReasons(recorded, ref)));

// ═══ COOLDOWN GUARD ═══
const at = (iso: string) => Date.parse(iso);
check('cooldown: minimum is 10 minutes', MIN_COOLDOWN_SECONDS === 600);
const none = assessCooldown([], at('2026-10-09T03:41:50Z'));
check('cooldown: nothing on record is satisfied', none.satisfied && none.gapSeconds === null && none.previousActivity === null);

const acts: any[] = [
  { kind: 'run', id: 'previous', endedAt: '2026-10-09T03:40:53Z' },
  { kind: 'cold-profile', id: 'protobuf first', endedAt: '2026-10-09T03:41:20Z' },
];
const yours = assessCooldown(acts, at('2026-10-09T03:41:50Z'));
check('cooldown: your case is NOT satisfied', yours.satisfied === false);
check('cooldown: the profile in between is the latest activity', yours.previousActivity === 'cold-profile' && yours.gapSeconds === 30, `${yours.previousActivity} ${yours.gapSeconds}`);
check('cooldown: remaining = 600 - 30', secondsRemaining(yours) === 570, String(secondsRemaining(yours)));
check('cooldown: not overridden unless asked', yours.overridden === false);
check('cooldown: override recorded when unsatisfied', assessCooldown(acts, at('2026-10-09T03:41:50Z'), true).overridden === true);
const later = assessCooldown(acts, at('2026-10-09T03:51:20Z'));
check('cooldown: exactly 10 min after is satisfied', later.satisfied && later.gapSeconds === 600, String(later.gapSeconds));
check('cooldown: override meaningless when satisfied', assessCooldown(acts, at('2026-10-09T03:51:20Z'), true).overridden === false);
check('cooldown: remaining 0 when satisfied', secondsRemaining(later) === 0);
check('cooldown: future activity ignored', assessCooldown([{ kind: 'run', id: 'f', endedAt: '2030-01-01T00:00:00Z' }], at('2026-10-09T00:00:00Z')).gapSeconds === null);
check('cooldown: garbage timestamp ignored, not thrown', assessCooldown([{ kind: 'run', id: 'g', endedAt: 'not a date' }], at('2026-10-09T00:00:00Z')).satisfied === true);

// ═══ SENTINEL LENGTH ═══
check('sentinel: 150 decodes', SENTINEL_DECODES === 150);

function reading(at: string, meanMs: number, sd: number, decodes?: number): any {
  return { at, progressPercent: 0, timestamp: 0, payloadId: 1, decodes,
    perFormat: [{ format: 'json', meanMs, sd }] };
}
// SE at 150 decodes, sd 0.75 ms on 8.43 ms: sqrt(2 x 0.5625/150)/8.43 = 1.03%.
const long = driftFromSentinels([reading('start', 8.43, 0.75, 150), reading('end', 8.56, 0.75, 150)], 30)![0];
check('sentinel: SE ~1.03% at 150', Math.abs(long.standardErrorPercent - 1.0274) < 0.005, String(long.standardErrorPercent));
check('sentinel: limit is >= 4.8 SE out at 150', DRIFT_LIMIT_PERCENT / long.standardErrorPercent >= 4.8,
  String(DRIFT_LIMIT_PERCENT / long.standardErrorPercent));
check('sentinel: decode count reported', long.sentinelDecodes === 150);
// Readings from before the count was recorded fall back to measuredIterations.
const old30 = driftFromSentinels([reading('start', 8.43, 0.75), reading('end', 8.56, 0.75)], 30)![0];
check('sentinel: legacy readings use the fallback (30)', old30.sentinelDecodes === 30 && Math.abs(old30.standardErrorPercent - 2.297) < 0.01,
  `${old30.sentinelDecodes} ${old30.standardErrorPercent}`);
const mixed = driftFromSentinels([reading('start', 8.43, 0.75, 150), reading('end', 8.56, 0.75, 30)], 30)![0];
check('sentinel: unequal counts use the n of each reading', mixed.standardErrorPercent > long.standardErrorPercent && mixed.standardErrorPercent < old30.standardErrorPercent);
check('sentinel: reports the SMALLER count', mixed.sentinelDecodes === 30);

// ── the false-refusal argument, simulated against the shipped code ──
// A clean run: true drift 0, per-decode sd 0.75 ms on 8.43 ms. Each sentinel
// mean is drawn from its sampling distribution, N(mu, sd/sqrt(n)). Seeded, so
// the result is the same on every machine.
let seed = 20261009;
function uniform(): number { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed + 0.5) / 4294967296; }
function normal(): number { return Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform()); }
function falseRefusalRate(n: number, trials: number): number {
  let refused = 0;
  for (let t = 0; t < trials; t++) {
    const se = 0.75 / Math.sqrt(n);
    const r = driftFromSentinels([
      reading('start', 8.43 + se * normal(), 0.75, n),
      reading('end', 8.43 + se * normal(), 0.75, n),
    ], n)![0];
    if (Math.abs(r.driftPercent) > DRIFT_LIMIT_PERCENT) refused++;
  }
  return refused / trials;
}
const rate30 = falseRefusalRate(30, 40000);
const rate150 = falseRefusalRate(150, 40000);
check('noise: at 30 decodes a clean format is refused ~3% of the time', rate30 > 0.02 && rate30 < 0.04, String(rate30));
check('noise: at 150 decodes essentially never', rate150 < 0.0005, String(rate150));
// 3 formats x 3 runs = 9 chances: 1 - (1 - p)^9.
const anyOf9At30 = 1 - (1 - rate30) ** 9;
check('noise: one-in-four chance of losing a good run at 30', anyOf9At30 > 0.17 && anyOf9At30 < 0.31, String(anyOf9At30));
console.log(`  [noise] per-format false refusal: ${(rate30 * 100).toFixed(2)}% at 30, ${(rate150 * 100).toFixed(3)}% at 150; ` +
  `P(any of 9) at 30 = ${(anyOf9At30 * 100).toFixed(1)}%`);

// ═══ STOPPED RUNS COUNT AS ACTIVITY ═══
const finished = runActivity({ runId: 'r1', startedAt: '2026-10-09T03:00:00Z', finishedAt: '2026-10-09T03:05:00Z' }, null);
check('stopped: finished run ends at finishedAt', finished.endedAt === '2026-10-09T03:05:00Z' && finished.id === 'r1');
const stamped = runActivity({ runId: 'r2', startedAt: '2026-10-09T04:00:00Z', finishedAt: null,
  lastCheckpointAt: '2026-10-09T04:03:10Z' }, '2026-10-09T04:09:59Z');
check('stopped: ends at its LAST CHECKPOINT', stamped.endedAt === '2026-10-09T04:03:10Z', stamped.endedAt);
check('stopped: labelled as stopped', stamped.id === 'r2 (stopped)');
const legacy = runActivity({ runId: 'r3', startedAt: '2026-10-09T05:00:00Z', finishedAt: null }, '2026-10-09T05:02:30Z');
check('stopped: legacy checkpoint falls back to file mtime', legacy.endedAt === '2026-10-09T05:02:30Z', legacy.endedAt);
const bare = runActivity({ runId: 'r4', startedAt: '2026-10-09T06:00:00Z', finishedAt: null }, null);
check('stopped: last resort is the start time', bare.endedAt === '2026-10-09T06:00:00Z');
// The hole: a run stopped 2 minutes ago must now block a new start.
const hole = assessCooldown([stamped], Date.parse('2026-10-09T04:05:10Z'));
check('stopped: a stopped run now triggers the guard', hole.satisfied === false && hole.gapSeconds === 120 && hole.previousId === 'r2 (stopped)',
  JSON.stringify(hole));

console.log(`${pass} passed, ${fails.length} failed`);
for (const f of fails) console.log(`  FAIL ${f}`);
process.exit(fails.length === 0 ? 0 : 1);
