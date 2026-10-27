/**
 * components/Sheet.tsx
 *
 * A bottom sheet for short choices and explanations (the format sheet, Cook's
 * filters, the Σ sheet, "How to read this" on Results). Tapping outside or
 * Back closes it. Long content scrolls inside the sheet.
 *
 * It moves as the motion spec says ("Sheet"), not with the Modal's own slide:
 * opening, the sheet rises from below its own height and fades in over
 * 280 ms while the backdrop fades in over 200 ms (out); closing reverses both
 * in 200 ms (in), and only then does the Modal go. Reduce motion: fades only.
 * Native driver, through startMotion(); while measuring it appears and goes
 * at once.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette, radius, spacing, type } from '../constants/theme';
import { startMotion } from '../src/ui/motionGate';
import { ease } from './motion';
import { useReduceMotion } from './useReduceMotion';

export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const reduced = useReduceMotion() !== false;
  const [mounted, setMounted] = useState(visible);
  const [height, setHeight] = useState(0);
  const sheet = useRef(new Animated.Value(0)).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  const opened = useRef(false);

  const t = (value: Animated.Value, toValue: number, duration: number, easing: (x: number) => number) =>
    Animated.timing(value, { toValue, duration, easing, useNativeDriver: true });

  useEffect(() => {
    if (visible) {
      setMounted(true);
      return;
    }
    if (!mounted) return;
    opened.current = false;
    const close = Animated.parallel([t(sheet, 0, 200, ease.in), t(backdrop, 0, 200, ease.in)]);
    const gone = () => setMounted(false);
    if (!startMotion(() => close.start(gone))) {
      sheet.setValue(0);
      backdrop.setValue(0);
      gone();
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Opens once the sheet has been laid out, so it can rise by its own height.
  useEffect(() => {
    if (!visible || !mounted || height === 0 || opened.current) return;
    opened.current = true;
    const open = Animated.parallel([t(sheet, 1, 280, ease.out), t(backdrop, 1, 200, ease.out)]);
    if (!startMotion(() => open.start())) {
      sheet.setValue(1);
      backdrop.setValue(1);
    }
  }, [visible, mounted, height]); // eslint-disable-line react-hooks/exhaustive-deps

  const rise = sheet.interpolate({ inputRange: [0, 1], outputRange: [reduced ? 0 : height, 0] });

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.layer}>
        <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + spacing.lg, maxHeight: '85%', opacity: sheet, transform: [{ translateY: rise }] },
          ]}
          onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
          accessibilityViewIsModal
        >
          <View style={styles.grabber} />
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

/** A term and its explanation, one paragraph. */
export function SheetLine({ term, children }: { term?: string; children: React.ReactNode }) {
  return (
    <Text style={styles.line}>
      {term !== undefined && <Text style={styles.term}>{term}: </Text>}
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  layer: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11, 43, 51, 0.4)' },
  sheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: palette.border, marginBottom: spacing.md },
  title: { ...type.section, color: palette.ink, marginBottom: spacing.sm },
  body: { gap: spacing.sm },
  line: { ...type.body, color: palette.body },
  term: { fontWeight: '700', color: palette.ink },
});
