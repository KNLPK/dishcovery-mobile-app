/**
 * app/welcome.tsx
 *
 * The tutorial (Claude Design handoff, "Onboarding"): four steps, shown on
 * first launch and again from "Replay tutorial" in Profile and About.
 *
 *   1  what Dishcovery is
 *   2  the three formats, as a letter, a packed letter and a form
 *   3  what the quick test measures
 *   4  an optional name, then "Run a quick test now" or "Browse recipes"
 *
 * Every step has the same frame, so nothing jumps between pages: the brand
 * and Skip, a fixed 220 dp illustration card, title and body, and the dots and
 * buttons pinned to the bottom. Next, Back, Skip (to step 4) or a swipe moves
 * between steps. Step 4 drops Skip and Back (a swipe right still goes back);
 * with the keyboard up, the illustration fades and the text moves into its
 * place, so the field and both buttons stay visible above the keyboard.
 *
 * Step changes follow the motion spec (docs/BRAND.md): the old step leaves
 * sideways while fading, the new one arrives from the other side, title and
 * body 40 ms apart, and the active dot's pill grows with scaleX in a fixed
 * 20 dp slot. With reduce motion on (or not yet known) only opacity changes.
 * Native driver, started through startMotion().
 *
 * The name is stored only on this phone (src/settings/settings.ts) and shown
 * on Home and in Profile; without one the app says "Guest". Either action
 * marks the tutorial as seen.
 */

import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, Keyboard, PanResponder, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton, SecondaryButton, TextLink } from '../components/Buttons';
import { FormField } from '../components/KeyboardForm';
import { ease } from '../components/motion';
import { Screen } from '../components/Screen';
import { useReduceMotion } from '../components/useReduceMotion';
import { palette, spacing, touchTarget, type } from '../constants/theme';
import { startMotion } from '../src/ui/motionGate';
import { getSettings, markWelcomeSeen, setDisplayName } from '../src/settings/settings';

/** Illustrations exported from assets/brand/onboarding-*.svg (docs/BRAND.md), 312 × 200 dp. */
const STEPS = [
  {
    image: require('../assets/brand/onboarding-1-recipes.png'),
    title: 'Recipes, and a speed test',
    body: "Find recipes for what's in your kitchen. While you browse, Dishcovery measures how fast this phone reads each recipe's data.",
  },
  {
    image: require('../assets/brand/onboarding-2-formats.png'),
    title: 'Three ways to send a recipe',
    body: null, // FormatsBody
    caption: 'Average small recipe in the study (low tier).',
  },
  {
    image: require('../assets/brand/onboarding-3-quick-test.png'),
    title: 'The quick test',
    body: 'It decodes the same recipes in all three formats and measures size, decode time and memory. Under a minute, and it works offline.',
  },
  {
    image: require('../assets/brand/onboarding-4-start.png'),
    title: 'What should we call you?',
    body: 'Optional. Shown on Home and in your profile, and it stays on this phone.',
  },
] as const;

const LAST = STEPS.length - 1;
const CARD_HEIGHT = 220;
const CARD_TOP = spacing.sm;
/** A swipe commits past this distance (dp) or speed (dp per ms). */
const SWIPE_DISTANCE = 72;
const SWIPE_SPEED = 0.5;
/** Swiping: the illustration and the text follow the finger at these rates, fading over a screen width. */
const FOLLOW = { image: 0.6, text: 0.4, fadeOver: 360 };

function FormatsBody() {
  return (
    <Text style={styles.body}>
      The same recipe, packed three ways. <Text style={styles.bold}>JSON</Text> is a readable letter,{' '}
      <Text style={styles.bold}>MessagePack</Text> the same letter packed tighter,{' '}
      <Text style={styles.bold}>Protocol Buffers</Text> a form with fixed fields.
    </Text>
  );
}

/** The keyboard's height while it is up, 0 otherwise. */
function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const reduced = reduceMotion !== false;
  const keyboardHeight = useKeyboardHeight();
  const [index, setIndex] = useState(0);
  // Prefilled when the tutorial is replayed.
  const [name, setName] = useState(() => getSettings().displayName);
  const busy = useRef(false);

  const v = useMemo(
    () => ({
      imageX: new Animated.Value(0),
      imageO: new Animated.Value(1),
      // While swiping: the text's offset, and a fade over the whole page.
      textX: new Animated.Value(0),
      drag: new Animated.Value(1),
      titleX: new Animated.Value(0),
      titleO: new Animated.Value(1),
      bodyX: new Animated.Value(0),
      bodyO: new Animated.Value(1),
      buttons: new Animated.Value(1),
      dots: STEPS.map((_, i) => ({ o: new Animated.Value(i === 0 ? 1 : 0), sx: new Animated.Value(i === 0 ? 1 : 0.4) })),
      card: new Animated.Value(1),
      lift: new Animated.Value(0),
    }),
    []
  );

  /** Every value at rest for step n: no offsets, full opacity, n's dot active. */
  function settle(n: number) {
    for (const x of [v.imageX, v.textX, v.titleX, v.bodyX]) x.setValue(0);
    for (const o of [v.imageO, v.drag, v.titleO, v.bodyO, v.buttons]) o.setValue(1);
    v.dots.forEach((d, i) => {
      d.o.setValue(i === n ? 1 : 0);
      d.sx.setValue(i === n ? 1 : 0.4);
    });
  }

  /** Moves to step n, from wherever the values are (at rest, or where a swipe let go). */
  function go(n: number) {
    if (busy.current || n === index || n < 0 || n > LAST) return;
    const dir = n > index ? 1 : -1;
    const crossLast = (index === LAST) !== (n === LAST);
    const prev = index;
    const t = (value: Animated.Value, toValue: number, duration: number, easing: (x: number) => number, delay = 0) =>
      Animated.timing(value, { toValue, duration, easing, delay, useNativeDriver: true });
    const move = reduced ? 0 : 1;

    const out = Animated.parallel([
      t(v.imageX, -32 * dir * move, reduced ? 120 : 160, ease.in),
      t(v.imageO, 0, reduced ? 120 : 160, ease.in),
      t(v.titleX, -16 * dir * move, 120, ease.in),
      t(v.titleO, 0, 120, ease.in),
      t(v.bodyX, -16 * dir * move, 120, ease.in),
      t(v.bodyO, 0, 120, ease.in),
      ...(crossLast ? [t(v.buttons, 0, 150, ease.in)] : []),
      ...(reduced ? [] : [t(v.dots[prev].o, 0, 200, ease.in), t(v.dots[prev].sx, 0.4, 200, ease.in)]),
    ]);
    busy.current = true;
    if (!startMotion(() => out.start())) {
      settle(n);
      setIndex(n);
      busy.current = false;
      return;
    }

    // The new step comes in from 120 ms, while the illustration's exit finishes.
    setTimeout(() => {
      v.imageX.setValue(32 * dir * move);
      v.titleX.setValue(24 * dir * move);
      v.bodyX.setValue(24 * dir * move);
      v.imageO.setValue(0);
      v.titleO.setValue(0);
      v.bodyO.setValue(0);
      if (reduced) {
        v.dots.forEach((d, i) => {
          d.o.setValue(i === n ? 1 : 0);
          d.sx.setValue(i === n ? 1 : 0.4);
        });
      }
      setIndex(n);
      const arrive = Animated.parallel([
        t(v.imageX, 0, reduced ? 150 : 260, ease.out),
        t(v.imageO, 1, reduced ? 150 : 260, ease.out),
        t(v.titleX, 0, reduced ? 150 : 240, ease.out, reduced ? 0 : 40),
        t(v.titleO, 1, reduced ? 150 : 240, ease.out, reduced ? 0 : 40),
        t(v.bodyX, 0, reduced ? 150 : 240, ease.out, reduced ? 0 : 80),
        t(v.bodyO, 1, reduced ? 150 : 240, ease.out, reduced ? 0 : 80),
        ...(crossLast ? [t(v.buttons, 1, 150, ease.out, 30)] : []),
        ...(reduced ? [] : [t(v.dots[n].o, 1, 240, ease.out), t(v.dots[n].sx, 1, 240, ease.out)]),
      ]);
      const done = () => {
        settle(n);
        busy.current = false;
      };
      if (!startMotion(() => arrive.start(done))) done();
    }, 120);
  }

  // Swipe between steps: the page follows the finger, then commits or settles back.
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => !busy.current && Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderMove: (_e, g) => {
          const move = reduced ? 0 : 1;
          v.imageX.setValue(g.dx * FOLLOW.image * move);
          v.textX.setValue(g.dx * FOLLOW.text * move);
          v.drag.setValue(Math.max(0, 1 - Math.abs(g.dx) / FOLLOW.fadeOver));
        },
        onPanResponderRelease: (_e, g) => {
          const n = g.dx < 0 ? index + 1 : index - 1;
          if ((Math.abs(g.dx) > SWIPE_DISTANCE || Math.abs(g.vx) > SWIPE_SPEED) && n >= 0 && n <= LAST) {
            // Hand the swipe's offsets and fade over to the step change, which leaves from there.
            const text = reduced ? 0 : g.dx * FOLLOW.text;
            const faded = Math.max(0, 1 - Math.abs(g.dx) / FOLLOW.fadeOver);
            v.textX.setValue(0);
            v.drag.setValue(1);
            v.titleX.setValue(text);
            v.bodyX.setValue(text);
            for (const o of [v.imageO, v.titleO, v.bodyO]) o.setValue(faded);
            go(n);
            return;
          }
          const back = Animated.parallel([
            Animated.timing(v.imageX, { toValue: 0, duration: 200, easing: ease.out, useNativeDriver: true }),
            Animated.timing(v.textX, { toValue: 0, duration: 200, easing: ease.out, useNativeDriver: true }),
            Animated.timing(v.drag, { toValue: 1, duration: 200, easing: ease.out, useNativeDriver: true }),
          ]);
          if (!startMotion(() => back.start())) settle(index);
        },
        onPanResponderTerminate: () => settle(index),
      }),
    [index, reduced, v] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Keyboard up on step 4: the illustration fades and the text takes its place.
  const keyboardUp = keyboardHeight > 0 && index === LAST;
  useEffect(() => {
    const card = keyboardUp ? 0 : 1;
    const lift = keyboardUp ? -(CARD_TOP + CARD_HEIGHT) : 0;
    const shift = Animated.parallel([
      Animated.timing(v.card, { toValue: card, duration: 200, easing: ease.out, useNativeDriver: true }),
      Animated.timing(v.lift, { toValue: lift, duration: 200, easing: ease.out, useNativeDriver: true }),
    ]);
    if (reduced || !startMotion(() => shift.start())) {
      v.card.setValue(card);
      v.lift.setValue(lift);
    }
  }, [keyboardUp, reduced, v]);

  function finish(next: 'quick' | 'browse') {
    setDisplayName(name);
    markWelcomeSeen();
    router.replace('/HomePage');
    if (next === 'quick') router.push('/quick');
  }

  const fades = useMemo(
    () => ({
      image: Animated.multiply(v.imageO, v.drag),
      caption: Animated.multiply(Animated.multiply(v.imageO, v.drag), v.card),
      title: Animated.multiply(v.titleO, v.drag),
      body: Animated.multiply(v.bodyO, v.drag),
    }),
    [v]
  );

  const step = STEPS[index];
  // Above the keyboard when it is up (it covers the bottom inset too), else 24 dp above the inset.
  const bottom = keyboardHeight > 0 ? Math.max(spacing.xl, keyboardHeight - insets.bottom + spacing.lg) : spacing.xl;

  return (
    <Screen background={palette.ground}>
      <View style={styles.header}>
        <Text style={styles.brand}>Dishcovery</Text>
        {index < LAST && <TextLink label="Skip" onPress={() => go(LAST)} accessibilityLabel="Skip the tutorial" />}
      </View>

      <View style={styles.page} {...pan.panHandlers}>
        <Animated.View style={[styles.card, { opacity: v.card }]}>
          <Animated.View style={{ opacity: fades.image, transform: [{ translateX: v.imageX }] }}>
            <Image source={step.image} style={styles.illustration} resizeMode="contain" accessibilityIgnoresInvertColors />
          </Animated.View>
        </Animated.View>
        {'caption' in step && (
          <Animated.Text style={[styles.caption, { opacity: fades.caption }]}>{step.caption}</Animated.Text>
        )}

        <Animated.View
          style={[styles.text, { transform: [{ translateY: v.lift }, { translateX: v.textX }] }]}
          accessibilityLiveRegion="polite"
        >
          <Animated.View style={{ opacity: fades.title, transform: [{ translateX: v.titleX }] }}>
            <Text style={styles.title} accessibilityRole="header">
              {step.title}
            </Text>
          </Animated.View>
          <Animated.View style={{ opacity: fades.body, transform: [{ translateX: v.bodyX }] }}>
            {step.body === null ? <FormatsBody /> : <Text style={index === LAST ? styles.nameBody : styles.body}>{step.body}</Text>}
            {index === LAST && (
              <FormField
                look="outlined"
                style={styles.nameField}
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                autoCapitalize="words"
                autoComplete="name"
                maxLength={40}
                returnKeyType="done"
                accessibilityLabel="Your name, optional"
              />
            )}
          </Animated.View>
        </Animated.View>

        <View style={[styles.bottom, { bottom }]}>
          <View style={styles.dots} accessible accessibilityLabel={`Step ${index + 1} of ${STEPS.length}`}>
            {v.dots.map((d, i) => (
              <View key={i} style={styles.dotSlot}>
                <View style={styles.dot} />
                <Animated.View style={[styles.dotActive, { opacity: d.o, transform: [{ scaleX: d.sx }] }]} />
              </View>
            ))}
          </View>
          <Animated.View style={{ opacity: v.buttons }}>
            {index < LAST ? (
              <View style={styles.row}>
                {index > 0 && <TextLink label="Back" onPress={() => go(index - 1)} style={styles.back} />}
                <PrimaryButton label="Next" onPress={() => go(index + 1)} style={styles.grow} />
              </View>
            ) : (
              <View style={styles.actions}>
                <PrimaryButton label="Run a quick test now" onPress={() => finish('quick')} />
                <SecondaryButton label="Browse recipes" onPress={() => finish('browse')} />
              </View>
            )}
          </Animated.View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 56,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingLeft: spacing.xl,
    paddingRight: spacing.md,
  },
  brand: { ...type.section, color: palette.primary },
  page: { flex: 1 },
  card: {
    marginTop: CARD_TOP,
    marginHorizontal: spacing.xl,
    height: CARD_HEIGHT,
    borderRadius: 24,
    backgroundColor: palette.surfaceCool,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  illustration: { width: 312, height: 200 },
  // In the gap under the card, so step 2's text sits where every other step's does.
  caption: {
    ...type.caption,
    position: 'absolute',
    top: CARD_TOP + CARD_HEIGHT + 6,
    left: spacing.xl,
    right: spacing.xl,
    textAlign: 'center',
    color: palette.muted,
  },
  text: { paddingTop: spacing.xxl, paddingHorizontal: spacing.xl },
  title: { ...type.title, color: palette.primary },
  body: { fontSize: 15, lineHeight: 22, color: palette.ink, marginTop: spacing.md },
  bold: { fontWeight: '700' },
  nameBody: { fontSize: 15, lineHeight: 22, color: palette.body, marginTop: spacing.md },
  nameField: { marginTop: spacing.lg, height: 52 },
  bottom: { position: 'absolute', left: 0, right: 0, paddingHorizontal: spacing.xl, gap: spacing.xl },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 2, height: 8 },
  dotSlot: { width: 20, height: 8, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: palette.primary },
  dotActive: { ...StyleSheet.absoluteFillObject, borderRadius: 4, backgroundColor: palette.primary },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: touchTarget },
  back: { paddingHorizontal: spacing.lg },
  grow: { flex: 1 },
  actions: { gap: spacing.sm },
});
