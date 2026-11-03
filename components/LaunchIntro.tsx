/**
 * components/LaunchIntro.tsx
 *
 * The launch intro (Claude Design handoff, "Launch intro"; timings in
 * docs/BRAND.md). It continues from the native splash, the mark at 200 dp
 * centred on the brand teal: this layer mounts an identical frame, and plays
 * only once that frame has laid out, the native splash has been told to hide
 * (its fade is shortened to fit inside the opening hold) and one more frame
 * has been drawn.
 *
 * First launch, about 2.2 s:
 *      0 ms   the splash frame, held
 *    300 ms   the bars rise one after another, 120 ms apart, each on a gentle
 *             spring; bars 2 and 3 fill with MessagePack and Protobuf from the
 *             base up (a wipe, not a fade: a half-opaque amber over the pale
 *             bar reads as khaki)
 *    950 ms   the mark lifts and shrinks; "Dishcovery" fades in and rises
 *   1750 ms   after a hold, the lockup fades and the teal layer slides up and
 *             off, uncovering the app, whose content rises into place (2250 ms)
 * Later launches play a short version of the same, about 1 s. A tap skips to
 * the exit. Reduce motion on, or the setting still unknown: fades only.
 *
 * SMOOTHNESS
 * ----------
 * Everything is driven by one Animated.Value, `clock`, through interpolations:
 * transform and opacity only, flat Views, native driver, started once through
 * startMotion(), and no setState until it has finished. The clock is an
 * Animated.decay, not a timing: Android's native timing driver steps through
 * values precomputed at 60 fps (FrameBasedAnimationDriver), which judders on
 * a 90 or 120 Hz screen, whereas the decay is computed from the real frame time
 * on every frame. Native interpolation takes no easing, so each curve (the
 * motion spec's beziers, and the bars' damped spring, the same equation as
 * Animated.spring's) is sampled into the interpolation's ranges. Delays are
 * positions on the clock, never JS timers.
 *
 * Only builds whose native splash is this frame play it (app.config.js sets
 * extra.brandIntro for the demo build); others show the app at once. Until the
 * intro has finished, introGate holds back startup work that routing does not
 * need.
 */

import Constants from 'expo-constants';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, useWindowDimensions, View } from 'react-native';

import { formatColors, palette } from '../constants/theme';
import { getSettings, markIntroSeen } from '../src/settings/settings';
import { markIntroDone } from '../src/ui/introGate';
import { startMotion } from '../src/ui/motionGate';
import { ease } from './motion';
import { useReduceMotion } from './useReduceMotion';

const ENABLED = Constants.expoConfig?.extra?.brandIntro === true;

// Keep the native splash up until this layer's first frame is laid out.
SplashScreen.preventAutoHideAsync().catch(() => {});
// Android fades the native splash out over 400 ms by default, on top of the
// intro; 200 ms ends inside the opening hold, before anything moves.
if (ENABLED) {
  try {
    SplashScreen.setOptions({ duration: 200, fade: true });
  } catch {
    // Not available on this platform: the default fade.
  }
}

/** The splash mark: 200 dp, from the 1024 frame of splash-icon.svg. */
const MARK = 200;
const UNIT = MARK / 1024;
/** One unit of the mark's own coordinates (its group is scaled 1.6). */
const K = 1.6 * UNIT;
/** A rectangle of the mark, in the 200 dp box. */
const at = (x: number, y: number, w: number, h: number) => ({
  position: 'absolute' as const,
  left: (512 + 1.6 * x) * UNIT,
  top: (487 + 1.6 * y) * UNIT,
  width: w * K,
  height: h * K,
});
const BAR = '#abe1e5';
const BARS = [
  { box: at(-162, -130, 84, 146), to: 1.15, tint: null },
  { box: at(-42, -250, 84, 266), to: 1.08, tint: formatColors.msgpack },
  { box: at(78, -180, 84, 196), to: 1.12, tint: formatColors.protobuf },
] as const;
/** The wordmark's top, below the centre: after the lift, and under the unmoved mark. */
const WORDMARK_TOP = { lifted: 68, still: 110 };
/** Longest the intro waits for the reduce motion setting before playing the reduced version. */
const SETTING_WAIT_MS = 120;

// ─── The timelines (ms from the start) ────────────────────────────────────────

interface Seg {
  start: number;
  dur: number;
}
interface Plan {
  reduced: boolean;
  /** When the exit begins (a tap skips to here), and when it is over. */
  exit: number;
  end: number;
  /** Per bar: its rise (and colour wipe), and the spring's natural frequency (rad/s). */
  bars: { seg: Seg; omega: number }[] | null;
  lift: Seg | null;
  word: Seg;
  lockupOut: Seg;
  /** The teal layer: slides up and off, or (reduced) fades. */
  layerOut: Seg;
  content: Seg;
}

const PLANS: Record<'full' | 'short' | 'reducedFull' | 'reducedShort', Plan> = {
  full: {
    reduced: false,
    bars: [300, 420, 540].map((start) => ({ seg: { start, dur: 500 }, omega: 14.5 })),
    lift: { start: 950, dur: 450 },
    word: { start: 950, dur: 450 },
    exit: 1750,
    lockupOut: { start: 1750, dur: 200 },
    layerOut: { start: 1750, dur: 500 },
    content: { start: 1830, dur: 420 },
    end: 2250,
  },
  short: {
    reduced: false,
    bars: [100, 160, 220].map((start) => ({ seg: { start, dur: 340 }, omega: 21 })),
    lift: { start: 340, dur: 300 },
    word: { start: 340, dur: 300 },
    exit: 700,
    lockupOut: { start: 700, dur: 150 },
    layerOut: { start: 700, dur: 300 },
    content: { start: 750, dur: 250 },
    end: 1000,
  },
  reducedFull: {
    reduced: true,
    bars: null,
    lift: null,
    word: { start: 150, dur: 400 },
    exit: 1000,
    lockupOut: { start: 1000, dur: 300 },
    layerOut: { start: 1000, dur: 300 },
    content: { start: 1050, dur: 250 },
    end: 1300,
  },
  reducedShort: {
    reduced: true,
    bars: null,
    lift: null,
    word: { start: 50, dur: 250 },
    exit: 450,
    lockupOut: { start: 450, dur: 250 },
    layerOut: { start: 450, dur: 250 },
    content: { start: 480, dur: 220 },
    end: 700,
  },
};

// ─── The clock ────────────────────────────────────────────────────────────────

/**
 * The decay's time constant (ms) and starting speed (clock units per ms). A
 * decay ends once a frame moves it less than 0.1, so the speed is high enough
 * that no frame of the intro, however short, comes near that.
 */
const TAU = 2000;
const SPEED = 100;
/** Where the clock is `ms` into the timeline: SPEED·TAU·(1 − e^(−ms/TAU)). */
const clockAt = (ms: number) => SPEED * TAU * (1 - Math.exp(-ms / TAU));
/** Past every timeline's end: everything clamps to its final value. */
const CLOCK_DONE = SPEED * TAU;
/** A skip plays the rest of the exit this many times faster. */
const SKIP_SPEED = 2;

/** Runs the clock in real time from `fromMs` into the timeline, `rate` times faster. */
const runClock = (clock: Animated.Value, fromMs: number, rate = 1) =>
  Animated.decay(clock, {
    velocity: rate * SPEED * Math.exp(-fromMs / TAU),
    deceleration: 1 - rate / TAU,
    useNativeDriver: true,
  });

/** Damped spring from 0 to 1 (the equation Animated.spring solves), damping ratio 0.55: a gentle overshoot. */
const ZETA = 0.55;
const spring = (omega: number, ms: number) => (x: number) => {
  const t = (x * ms) / 1000;
  const wd = omega * Math.sqrt(1 - ZETA * ZETA);
  return 1 - Math.exp(-ZETA * omega * t) * (Math.cos(wd * t) + ((ZETA * omega) / wd) * Math.sin(wd * t));
};

/** A curve on the clock: `from` until seg.start, `curve` across seg, `to` after. */
function along(
  clock: Animated.Value,
  seg: Seg | null,
  from: number,
  to: number,
  curve: (x: number) => number,
  samples = 16
) {
  if (seg === null) return clock.interpolate({ inputRange: [0, 1], outputRange: [from, from], extrapolate: 'clamp' });
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  for (let i = 0; i <= samples; i++) {
    const x = i / samples;
    inputRange.push(clockAt(seg.start + seg.dur * x));
    outputRange.push(i === samples ? to : from + (to - from) * curve(x));
  }
  return clock.interpolate({ inputRange, outputRange, extrapolate: 'clamp' });
}

// ─── The component ────────────────────────────────────────────────────────────

export default function LaunchIntro({ children }: { children: React.ReactNode }) {
  const window = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const [playing, setPlaying] = useState(ENABLED);
  const [reduced, setReduced] = useState<boolean | null>(null);
  /** The layer's own height once laid out: it covers the whole screen, as the native splash does. */
  const [layerHeight, setLayerHeight] = useState<number | null>(null);
  const [splashHidden, setSplashHidden] = useState(false);
  const clock = useRef(new Animated.Value(ENABLED ? 0 : CLOCK_DONE)).current;
  const run = useRef<{ t0: number; timer: ReturnType<typeof setTimeout> | null; skipped: boolean } | null>(null);
  const finishRef = useRef<(() => void) | null>(null);
  const height = layerHeight ?? window.height;

  // Read once, before anything plays: settings are loaded before this mounts (app/_layout.tsx).
  const firstLaunch = useRef(!getSettings().introSeen).current;
  const plan =
    reduced === null
      ? null
      : PLANS[reduced ? (firstLaunch ? 'reducedFull' : 'reducedShort') : firstLaunch ? 'full' : 'short'];

  // Decide the version once: as soon as the setting is known, or reduced if it is not known in time.
  useEffect(() => {
    if (!ENABLED || reduced !== null) return;
    if (reduceMotion !== null) {
      setReduced(reduceMotion);
      return;
    }
    const timer = setTimeout(() => setReduced(true), SETTING_WAIT_MS);
    return () => clearTimeout(timer);
  }, [reduceMotion, reduced]);

  // No intro in this build: nothing to wait for.
  useEffect(() => {
    if (!ENABLED) markIntroDone();
  }, []);

  // The first frame is laid out: one frame for it to be drawn, then hide the native splash.
  useEffect(() => {
    if (!ENABLED || layerHeight === null || splashHidden) return;
    const frame = requestAnimationFrame(() => {
      SplashScreen.hideAsync()
        .catch(() => {})
        .finally(() => setSplashHidden(true));
    });
    return () => cancelAnimationFrame(frame);
  }, [layerHeight, splashHidden]);

  const v = useMemo(() => {
    if (plan === null) return null;
    const slide = !plan.reduced;
    return {
      bars: BARS.map((bar, i) =>
        plan.bars === null
          ? along(clock, null, 1, 1, ease.out)
          : along(clock, plan.bars[i].seg, 1, bar.to, spring(plan.bars[i].omega, plan.bars[i].seg.dur), 24)
      ),
      // From just above 0: a zero scale is a singular transform on some platforms.
      fills: BARS.map((_, i) => along(clock, plan.bars?.[i].seg ?? null, plan.bars === null ? 1 : 0.001, 1, ease.out)),
      markY: along(clock, plan.lift, 0, -36, ease.out),
      markScale: along(clock, plan.lift, 1, 0.8, ease.out),
      word: along(clock, plan.word, 0, 1, ease.out),
      wordY: along(clock, plan.reduced ? null : plan.word, plan.reduced ? 0 : 12, 0, ease.out),
      lockup: along(clock, plan.lockupOut, 1, 0, ease.in),
      layerY: along(clock, slide ? plan.layerOut : null, 0, -height, ease.inOut),
      layer: along(clock, slide ? null : plan.layerOut, 1, 0, ease.inOut),
      content: along(clock, plan.content, 0, 1, ease.out),
      contentY: along(clock, slide ? plan.content : null, slide ? 12 : 0, 0, ease.out),
    };
  }, [plan, clock, height]);

  // Splash hidden and the version known: one more frame, then play.
  useEffect(() => {
    if (!playing || !splashHidden || plan === null || run.current !== null) return;
    const finish = () => {
      clock.stopAnimation();
      clock.setValue(CLOCK_DONE);
      if (run.current?.timer) clearTimeout(run.current.timer);
      markIntroSeen();
      setPlaying(false);
      markIntroDone();
    };
    run.current = { t0: 0, timer: null, skipped: false };
    requestAnimationFrame(() => {
      const current = run.current;
      if (current === null) return;
      current.t0 = Date.now();
      if (!startMotion(() => runClock(clock, 0).start())) {
        finish();
        return;
      }
      current.timer = setTimeout(finish, plan.end);
    });
    finishRef.current = finish;
  }, [playing, splashHidden, plan, clock]);

  // A tap anywhere: on to the exit, played twice as fast.
  const skip = () => {
    const current = run.current;
    const finish = finishRef.current;
    if (plan === null || current === null || current.t0 === 0 || current.skipped || finish === null) return;
    const from = Math.max(Date.now() - current.t0, plan.exit);
    if (from >= plan.end) return;
    current.skipped = true;
    if (current.timer) clearTimeout(current.timer);
    clock.stopAnimation();
    clock.setValue(clockAt(from));
    if (!startMotion(() => runClock(clock, from, SKIP_SPEED).start())) {
      finish();
      return;
    }
    current.timer = setTimeout(finish, (plan.end - from) / SKIP_SPEED);
  };

  useEffect(
    () => () => {
      if (run.current?.timer) clearTimeout(run.current.timer);
      clock.stopAnimation();
    },
    [clock]
  );

  const hideSplash = () => {
    SplashScreen.hideAsync().catch(() => {});
  };

  return (
    <View style={styles.fill} onLayout={ENABLED ? undefined : hideSplash}>
      <Animated.View
        style={[
          styles.fill,
          !playing ? null : { opacity: v?.content ?? 0, transform: [{ translateY: v?.contentY ?? 0 }] },
        ]}
      >
        {children}
      </Animated.View>
      {playing && (
        <Animated.View
          style={[styles.layer, v !== null && { opacity: v.layer, transform: [{ translateY: v.layerY }] }]}
          onLayout={(e) => {
            if (layerHeight === null) setLayerHeight(e.nativeEvent.layout.height);
          }}
          onTouchStart={skip}
          importantForAccessibility="no-hide-descendants"
        >
          <Animated.View style={[styles.fill, v !== null && { opacity: v.lockup }]}>
            <Animated.View
              style={[
                styles.mark,
                { top: height / 2 - MARK / 2 },
                v !== null && { transform: [{ translateY: v.markY }, { scale: v.markScale }] },
              ]}
            >
              {BARS.map((bar, i) => (
                <Animated.View
                  key={i}
                  style={[
                    bar.box,
                    styles.bar,
                    { transformOrigin: 'bottom' },
                    v !== null && { transform: [{ scaleY: v.bars[i] }] },
                  ]}
                >
                  {bar.tint !== null && (
                    <Animated.View
                      style={[
                        styles.barFill,
                        { backgroundColor: bar.tint, transformOrigin: 'bottom' },
                        { transform: [{ scaleY: v?.fills[i] ?? 0.001 }] },
                      ]}
                    />
                  )}
                </Animated.View>
              ))}
              {/* The bowl: a half ellipse (rx 220, ry 190) under the rim, then the foot. */}
              <View
                style={[
                  at(-220, 84, 440, 220),
                  styles.white,
                  { borderBottomLeftRadius: 220 * K, borderBottomRightRadius: 220 * K },
                  { transformOrigin: 'top', transform: [{ scaleY: 190 / 220 }] },
                ]}
              />
              {/* Under the rim's lower edge, so no hairline shows where the two meet. */}
              <View style={[at(-220, 74, 440, 12), styles.white]} />
              <View style={[at(-250, 40, 500, 44), styles.white, { borderRadius: 22 * K }]} />
              <View style={[at(-80, 262, 160, 38), styles.white, { borderRadius: 12 * K }]} />
            </Animated.View>
            <Animated.Text
              style={[
                styles.wordmark,
                {
                  top: height / 2 + (plan?.reduced === true ? WORDMARK_TOP.still : WORDMARK_TOP.lifted),
                  opacity: v?.word ?? 0,
                  transform: [{ translateY: v?.wordY ?? 12 }],
                },
              ]}
            >
              Dishcovery
            </Animated.Text>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  layer: { ...StyleSheet.absoluteFillObject, backgroundColor: palette.primary },
  mark: { position: 'absolute', left: '50%', marginLeft: -MARK / 2, width: MARK, height: MARK },
  bar: { backgroundColor: BAR, borderRadius: 20 * K, overflow: 'hidden' },
  barFill: { ...StyleSheet.absoluteFillObject },
  white: { backgroundColor: '#ffffff' },
  wordmark: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
});
