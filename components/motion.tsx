/**
 * components/motion.tsx
 *
 * The app's only animations: a fade-in when content arrives, a pulsing
 * skeleton while it loads, press feedback, and a light haptic tick.
 *
 * Every animation here runs on the native driver (opacity and transform only,
 * never layout) and starts through startMotion(), so none of them starts while
 * the Quick test is measuring. The skeleton's loop also stops when a
 * measurement begins and resumes after. scripts/test-motion-gate.mjs checks
 * both, and that no other file starts an animation of its own.
 */

import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { palette, radius, spacing } from '../constants/theme';
import { startMotion, subscribeMeasuring } from '../src/ui/motionGate';

/** Fades its children in once, when it mounts. */
export function FadeIn({
  children,
  style,
  duration = 220,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  duration?: number;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const ran = startMotion(() =>
      Animated.timing(opacity, { toValue: 1, duration, useNativeDriver: true }).start()
    );
    // Measuring: show the content at once instead of animating it.
    if (!ran) opacity.setValue(1);
  }, [opacity, duration]);
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
    const play = () => startMotion(() => loop.start());
    play();
    const unsubscribe = subscribeMeasuring((measuring) => {
      if (measuring) {
        loop.stop();
        opacity.setValue(1);
      } else {
        loop.reset();
        play();
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

/**
 * A Pressable that dims and shrinks slightly while held. Plain style, not an
 * animation, so it costs nothing and is safe at any time.
 */
export function PressableScale({
  style,
  children,
  ...rest
}: Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable {...rest} style={({ pressed }) => [style, pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

/** A light haptic tick for primary actions; skipped while measuring. */
export function tapHaptic(): void {
  startMotion(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  });
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
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
