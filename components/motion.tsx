/**
 * components/motion.tsx
 *
 * The app's small animations, from the motion spec (docs/BRAND.md):
 *
 *   FadeIn          content arriving
 *   SkeletonBlock   the pulse while content loads
 *   PressableScale  held: scale 0.97, opacity 0.85, 150 ms in and out
 *   PageEnter       a pushed screen's content: 24 dp → 0, 240 ms
 *   StaggerItem     result cards: 8 dp → 0 and in, 200 ms, 40 ms apart (first 6)
 *   Pop             a chip added (pop) or removed
 *   HeartButton     save: the filled heart fades in, the button pops to 1.3
 *   GrowBar         a result bar grows from the left, 300 ms, 60 ms apart
 *   CrossfadeText   a value that changes (the format pill's numbers)
 *   tapHaptic       a light haptic tick
 *
 * Every animation here runs on the native driver (opacity and transform only,
 * never layout) and starts through startMotion(), so none of them starts while
 * the Quick test is measuring: they jump to their end instead. The skeleton's
 * loop also stops when a measurement begins and resumes after. With the
 * system's reduce motion setting on (or not yet known), each keeps only its
 * fade, or none. scripts/test-motion-gate.mjs checks the native driver and the
 * gate, and that no other file starts an animation of its own.
 */

import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { palette, radius, spacing } from '../constants/theme';
import { startMotion, subscribeMeasuring } from '../src/ui/motionGate';
import { useReduceMotion } from './useReduceMotion';

/** Runs one animation through the gate, or jumps to its end values when the gate refuses. */
function play(animation: Animated.CompositeAnimation, jump: () => void, done?: () => void): void {
  if (!startMotion(() => animation.start(done))) {
    jump();
    done?.();
  }
}

const timing = (value: Animated.Value, toValue: number, duration: number, easing: (t: number) => number, delay = 0) =>
  Animated.timing(value, { toValue, duration, easing, delay, useNativeDriver: true });

/** The motion spec's easing curves (docs/BRAND.md), for Animated.timing. */
export const ease = {
  /** Things arriving. */
  out: Easing.bezier(0.2, 0, 0, 1),
  /** Things leaving. */
  in: Easing.bezier(0.3, 0, 1, 1),
  /** Full-screen moves. */
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  /** Overshoot: the heart, an added chip. */
  pop: Easing.bezier(0.34, 1.56, 0.64, 1),
};

/** Fades its children in once, when it mounts (after `delay` ms). */
export function FadeIn({
  children,
  style,
  duration = 220,
  delay = 0,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  duration?: number;
  delay?: number;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // Measuring: show the content at once instead of animating it.
    play(timing(opacity, 1, duration, ease.out, delay), () => opacity.setValue(1));
  }, [opacity, duration, delay]);
  return <Animated.View style={[style, { opacity }]}>{children}</Animated.View>;
}

/** One grey block that pulses gently while content loads. */
export function SkeletonBlock({ style }: { style?: StyleProp<ViewStyle> }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.45, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    const resume = () => startMotion(() => loop.start());
    resume();
    const unsubscribe = subscribeMeasuring((measuring) => {
      if (measuring) {
        loop.stop();
        opacity.setValue(1);
      } else {
        loop.reset();
        resume();
      }
    });
    return () => {
      unsubscribe();
      loop.stop();
    };
  }, [opacity]);
  return <Animated.View style={[styles.block, style, { opacity }]} />;
}

/**
 * Placeholder rows shaped like the content that is coming: `list` for result
 * lists (thumbnail and two lines), `cards` for the two-column recipe grid,
 * `detail` for a recipe page. Screens use them for short waits; StateViews'
 * WaitState swaps in the brand loader when a wait runs long.
 */
export function Skeleton({
  variant,
  count = 3,
  label,
}: {
  variant: 'list' | 'cards' | 'detail';
  count?: number;
  label: string;
}) {
  const rows = Array.from({ length: count }, (_, i) => i);
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} style={styles.wrap}>
      {variant === 'list' &&
        rows.map((i) => (
          <View key={i} style={styles.listRow}>
            <SkeletonBlock style={styles.listThumb} />
            <View style={styles.listText}>
              <SkeletonBlock style={styles.lineLong} />
              <SkeletonBlock style={styles.lineShort} />
            </View>
          </View>
        ))}
      {variant === 'cards' && (
        <View style={styles.cardsRow}>
          {rows.map((i) => (
            <View key={i} style={styles.card}>
              <SkeletonBlock style={styles.cardImage} />
              <SkeletonBlock style={styles.lineLong} />
              <SkeletonBlock style={styles.lineShort} />
            </View>
          ))}
        </View>
      )}
      {variant === 'detail' && (
        <View>
          <SkeletonBlock style={styles.detailImage} />
          <View style={styles.detailBody}>
            <SkeletonBlock style={styles.detailTitle} />
            {rows.map((i) => (
              <SkeletonBlock key={i} style={i % 2 === 0 ? styles.lineLong : styles.lineShort} />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * A Pressable that dims and shrinks slightly while held: scale 0.97 and
 * opacity 0.85, eased in and out over 150 ms. Reduce motion: the dim only.
 * While measuring it changes at once, without animating.
 */
export function PressableScale({
  style,
  children,
  onPressIn,
  onPressOut,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & { style?: StyleProp<ViewStyle>; children?: React.ReactNode }) {
  const reduced = useReduceMotion() !== false;
  const held = useRef(new Animated.Value(0)).current;
  const to = (value: number) => play(timing(held, value, 150, ease.out), () => held.setValue(value));
  const opacity = held.interpolate({ inputRange: [0, 1], outputRange: [1, 0.85] });
  const scale = held.interpolate({ inputRange: [0, 1], outputRange: [1, reduced ? 1 : 0.97] });
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => {
        to(1);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        to(0);
        onPressOut?.(e);
      }}
      style={[style, { opacity, transform: [{ scale }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}

/**
 * A pushed screen's content arriving: 24 dp → 0 over 240 ms while the stack
 * fades the screen in (app/_layout.tsx). Reduce motion: the stack's fade only.
 */
export function PageEnter({ children, enabled }: { children: React.ReactNode; enabled: boolean }) {
  const reduced = useReduceMotion();
  const x = useRef(new Animated.Value(enabled ? 24 : 0)).current;
  useEffect(() => {
    if (!enabled || reduced === null) return;
    if (reduced) x.setValue(0);
    else play(timing(x, 0, 240, ease.out), () => x.setValue(0));
  }, [enabled, reduced, x]);
  return <Animated.View style={[styles.fill, { transform: [{ translateX: x }] }]}>{children}</Animated.View>;
}

/** Cards that stagger in: the first 6, 40 ms apart, 8 dp → 0 and in over 200 ms; later ones at once. */
export function StaggerItem({ index, children }: { index: number; children: React.ReactNode }) {
  const reduced = useReduceMotion() !== false;
  const staggered = index < 6;
  const t = useRef(new Animated.Value(staggered ? 0 : 1)).current;
  useEffect(() => {
    if (staggered) play(timing(t, 1, 200, ease.out, index * 40), () => t.setValue(1));
  }, [staggered, index, t]);
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [reduced ? 0 : 8, 0] });
  return <Animated.View style={{ opacity: t, transform: [{ translateY }] }}>{children}</Animated.View>;
}

/**
 * A chip that pops in when added (opacity 0 → 1, scale 0.8 → 1, 180 ms, pop)
 * and, once `leaving`, out (150 ms, in) before `onLeft` removes it. Reduce
 * motion: fades only.
 */
export function Pop({
  children,
  leaving = false,
  onLeft,
}: {
  children: React.ReactNode;
  leaving?: boolean;
  onLeft?: () => void;
}) {
  const reduced = useReduceMotion() !== false;
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    play(timing(t, 1, 180, ease.pop), () => t.setValue(1));
  }, [t]);
  useEffect(() => {
    if (leaving) play(timing(t, 0, 150, ease.in), () => t.setValue(0), onLeft);
  }, [leaving]); // eslint-disable-line react-hooks/exhaustive-deps
  const scale = t.interpolate({ inputRange: [0, 1], outputRange: [reduced ? 1 : 0.8, 1] });
  return <Animated.View style={{ opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }), transform: [{ scale }] }}>{children}</Animated.View>;
}

/**
 * The save heart on a recipe card. Saving: a haptic tick, the filled heart
 * fades in over 80 ms and the button scales 1 → 1.3 → 1 over 260 ms (out,
 * then pop). Unsaving: the filled heart fades out, 150 ms. Reduce motion: the
 * fades only.
 */
export function HeartButton({
  saved,
  onPress,
  label,
  style,
}: {
  saved: boolean;
  onPress: () => void;
  label: string;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReduceMotion() !== false;
  const fill = useRef(new Animated.Value(saved ? 1 : 0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!saved) {
      play(timing(fill, 0, 150, ease.in), () => fill.setValue(0));
      return;
    }
    tapHaptic();
    const steps = [timing(fill, 1, 80, ease.out)];
    if (!reduced) steps.push(Animated.sequence([timing(scale, 1.3, 120, ease.out), timing(scale, 1, 140, ease.pop)]));
    play(Animated.parallel(steps), () => {
      fill.setValue(1);
      scale.setValue(1);
    });
  }, [saved]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Pressable onPress={onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={label} style={style}>
      <Animated.View style={[styles.heart, { transform: [{ scale }] }]}>
        <MaterialCommunityIcons name="heart-outline" size={20} color={palette.primary} style={styles.heartIcon} />
        <Animated.View style={[styles.heartIcon, { opacity: fill }]}>
          <MaterialCommunityIcons name="heart" size={20} color="#e74c3c" />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

/**
 * A bar that grows from the left when it mounts: scaleX 0 → 1, 300 ms, each
 * `index` 60 ms after the one before. Reduce motion: it fades in instead.
 * `width` is the bar's share of its track.
 */
export function GrowBar({ index, width, style }: { index: number; width: `${number}%`; style: StyleProp<ViewStyle> }) {
  const reduced = useReduceMotion() !== false;
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    play(timing(t, 1, 300, ease.out, index * 60), () => t.setValue(1));
  }, [index, t]);
  return (
    <Animated.View
      style={[
        style,
        { width, transformOrigin: 'left' },
        reduced ? { opacity: t } : { transform: [{ scaleX: t }] },
      ]}
    />
  );
}

/** When the bars in a group of `count` have all grown: for labels that fade in after them. */
export const barsDoneAt = (count: number) => (count - 1) * 60 + 300;

/** Text that cross-fades when it changes: out 150 ms (in), the new text in 150 ms (out). */
export function CrossfadeText({ text, style }: { text: string; style?: StyleProp<TextStyle> }) {
  const [shown, setShown] = useState(text);
  const opacity = useRef(new Animated.Value(1)).current;
  // A fade that ends after the text has changed again (a search done in under
  // 150 ms) must show the newest text, not the one it started for.
  const latest = useRef(text);
  latest.current = text;
  useEffect(() => {
    if (text === shown) return;
    play(
      timing(opacity, 0, 150, ease.in),
      () => opacity.setValue(0),
      () => {
        setShown(latest.current);
        play(timing(opacity, 1, 150, ease.out), () => opacity.setValue(1));
      }
    );
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Animated.Text style={[style, { opacity }]} numberOfLines={1}>
      {shown}
    </Animated.Text>
  );
}

/** A light haptic tick for primary actions; skipped while measuring. */
export function tapHaptic(): void {
  startMotion(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  });
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  heart: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0b2b33',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  heartIcon: { position: 'absolute' },
  wrap: { gap: spacing.sm, paddingVertical: spacing.sm },
  block: { backgroundColor: palette.border, borderRadius: radius.sm },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.sm },
  listThumb: { width: 56, height: 56 },
  listText: { flex: 1, gap: spacing.sm },
  lineLong: { height: 12, width: '85%' },
  lineShort: { height: 12, width: '55%' },
  cardsRow: { flexDirection: 'row', gap: spacing.lg },
  card: { flex: 1, gap: spacing.sm },
  cardImage: { height: 100, borderRadius: radius.lg },
  detailImage: { height: 250, borderRadius: 0 },
  detailBody: { padding: spacing.xl, gap: spacing.md },
  detailTitle: { height: 22, width: '70%' },
});
