/**
 * scripts/test-warmup.ts
 *
 * Tests the rule that decides when a decoder has settled, and how cold profiles
 * combine into the figure that sizes prewarmDecodes. Run with:
 *   npm run test:warmup
 *
 * Imports the shipped module directly; warmupRules.ts has only type imports.
 *
 * The fixtures reproduce the shapes of the three cold profiles taken on the
 * study phone: every format settles at window 2 (iteration 11) and stays within
 * about 3% of steady state, except for isolated spikes — one at window 121
 * (19.4 ms against a 15 ms baseline) and two adjacent ones at 61 and 71 for json
 * in the msgpack-led session. Under the strict rule those spikes alone produced
 * requirements of 130 and 80.
 */

import {
  PREWARM_HEADROOM,
  ROBUST_RUN_LENGTH,
  analyseSettling,
  combineProfileReports,
} from '../src/bench/warmupRules.ts';
import type { WarmupProfileReport, WarmupWindow } from '../src/bench/types.ts';

let pass = 0;
const fails: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) pass++;
  else fails.push(`${name}${detail === '' ? '' : ` — ${detail}`}`);
}

const FORMATS = ['json', 'msgpack', 'protobuf'] as const;
const CURRENT = { warmupIterations: 10, prewarmDecodes: 200 };

/**
 * 15 windows of 10 decodes. Window 1 is cold; the rest wobble within ±3% of
 * `base`. `spikes` maps a window's fromIteration to its mean.
 */
function pass150(base: number, spikes: Record<number, number> = {}, coldMean = base * 1.6): WarmupWindow[] {
  const wobble = [0, 0.02, -0.015, 0.03, -0.02, 0.01, -0.03, 0.015, -0.01, 0.025, -0.025, 0.005, 0.02, -0.005];
  const windows: WarmupWindow[] = [];
  for (let i = 0; i < 15; i++) {
    const fromIteration = i * 10 + 1;
    const spiked = spikes[fromIteration];
    const meanMs = i === 0 ? coldMean : spiked ?? base * (1 + wobble[i - 1]);
    const sdMs = i === 0 ? base * 0.3 : spiked !== undefined ? base * 0.4 : base * 0.04;
    windows.push({ fromIteration, meanMs, sdMs, cv: sdMs / meanMs, percentVsFinal: 0 });
  }
  return windows;
}

// ── 1. A clean profile: both rules agree ────────────────────────────────────
const clean = analyseSettling(pass150(15));
check('clean: strict settles at 10', clean.strict === 10, String(clean.strict));
check('clean: robust settles at 10', clean.robust === 10, String(clean.robust));
check('clean: no outliers', clean.outliers.length === 0);
check('clean: outlier cost 0', clean.outlierCost === 0);

// ── 2. Your window-121 spike: 19.4 ms against 15 ──────────────────────────────
const spike121 = analyseSettling(pass150(15, { 121: 19.4 }));
check('spike@121: STRICT inflated to 130', spike121.strict === 130, String(spike121.strict));
check('spike@121: ROBUST stays at 10', spike121.robust === 10, String(spike121.robust));
check('spike@121: the spike is listed as the outlier', spike121.outliers.length === 1 && spike121.outliers[0].fromIteration === 121,
  JSON.stringify(spike121.outliers));
check('spike@121: outlier cost 120 decodes', spike121.outlierCost === 120, String(spike121.outlierCost));
const first121 = spike121.outliers[0]?.percentVsReference ?? Number.NaN;
check('spike@121: outlier reported against steady state, ~+29%', Math.abs(first121 - 29.3) < 1.5, String(first121));

// ── 3. json in the msgpack-led session: two ADJACENT spikes at 61 and 71 ──────
const spikes6171 = analyseSettling(pass150(15, { 61: 18.5, 71: 18.0 }));
check('spikes@61,71: STRICT inflated to 80', spikes6171.strict === 80, String(spikes6171.strict));
check('spikes@61,71: ROBUST stays at 10 (a run of 2 < 3)', spikes6171.robust === 10, String(spikes6171.robust));
check('spikes@61,71: both listed', spikes6171.outliers.map((o) => o.fromIteration).join() === '61,71');

// ── 4. A SUSTAINED shift is not an interruption ───────────────────────────────
// Three consecutive windows out of band is what unfinished warm-up looks like.
const sustained = analyseSettling(pass150(15, { 61: 18.5, 71: 18.2, 81: 18.0 }));
check(`sustained (${ROBUST_RUN_LENGTH} windows): robust does NOT tolerate it`, sustained.robust === 90, String(sustained.robust));
check('sustained: strict agrees', sustained.strict === 90, String(sustained.strict));
check('sustained: no outliers once past it', sustained.outliers.length === 0);

// ── 5. A spike in the FINAL window poisons the strict reference ───────────────
const finalSpike = analyseSettling(pass150(15, { 141: 19.4 }));
check('final spike: strict collapses to the last window (140)', finalSpike.strict === 140, String(finalSpike.strict));
check('final spike: robust unaffected, 10', finalSpike.robust === 10, String(finalSpike.robust));
check('final spike: robust reference is ~15, not 19.4',
  finalSpike.referenceMeanMs !== null && Math.abs(finalSpike.referenceMeanMs - 15) < 0.5, String(finalSpike.referenceMeanMs));

// ── 6. A profile that never settles must not be called settled ────────────────
// Steady decline across the whole pass: no plateau anywhere.
const declining: WarmupWindow[] = Array.from({ length: 15 }, (_, i) => ({
  fromIteration: i * 10 + 1, meanMs: 30 - i, sdMs: 0.5, cv: 0.5 / (30 - i), percentVsFinal: 0,
}));
const never = analyseSettling(declining);
check('declining: robust refuses to call it settled', never.robust === null, String(never.robust));
check('declining: strict is fooled into the last window', never.strict === 140, String(never.strict));

// ── 7. Degenerate input ───────────────────────────────────────────────────────
const empty = analyseSettling([]);
check('empty: all null, no throw', empty.strict === null && empty.robust === null && empty.outliers.length === 0);

// ── 8. Combining your three sessions ─────────────────────────────────────────
function report(lead: (typeof FORMATS)[number], windows: Partial<Record<string, WarmupWindow[]>>,
  storedStrict: Partial<Record<string, number>> = {}): WarmupProfileReport {
  const order = [lead, ...FORMATS.filter((f) => f !== lead)];
  return {
    leadFormat: lead,
    environment: { buildType: 'release', executionEnvironment: 'storeClient', standalone: false,
      hermesVersion: null, reactNativeVersion: '0.79.2', device: null },
    order,
    startedAt: '2026-10-09T03:00:00Z',
    payloadId: 1,
    tier: 'high',
    iterations: 150,
    windowSize: 10,
    profiles: order.map((format, i) => ({
      format,
      windows: windows[format] ?? pass150(15),
      // Profiles saved before the robust rule carry only the strict figure.
      recommendedWarmup: storedStrict[format] ?? 10,
      positionInOrder: i + 1,
    })),
    recommendedWarmup: null,
    currentWarmup: 10,
    note: '',
  };
}

const sessions = [
  report('json', {}),
  report('msgpack', { json: pass150(15, { 61: 18.5, 71: 18.0 }) }, { json: 80 }),
  report('protobuf', { protobuf: pass150(15, { 121: 19.4 }) }, { protobuf: 130 }),
];
const series = combineProfileReports(sessions, FORMATS, CURRENT);

check('combine: robust cold requirement 10', series.coldRequirement === 10, String(series.coldRequirement));
check('combine: strict cold requirement 130', series.coldRequirementStrict === 130, String(series.coldRequirementStrict));
check('combine: all orderings present', series.missingLeads.length === 0);
check('combine: prewarm stays 200 (2 x 10 rounds to 50, floored at current)', series.recommendedPrewarm === 200,
  String(series.recommendedPrewarm));
check('combine: headroom carried', series.prewarmHeadroom === PREWARM_HEADROOM);

const json = series.perFormat.find((f) => f.format === 'json')!;
check('combine: json max strict 80 (from msgpack-led)', json.maxStrict === 80, String(json.maxStrict));
check('combine: json max robust 10', json.maxRecommended === 10, String(json.maxRecommended));
check('combine: json outliers attributed to msgpack-led session',
  json.observations.find((o) => o.leadFormat === 'msgpack')?.outliers.map((w) => w.fromIteration).join() === '61,71');
const pb = series.perFormat.find((f) => f.format === 'protobuf')!;
check('combine: protobuf cold strict 130, cold robust 10', pb.coldStrict === 130 && pb.coldRecommended === 10,
  `${pb.coldStrict}/${pb.coldRecommended}`);
check('combine: note states both figures', series.note.includes('Robust requirement 10') && series.note.includes('gives 130'), series.note);
check('combine: note counts 3 outlier windows', series.note.includes('3 outlier window'), series.note);

// Recomputed from windows, NOT read from the stored figure: a stored strict 130
// on clean windows must not leak into either result.
const lying = combineProfileReports([report('json', {}, { json: 130 })], FORMATS, CURRENT);
check('combine: recomputes from stored windows, ignores the stored figure',
  lying.coldRequirement === 10 && lying.coldRequirementStrict === 10, `${lying.coldRequirement}/${lying.coldRequirementStrict}`);

// A large robust requirement still raises the pre-warm.
const slow = combineProfileReports([report('protobuf', { protobuf: pass150(15, { 11: 30, 21: 28, 31: 26, 41: 24, 51: 22, 61: 20, 71: 18, 81: 17 }) })], FORMATS, CURRENT);
check('combine: a genuinely slow warm-up still shows', (slow.coldRequirement ?? 0) >= 80, String(slow.coldRequirement));
check('combine: and lifts prewarm above 200 when needed', (slow.recommendedPrewarm ?? 0) >= 200, String(slow.recommendedPrewarm));

console.log(`${pass} passed, ${fails.length} failed`);
for (const f of fails) console.log(`  FAIL ${f}`);
process.exit(fails.length === 0 ? 0 : 1);
