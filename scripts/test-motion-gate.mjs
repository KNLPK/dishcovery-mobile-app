/**
 * scripts/test-motion-gate.mjs
 *
 * No animation may start while the Quick test is measuring (src/ui/motionGate.ts).
 *
 *   node --experimental-strip-types --disable-warning=ExperimentalWarning \
 *     --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
 *     --import ./scripts/node-rn/register.mjs scripts/test-motion-gate.mjs
 *
 * 1. Runs the real Quick test (offline payloads) while, from every progress
 *    callback and from a timer firing on every UI yield, something keeps trying
 *    to start an animation and raise a toast, the way a skeleton loop, a fade
 *    or a network-error toast on a screen underneath would. None may start
 *    between the gate closing and opening; the toast must wait for the end.
 * 2. The gate opens again when a run is stopped and when it fails.
 * 3. Source check: animations exist only in components/motion.tsx,
 *    components/ToastHost.tsx, components/BrandLoader.tsx,
 *    components/LaunchIntro.tsx, components/Sheet.tsx and app/welcome.tsx
 *    (the onboarding steps),
 *    all on the native driver, each started through startMotion(); no
 *    LayoutAnimation or Reanimated animation anywhere else.
 *    The unused Expo template components (HelloWave, ParallaxScrollView,
 *    HapticTab) are left out, and checked to be imported nowhere.
 *
 * 4. The brand loader (src/ui/loaderMotion.ts, components/BrandLoader.tsx):
 *    its frame rules; a real Quick test run with a loader on screen, which
 *    must show the paused frame at every progress report and start nothing
 *    until the run ends; and in the component, only transform and opacity
 *    animated, the reduce motion setting read, the gate followed.
 *
 * Prints PASS or FAIL; exit code 1 on FAIL.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.join(import.meta.dirname, '..');
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const gate = await import(at('src/ui/motionGate.ts'));
const toast = await import(at('src/ui/toast.ts'));
const { runQuickTest } = await import(at('src/quick/quickTest.ts'));
const loader = await import(at('src/ui/loaderMotion.ts'));
const ok = (c, m) => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`);
  if (!c) process.exitCode = 1;
};

// ── 1. A full run, with something trying to animate throughout ──
const transitions = [];
let closedAt = null;
let openedAt = null;
gate.subscribeMeasuring((on) => {
  transitions.push(on);
  if (on) closedAt = gate.motionStats();
  else openedAt = gate.motionStats();
});

let attempts = 0;
let startedDuringRun = 0;
let progressWhileOpen = 0;
let measuringEvents = 0;
const tryToAnimate = () => {
  attempts++;
  if (gate.startMotion(() => {})) startedDuringRun++;
};
// A "skeleton loop" on a screen underneath: ticks whenever the run yields.
const ticker = setInterval(tryToAnimate, 0);

ok(gate.isMeasuring() === false && gate.startMotion(() => {}), 'before the run: gate open, animations start');
const shownBefore = toast.currentToast();
let raised = false;

const result = await runQuickTest({
  source: { kind: 'offline' },
  onProgress: (p) => {
    if (!gate.isMeasuring()) progressWhileOpen++;
    if (p.phase === 'measuring') measuringEvents++;
    tryToAnimate();
    if (!raised) {
      toast.showToast({ kind: 'error', message: 'raised mid-run' });
      raised = true;
    }
  },
});
clearInterval(ticker);

ok(result !== null && result.cells.length === 9, `the run completed (${result?.cells.length} cells)`);
ok(JSON.stringify(transitions) === '[true,false]', `gate closed once and opened once (${JSON.stringify(transitions)})`);
ok(progressWhileOpen === 0, `gate closed at every progress report (${measuringEvents} while measuring)`);
ok(
  attempts > measuringEvents && startedDuringRun === 0,
  `${attempts} attempts to start an animation during the run, ${startedDuringRun} started`
);
ok(
  closedAt !== null && openedAt !== null && openedAt.started === closedAt.started && openedAt.blocked - closedAt.blocked === attempts,
  closedAt === null || openedAt === null
    ? "motion counters: the gate never closed and reopened"
    : `motion counters: started +${openedAt.started - closedAt.started}, blocked +${openedAt.blocked - closedAt.blocked}`
);
const shown = toast.currentToast();
ok(
  shownBefore === null && shown?.message === 'raised mid-run' && toast.heldToast() === null,
  'a toast raised mid-run was held back and shown once the run ended'
);
ok(gate.isMeasuring() === false && gate.startMotion(() => {}), 'after the run: gate open, animations start again');

// ── 2. Stopped and failed runs open the gate too ──
let stopAfter = 0;
const stopped = await runQuickTest({
  source: { kind: 'offline' },
  onProgress: (p) => {
    if (p.phase === 'measuring') stopAfter++;
  },
  shouldStop: () => stopAfter >= 3,
});
ok(stopped === null && gate.isMeasuring() === false, 'stopped run: returns null, gate open again');

let threw = false;
try {
  await runQuickTest({ source: { kind: 'server', baseUrl: 'http://127.0.0.1:9' } });
} catch {
  threw = true;
}
ok(threw && gate.isMeasuring() === false, 'failed run (unreachable server): throws, gate open again');

// ── 3. Source check ──
const files = [];
(function walk(dir) {
  for (const e of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel);
    else if (/\.(tsx?|jsx?)$/.test(e.name)) files.push(rel);
  }
})('app');
const TEMPLATE = ['components/HelloWave.tsx', 'components/ParallaxScrollView.tsx', 'components/HapticTab.tsx'];
for (const dir of ['components', 'src']) {
  (function walk(d) {
    for (const e of readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      const rel = `${d}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.(tsx?|jsx?)$/.test(e.name) && !rel.includes('/generated/') && !TEMPLATE.includes(rel)) files.push(rel);
    }
  })(dir);
}

const ANIMATION_FILES = [
  'components/motion.tsx',
  'components/ToastHost.tsx',
  'components/BrandLoader.tsx',
  'components/LaunchIntro.tsx',
  'components/Sheet.tsx',
  'app/welcome.tsx',
];
const startsAnimation = /Animated\.(timing|spring|decay|loop)\(/;
const outside = files.filter((f) => !ANIMATION_FILES.includes(f) && startsAnimation.test(readFileSync(path.join(ROOT, f), 'utf8')));
ok(outside.length === 0, `animations only in ${ANIMATION_FILES.join(' and ')}${outside.length ? ` (also in ${outside.join(', ')})` : ''}`);

const elsewhere = files.filter((f) =>
  /LayoutAnimation|withTiming|withSpring|withRepeat|withDecay|useAnimatedStyle|entering=|exiting=/.test(
    readFileSync(path.join(ROOT, f), 'utf8')
  )
);
ok(elsewhere.length === 0, `no LayoutAnimation or Reanimated animations${elsewhere.length ? ` (found in ${elsewhere.join(', ')})` : ''}`);

for (const f of ANIMATION_FILES) {
  const src = readFileSync(path.join(ROOT, f), 'utf8');
  const drivers = [...src.matchAll(/useNativeDriver:\s*(\w+)/g)].map((m) => m[1]);
  const timings = [...src.matchAll(/Animated\.(timing|spring|decay)\(/g)].length;
  ok(drivers.length === timings && drivers.every((d) => d === 'true'), `${f}: ${timings} animations, all useNativeDriver: true`);
  // Every .start( must be inside a startMotion(() => ...) call that opens shortly before it.
  const unguarded = [...src.matchAll(/\.start\(/g)].filter((m) => {
    const before = src.slice(Math.max(0, m.index - 160), m.index);
    return !/startMotion\(\(\) =>[^;]*$/.test(before);
  });
  ok(unguarded.length === 0, `${f}: every animation starts through startMotion()`);
}

// Haptics are motion too: only through tapHaptic() in motion.tsx.
const haptics = files.filter((f) => f !== 'components/motion.tsx' && readFileSync(path.join(ROOT, f), 'utf8').includes('expo-haptics'));
ok(haptics.length === 0, `haptics only through tapHaptic()${haptics.length ? ` (also in ${haptics.join(', ')})` : ''}`);

const templateUsed = TEMPLATE.filter((t) => {
  const name = path.basename(t, '.tsx');
  return files.some((f) => new RegExp(`from ['"][^'"]*/${name}['"]`).test(readFileSync(path.join(ROOT, f), 'utf8')));
});
ok(templateUsed.length === 0, `unused template components imported nowhere${templateUsed.length ? ` (used: ${templateUsed.join(', ')})` : ''}`);

// ── 4. The brand loader ──
const frames = [];
for (const paused of [false, true]) {
  for (const reduceMotion of [false, true]) {
    for (const measuring of [false, true]) frames.push(loader.loaderFrame({ paused, reduceMotion, measuring }));
  }
}
ok(
  JSON.stringify(frames) === JSON.stringify(['moving', 'paused', 'reduced', 'paused', 'paused', 'paused', 'paused', 'paused']),
  `loader frames: moving or reduced only while the gate is open and the screen has not paused it (${frames.join(', ')})`
);

// A loader on screen during a real run, playing the way BrandLoader does:
// on every frame change it stops, and starts its loop through startMotion().
const shownFrames = [];
let loaderStarts = 0;
let loaderRefused = 0;
let pausedAtEveryReport = true;
let current = null;
const stopFollowing = loader.followMotionGate({ paused: false, reduceMotion: false }, (frame) => {
  current = frame;
  shownFrames.push(frame);
  if (frame === 'paused') return;
  if (gate.startMotion(() => {})) loaderStarts++;
  else loaderRefused++;
});
const startsBefore = loaderStarts;
const loaderRun = await runQuickTest({
  source: { kind: 'offline' },
  onProgress: () => {
    if (current !== 'paused') pausedAtEveryReport = false;
  },
});
stopFollowing();
ok(loaderRun !== null && pausedAtEveryReport, 'loader during a run: the paused frame at every progress report');
ok(
  JSON.stringify(shownFrames) === '["moving","paused","moving"]' && loaderStarts - startsBefore === 1 && loaderRefused === 0,
  `loader during a run: moving → paused when the gate closed → moving after it (${shownFrames.join(' → ')}), ` +
    `started again once, refused ${loaderRefused}`
);

const reducedFrames = [];
const stopReduced = loader.followMotionGate({ paused: false, reduceMotion: true }, (f) => reducedFrames.push(f));
gate.setMeasuring(true);
gate.setMeasuring(false);
stopReduced();
const pausedFrames = [];
const stopPaused = loader.followMotionGate({ paused: true, reduceMotion: false }, (f) => pausedFrames.push(f));
gate.setMeasuring(true);
gate.setMeasuring(false);
stopPaused();
ok(
  reducedFrames.join() === 'reduced,paused,reduced' && pausedFrames.every((f) => f === 'paused'),
  `reduce motion: ${reducedFrames.join(' → ')}; paused by the screen: ${pausedFrames.join(' → ')}`
);

const loaderSrc = readFileSync(path.join(ROOT, 'components/BrandLoader.tsx'), 'utf8');
// Every animated value in the JSX is bound to opacity, scaleY or translateY: the
// last style key before each use on its line.
const jsx = loaderSrc.slice(loaderSrc.indexOf('accessibilityLabel={label}'), loaderSrc.indexOf('function cycle('));
const bindings = [];
for (const name of ['scales[i]', 'steamOpacity', 'steamRise', 'pulse']) {
  for (const line of jsx.split(/\r?\n/).filter((l) => l.includes(name))) {
    const keys = [...line.slice(0, line.indexOf(name)).matchAll(/(\w+):/g)];
    bindings.push(`${keys.at(-1)?.[1]}: ${name}`);
  }
}
const misuse = bindings.filter((b) => !/^(opacity|scaleY|translateY):/.test(b));
ok(
  bindings.length === 4 && misuse.length === 0,
  `BrandLoader animates only opacity, scaleY and translateY (${bindings.join('; ')})`
);
const reduceSrc = readFileSync(path.join(ROOT, 'components/useReduceMotion.ts'), 'utf8');
ok(
  /AccessibilityInfo\.isReduceMotionEnabled\(\)/.test(reduceSrc) && /reduceMotionChanged/.test(reduceSrc) &&
    /useReduceMotion\(\)/.test(loaderSrc) && /followMotionGate\(/.test(loaderSrc),
  'BrandLoader reads the reduce motion setting (useReduceMotion), follows its changes and the motion gate'
);
