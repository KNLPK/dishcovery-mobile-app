/**
 * components/LaunchIntro.tsx
 *
 * The launch intro (Claude Design handoff, "Launch intro"; timings in
 * docs/BRAND.md). It continues from the native splash, the mark at 200 dp
 * centred on the brand teal: this layer mounts an identical frame, hides the
 * native splash on its first layout, then plays.
 *
 *   200 ms   the bars rise from their base, 100 ms apart; bars 2 and 3 fill
 *            with MessagePack and Protobuf from the base up (a wipe, not a
 *            fade: a half-opaque amber over the pale bar reads as khaki)
 *   700 ms   the mark moves up 36 dp and settles at 0.8×
 *   850 ms   "Dishcovery" fades in and rises 12 dp, then the lockup holds
 *  1650 ms   the lockup fades; the teal layer slides up and off, uncovering
 *            the app, whose content rises 12 dp into place (2050 ms)
 *
 * With reduce motion on, or while the setting is still unknown, nothing moves:
 * the wordmark fades in under the mark, then the whole layer cross-fades with
 * the app (1300 ms). Transform and opacity only, flat Views, native driver,
 * started through startMotion().
 *
 * Only builds whose native splash is this frame play it (app.config.js sets
 * extra.brandIntro for the demo build); others show the app at once.
 */

import Constants from 'expo-constants';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, useWindowDimensions, View } from 'react-native';

import { formatColors, palette } from '../constants/theme';
import { startMotion } from '../src/ui/motionGate';
import { ease } from './motion';
import { useReduceMotion } from './useReduceMotion';

// Keep the native splash up until the first frame of this layer (or the app) is laid out.
SplashScreen.preventAutoHideAsync().catch(() => {});

const ENABLED = Constants.expoConfig?.extra?.brandIntro === true;

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
  { box: at(-162, -130, 84, 146), to: 1.15, delay: 200, tint: null },
  { box: at(-42, -250, 84, 266), to: 1.08, delay: 300, tint: formatColors.msgpack },
  { box: at(78, -180, 84, 196), to: 1.12, delay: 400, tint: formatColors.protobuf },
] as const;
/** The wordmark's top, below the window's centre: after the lift, and under the unmoved mark. */
const WORDMARK_TOP = { lifted: 68, still: 110 };
/** Longest the intro waits for the reduce motion setting before playing the reduced version. */
const SETTING_WAIT_MS = 120;

export default function LaunchIntro({ children }: { children: React.ReactNode }) {
  const { height } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const [playing, setPlaying] = useState(ENABLED);
  const [reduced, setReduced] = useState<boolean | null>(null);
  const started = useRef(false);

  const v = useMemo(
    () => ({
      bars: BARS.map(() => new Animated.Value(1)),
      tints: BARS.map(() => new Animated.Value(0)),
      markY: new Animated.Value(0),
      markScale: new Animated.Value(1),
      word: new Animated.Value(0),
      wordY: new Animated.Value(12),
      lockup: new Animated.Value(1),
      layerY: new Animated.Value(0),
      layer: new Animated.Value(1),
      content: new Animated.Value(ENABLED ? 0 : 1),
      contentY: new Animated.Value(ENABLED ? 12 : 0),
    }),
    []
  );

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

  useEffect(() => {
    if (!playing || reduced === null || started.current) return;
    started.current = true;
    const t = (value: Animated.Value, toValue: number, delay: number, duration: number, easing = ease.out) =>
      Animated.timing(value, { toValue, delay, duration, easing, useNativeDriver: true });
    const timeline = reduced
      ? Animated.parallel([
          t(v.word, 1, 150, 400),
          t(v.layer, 0, 1000, 300, ease.inOut),
          t(v.content, 1, 1050, 250),
        ])
      : Animated.parallel([
          ...BARS.map((bar, i) => t(v.bars[i], bar.to, bar.delay, 500)),
          ...BARS.map((bar, i) => t(v.tints[i], 1, bar.delay, 500)),
          t(v.markY, -36, 700, 500),
          t(v.markScale, 0.8, 700, 500),
          t(v.word, 1, 850, 450),
          t(v.wordY, 0, 850, 450),
          t(v.lockup, 0, 1650, 200, ease.in),
          t(v.layerY, -height, 1700, 350, ease.inOut),
          t(v.content, 1, 1780, 270),
          t(v.contentY, 0, 1780, 270),
        ]);
    const finish = () => {
      v.content.setValue(1);
      v.contentY.setValue(0);
      setPlaying(false);
    };
    if (!startMotion(() => timeline.start(finish))) finish();
    return () => timeline.stop();
  }, [playing, reduced, height, v]);

  // From just above 0: a zero scale is a singular transform on some platforms.
  const fills = useMemo(() => v.tints.map((x) => x.interpolate({ inputRange: [0, 1], outputRange: [0.001, 1] })), [v]);

  const hideSplash = () => {
    SplashScreen.hideAsync().catch(() => {});
  };

  return (
    <View style={styles.fill} onLayout={ENABLED ? undefined : hideSplash}>
      <Animated.View style={[styles.fill, { opacity: v.content, transform: [{ translateY: v.contentY }] }]}>
        {children}
      </Animated.View>
      {playing && (
        <Animated.View
          style={[styles.layer, { opacity: v.layer, transform: [{ translateY: v.layerY }] }]}
          onLayout={hideSplash}
          importantForAccessibility="no-hide-descendants"
        >
          <Animated.View style={[styles.fill, { opacity: v.lockup }]}>
            <Animated.View
              style={[
                styles.mark,
                { top: height / 2 - MARK / 2, transform: [{ translateY: v.markY }, { scale: v.markScale }] },
              ]}
            >
              {BARS.map((bar, i) => (
                <Animated.View
                  key={i}
                  style={[bar.box, styles.bar, { transformOrigin: 'bottom', transform: [{ scaleY: v.bars[i] }] }]}
                >
                  {bar.tint !== null && (
                    <Animated.View
                      style={[
                        styles.barFill,
                        { backgroundColor: bar.tint, transformOrigin: 'bottom', transform: [{ scaleY: fills[i] }] },
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
                  top: height / 2 + (reduced === true ? WORDMARK_TOP.still : WORDMARK_TOP.lifted),
                  opacity: v.word,
                  transform: [{ translateY: reduced === true ? 0 : v.wordY }],
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
