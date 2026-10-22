/**
 * components/ToastHost.tsx
 *
 * Draws the toast from src/ui/toast.ts near the bottom of the screen, above
 * the tab bar and the system navigation bar. It slides up and fades in on the
 * native driver, through startMotion(), and dismisses itself after a few
 * seconds. Mounted once, in app/_layout.tsx.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette, radius, spacing, touchTarget, type } from '../constants/theme';
import { startMotion } from '../src/ui/motionGate';
import { currentToast, dismissToast, subscribeToast, type Toast, type ToastKind } from '../src/ui/toast';
import { TAB_BAR_HEIGHT } from './BottomTabBar';

const ICONS: Record<ToastKind, 'check-circle' | 'alert-circle' | 'information'> = {
  success: 'check-circle',
  error: 'alert-circle',
  info: 'information',
};
const ICON_COLORS: Record<ToastKind, string> = {
  success: '#7fd6b0',
  error: '#ffb4ab',
  info: palette.accent,
};

export default function ToastHost() {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<Toast | null>(currentToast);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => subscribeToast(setToast), []);

  useEffect(() => {
    if (toast === null) return;
    anim.setValue(0);
    const ran = startMotion(() =>
      Animated.timing(anim, { toValue: 1, duration: 200, useNativeDriver: true }).start()
    );
    if (!ran) anim.setValue(1);
    const timer = setTimeout(
      () => dismissToast(toast.id),
      toast.durationMs ?? (toast.action === undefined ? 3500 : 5000)
    );
    return () => clearTimeout(timer);
  }, [toast, anim]);

  if (toast === null) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.layer, { bottom: insets.bottom + TAB_BAR_HEIGHT + spacing.lg }]}
    >
      <Animated.View
        accessibilityLiveRegion="polite"
        accessibilityRole={toast.kind === 'error' ? 'alert' : undefined}
        style={[
          styles.toast,
          {
            opacity: anim,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
          },
        ]}
      >
        <MaterialCommunityIcons name={ICONS[toast.kind]} size={20} color={ICON_COLORS[toast.kind]} />
        <Text style={styles.message}>{toast.message}</Text>
        {toast.action !== undefined && (
          <Pressable
            onPress={() => {
              dismissToast(toast.id);
              toast.action?.onPress();
            }}
            style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
          >
            <Text style={styles.actionText}>{toast.action.label}</Text>
          </Pressable>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: spacing.lg, right: spacing.lg, zIndex: 1000 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: palette.ink,
    borderRadius: radius.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    minHeight: touchTarget + 4,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  message: { ...type.body, color: palette.surface, flex: 1, paddingVertical: spacing.sm },
  action: { minHeight: touchTarget, justifyContent: 'center', paddingHorizontal: spacing.md },
  actionText: { ...type.label, fontSize: 14, color: palette.accent },
});
