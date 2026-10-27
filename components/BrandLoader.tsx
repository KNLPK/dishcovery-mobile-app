/**
 * components/BrandLoader.tsx
 *
 * The brand loader, "the rising bowl", from the Claude Design handoff (its
 * geometry and motion spec are written down in docs/BRAND.md): three
 * format bars (JSON, MessagePack, Protocol Buffers) fill one after another
 * above the bowl, let off a wisp of steam, then sink back together. 1600 ms,
 * seamless.
 *
 *   size     24 inside buttons, 48 for list and card waits, 96 full screen
 *   tone     'light' on light grounds, 'dark' on the brand teal (#20515a)
 *   paused   the paused frame: bars at rest, no steam
 *
 * Drawn with plain Views in the design's 96-unit frame (every value times
 * size / 96), so it needs no SVG library. Only transform (scaleY, translateY)
 * and opacity are animated, all on the native driver: one value runs 0 → 1600
 * ms and each layer interpolates the keyframes of the motion spec. The native
 * driver cannot apply an easing inside an interpolation, so each easing
 * segment is sampled into short linear steps (keyframes() below).
 *
 * Which frame it shows comes from src/ui/loaderMotion.ts: the paused frame
 * while the Quick test is measuring (motionGate) and until the system's reduce
 * motion setting is known; with reduce motion on, the bars hold the icon
 * heights and the whole mark only pulses its opacity.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';

import { startMotion } from '../src/ui/motionGate';
import { followMotionGate, type LoaderFrame } from '../src/ui/loaderMotion';

export type BrandLoaderSize = 24 | 48 | 96;

const TONES = {
  light: { stroke: '#20515a', json: '#20515a', steam: '#20515a' },
  dark: { stroke: '#ffffff', json: '#abe1e5', steam: '#ffffff' },
} as const;
const MSGPACK = '#3c9b9f';
const PROTOBUF = '#c1802b';
const BOWL_FILL = '#ffffff';

const LOOP_MS = 1600;
const PULSE_MS = 2400;
const ease = Easing.bezier(0.45, 0, 0.55, 1);

/** Bars at rest (scaleY), and the icon heights reduced motion holds them at. */
const REST = 0.25;
const BARS = [
  { x: 19, held: 0.55, keys: [[0, REST], [400, 0.55], [1150, 0.55], [1450, REST], [1600, REST]] },
  { x: 41, held: 1, keys: [[0, REST], [200, REST], [600, 1], [1150, 1], [1450, REST], [1600, REST]] },
  { x: 63, held: 0.74, keys: [[0, REST], [400, REST], [800, 0.74], [1150, 0.74], [1450, REST], [1600, REST]] },
] as const;
const STEAM_OPACITY = [[0, 0], [750, 0], [1000, 0.55], [1250, 0], [1600, 0]] as const;
/** In units; times size / 96. Snaps back to 0 at the loop while invisible. */
const STEAM_RISE = [[0, 0], [750, 0], [1250, -6], [1600, -6]] as const;

/**
 * An interpolation config for keyframes [time, value], eased between each pair
 * with the spec's bezier: segments that change are split into 12 linear steps.
 */
function keyframes(keys: readonly (readonly [number, number])[], scale = 1) {
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  keys.forEach(([t, v], i) => {
    if (i > 0) {
      const [t0, v0] = keys[i - 1];
      const steps = v === v0 ? 1 : 12;
      for (let s = 1; s < steps; s++) {
        inputRange.push(t0 + ((t - t0) * s) / steps);
        outputRange.push((v0 + (v - v0) * ease(s / steps)) * scale);
      }
    }
    inputRange.push(t);
    outputRange.push(v * scale);
  });
  return { inputRange, outputRange, extrapolate: 'clamp' as const };
}

/** The system "remove animations" setting; null until it has been read. */
function useReduceMotion(): boolean | null {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (live) setOn(value);
      })
      .catch(() => {
        if (live) setOn(false);
      });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setOn);
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);
  return on;
}

export default function BrandLoader({
  size = 48,
  tone = 'light',
  paused = false,
  label,
}: {
  size?: BrandLoaderSize;
  tone?: keyof typeof TONES;
  paused?: boolean;
  /** Read out by screen readers. Leave out where the surrounding control already says it is busy. */
  label?: string;
}) {
  const reduceMotion = useReduceMotion();
  const clock = useMemo(() => new Animated.Value(0), []);
  const pulse = useMemo(() => new Animated.Value(1), []);
  const [frame, setFrame] = useState<LoaderFrame>('paused');

  useEffect(() => {
    let running: Animated.CompositeAnimation | null = null;
    const hold = () => {
      running?.stop();
      running = null;
      clock.setValue(0);
      pulse.setValue(1);
    };
    const unsubscribe = followMotionGate(
      // Paused until the reduce motion setting is known, so it never starts moving by mistake.
      { paused: paused || reduceMotion === null, reduceMotion: reduceMotion === true },
      (next) => {
        hold();
        setFrame(next);
        if (next === 'paused') return;
        const loop = next === 'moving' ? cycle(clock) : breathe(pulse);
        if (startMotion(() => loop.start())) running = loop;
        else setFrame('paused');
      }
    );
    return () => {
      unsubscribe();
      hold();
    };
  }, [paused, reduceMotion, clock, pulse]);

  const k = size / 96;
  const colors = TONES[tone];
  const scales = useMemo(() => BARS.map((bar) => clock.interpolate(keyframes(bar.keys))), [clock]);
  const steamOpacity = useMemo(() => clock.interpolate(keyframes(STEAM_OPACITY)), [clock]);
  const steamRise = useMemo(() => clock.interpolate(keyframes(STEAM_RISE, k)), [clock, k]);
  // Steam is dropped below 48 dp, and in the reduced and paused frames.
  const steam = frame === 'moving' && size >= 48;
  const at = (x: number, y: number, w: number, h: number) => ({
    position: 'absolute' as const,
    left: x * k,
    top: y * k,
    width: w * k,
    height: h * k,
  });

  return (
    <View
      style={{ width: size, height: size }}
      accessible={label !== undefined}
      accessibilityRole={label !== undefined ? 'progressbar' : undefined}
      accessibilityLabel={label}
      importantForAccessibility={label !== undefined ? 'yes' : 'no-hide-descendants'}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: pulse }]}>
        {steam && (
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: steamOpacity, transform: [{ translateY: steamRise }] }]}>
            <View style={[at(24, 20, 4, 9), { borderRadius: 2 * k, backgroundColor: colors.steam }]} />
            <View style={[at(68, 13, 4, 9), { borderRadius: 2 * k, backgroundColor: colors.steam }]} />
          </Animated.View>
        )}
        {BARS.map((bar, i) => (
          <Animated.View
            key={bar.x}
            style={[
              at(bar.x, 16, 14, 36),
              {
                borderRadius: 3 * k,
                backgroundColor: [colors.json, MSGPACK, PROTOBUF][i],
                transformOrigin: 'bottom',
                transform: [{ scaleY: frame === 'reduced' ? bar.held : frame === 'paused' ? REST : scales[i] }],
              },
            ]}
          />
        ))}
        {/*
          Basin: the half ellipse centre (48, 63), rx 34, ry 20 with a 4-unit stroke,
          drawn as an outer half ellipse in the stroke colour (rx 36, ry 22) under an
          inner one in white (rx 32, ry 18). Each is a half circle squashed to its height.
        */}
        <View
          style={[
            // Squashed about its centre: 56 + 18 = 74, so it spans y 63 to 85.
            at(12, 56, 72, 36),
            {
              borderBottomLeftRadius: 36 * k,
              borderBottomRightRadius: 36 * k,
              backgroundColor: colors.stroke,
              transform: [{ scaleY: 22 / 36 }],
            },
          ]}
        />
        <View
          style={[
            // 56 + 16 = 72, so it spans y 63 to 81.
            at(16, 56, 64, 32),
            {
              borderBottomLeftRadius: 32 * k,
              borderBottomRightRadius: 32 * k,
              backgroundColor: BOWL_FILL,
              transform: [{ scaleY: 18 / 32 }],
            },
          ]}
        />
        {/* Foot, then the rim (76 × 7, rx 3.5, with its 4-unit stroke on the outside half). */}
        <View style={[at(38, 82, 20, 6), { borderRadius: 2 * k, backgroundColor: colors.stroke }]} />
        <View
          style={[
            at(8, 54, 80, 11),
            { borderRadius: 5.5 * k, borderWidth: 4 * k, borderColor: colors.stroke, backgroundColor: BOWL_FILL },
          ]}
        />
      </Animated.View>
    </View>
  );
}

/** The loop: one clock, 0 → 1600 ms, linear; the layers carry the easing. */
function cycle(clock: Animated.Value): Animated.CompositeAnimation {
  return Animated.loop(
    Animated.timing(clock, { toValue: LOOP_MS, duration: LOOP_MS, easing: Easing.linear, useNativeDriver: true })
  );
}

/** Reduced motion: the whole mark, opacity 1 → 0.55 → 1 over 2400 ms. */
function breathe(pulse: Animated.Value): Animated.CompositeAnimation {
  return Animated.loop(
    Animated.sequence([
      Animated.timing(pulse, { toValue: 0.55, duration: PULSE_MS / 2, easing: ease, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: PULSE_MS / 2, easing: ease, useNativeDriver: true }),
    ])
  );
}
