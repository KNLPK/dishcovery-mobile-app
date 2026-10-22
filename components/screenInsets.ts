/**
 * components/screenInsets.ts
 *
 * Padding for a full-screen ScrollView without the tab bar (Quick test,
 * Results, Settings, ...). Android 15 draws apps edge to edge, so the first
 * line has to start below the status bar and the last one must scroll clear
 * of the system navigation bar. Screens with the tab bar use useTabBarSpace()
 * from BottomTabBar for the bottom instead.
 */

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing } from '../constants/theme';

export function useScreenPadding(): { paddingTop: number; paddingBottom: number } {
  const insets = useSafeAreaInsets();
  return { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xxl };
}
