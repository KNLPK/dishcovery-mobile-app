/**
 * components/BottomTabBar.tsx
 *
 * ROUTING CONVENTION
 * ------------------
 * Every destination is an absolute path, and every tab uses router.navigate().
 *
 * It used to mix absolute ('/HomePage') with relative ('./ChefHat') paths, so
 * the same tab resolved differently depending on which screen was showing —
 * and every tab used router.replace(), which destroys the current screen. That
 * left no back stack at all: opening a recipe from search and pressing the
 * system Back button exited the app instead of returning to the results.
 *
 * navigate() is the right call for a tab: it returns to an existing instance of
 * the route when one is already in the stack, and pushes when it is not. Detail
 * screens still use push(), so Back means "the screen I came from".
 */

import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Keyboard, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette } from '../constants/theme';

const ACTIVE = '#20515a';
/**
 * 5.3:1 on white. The old #b0b0b0 was 2.2:1, and the active tab was told apart
 * by colour alone; each tab now also has a label, bold when active.
 */
const INACTIVE = '#5f6e7a';

/**
 * Notifications is deliberately absent.
 *
 * app/Notification.tsx is 166 lines of static, hardcoded notices with no
 * backing feature — nothing generates a notification, nothing marks one read.
 * A tab that opens a screen of invented content is worse than no tab, so the
 * entry is removed. The route file still exists and can be restored here the
 * day something actually produces notifications.
 */
/**
 * EDGE TO EDGE
 * ------------
 * Android 15 draws every app under the status and navigation bars. The bar is
 * therefore full width and opaque, and reaches down under the system
 * navigation bar (3-button or gesture) with that bar's height as padding, so
 * the buttons sit above it and no content shows through behind either.
 *
 * Height of the bar's own row, without the system navigation bar under it.
 * The chef-hat button rises CHEF_HAT_RISE above it.
 */
export const TAB_BAR_HEIGHT = 60;
const CHEF_HAT_RISE = 24;

/**
 * Bottom padding a scrolling screen with this bar needs so its last item can
 * scroll fully clear of the bar, the chef hat and the system navigation bar.
 */
export function useTabBarSpace(): number {
  return TAB_BAR_HEIGHT + CHEF_HAT_RISE + useSafeAreaInsets().bottom + 16;
}

const TABS = [
  { path: '/HomePage', icon: 'home', label: 'Home' },
  { path: '/Search', icon: 'search', label: 'Search' },
  { path: '/Profile', icon: 'user', label: 'Profile' },
] as const;

export default function BottomTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  // Out of the way while typing, as a system tab bar would be: otherwise it
  // rides up on the keyboard and covers the field being typed into.
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  if (keyboardOpen) return null;

  return (
    <View style={[styles.tabBar, { paddingBottom: insets.bottom }]}>
      {TABS.slice(0, 2).map((tab) => (
        <TouchableOpacity
          key={tab.path}
          onPress={() => router.navigate(tab.path)}
          style={styles.tabButton}
          accessibilityRole="button"
          accessibilityLabel={tab.label}
          accessibilityState={{ selected: pathname === tab.path }}
        >
          <Feather name={tab.icon} size={24} color={pathname === tab.path ? ACTIVE : INACTIVE} />
          <Text style={[styles.tabLabel, pathname === tab.path && styles.tabLabelActive]}>{tab.label}</Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        onPress={() => router.navigate('/ChefHat')}
        style={styles.chefHatButton}
        accessibilityRole="button"
        accessibilityLabel="Find a recipe from ingredients"
        accessibilityState={{ selected: pathname === '/ChefHat' }}
      >
        <MaterialCommunityIcons
          name="chef-hat"
          size={32}
          color="#fff"
          style={styles.chefHatIcon}
        />
        <Text style={[styles.tabLabel, pathname === '/ChefHat' && styles.tabLabelActive]}>Cook</Text>
      </TouchableOpacity>

      {TABS.slice(2).map((tab) => (
        <TouchableOpacity
          key={tab.path}
          onPress={() => router.navigate(tab.path)}
          style={styles.tabButton}
          accessibilityRole="button"
          accessibilityLabel={tab.label}
          accessibilityState={{ selected: pathname === tab.path }}
        >
          <Feather name={tab.icon} size={24} color={pathname === tab.path ? ACTIVE : INACTIVE} />
          <Text style={[styles.tabLabel, pathname === tab.path && styles.tabLabelActive]}>{tab.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundColor: palette.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
    paddingHorizontal: 18,
    paddingTop: 6,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: TAB_BAR_HEIGHT - 6,
  },
  tabLabel: {
    fontSize: 11,
    lineHeight: 14,
    color: INACTIVE,
    marginTop: 2,
  },
  tabLabelActive: {
    color: ACTIVE,
    fontWeight: '700',
  },
  chefHatButton: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: -CHEF_HAT_RISE,
    height: TAB_BAR_HEIGHT - 6 + CHEF_HAT_RISE,
    flex: 1,
  },
  chefHatIcon: {
    backgroundColor: ACTIVE,
    borderRadius: 32,
    padding: 8,
  },
});
