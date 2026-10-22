/**
 * components/Screen.tsx
 *
 * The frame every screen sits in, and its header.
 *
 * EDGE TO EDGE
 * ------------
 * Android 15 draws apps under the status bar and the navigation bar. Screen
 * pads its own background in under both, so the area behind the clock and
 * behind the navigation buttons is solid and in the screen's colour, and
 * content scrolls below the clock instead of under it. On screens with the tab
 * bar the bar covers the bottom itself (BottomTabBar), so Screen leaves it.
 *
 * HEADERS
 * -------
 *   TabHeader     the four tab screens (Home, Search, Cook, Profile): a large
 *                 title, left-aligned, that scrolls with the content.
 *   StackHeader   every screen opened from somewhere else: back arrow and a
 *                 centred title, fixed above the content.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette, spacing, touchTarget, type } from '../constants/theme';

export function Screen({
  children,
  background = palette.surface,
  tabBar = false,
  style,
}: {
  children: React.ReactNode;
  background?: string;
  /** True when the screen shows BottomTabBar, which covers the bottom inset. */
  tabBar?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: background, paddingTop: insets.top, paddingBottom: tabBar ? 0 : insets.bottom },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function TabHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.tabHeader}>
      <View style={{ flex: 1 }}>
        <Text style={styles.tabTitle} accessibilityRole="header">
          {title}
        </Text>
        {subtitle !== undefined && <Text style={styles.tabSubtitle}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

export function StackHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  const router = useRouter();
  return (
    <View style={styles.stackHeader}>
      <Text style={styles.stackTitle} numberOfLines={1} accessibilityRole="header">
        {title}
      </Text>
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/HomePage'))}
        style={styles.headerButton}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <MaterialCommunityIcons name="arrow-left" size={24} color={palette.primary} />
      </Pressable>
      <View style={styles.headerRight}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  tabHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.md,
    marginBottom: spacing.lg,
  },
  tabTitle: { fontSize: 28, fontWeight: '700', lineHeight: 34, color: palette.ink },
  tabSubtitle: { ...type.body, color: palette.muted, marginTop: 2 },
  stackHeader: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  // Centred on the screen, not between the buttons, and clear of both.
  stackTitle: {
    ...type.section,
    color: palette.ink,
    position: 'absolute',
    left: touchTarget + spacing.md,
    right: touchTarget + spacing.md,
    textAlign: 'center',
  },
  headerButton: {
    width: touchTarget,
    height: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: { minWidth: touchTarget, alignItems: 'flex-end' },
});
