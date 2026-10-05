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
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

const ACTIVE = '#20515a';
const INACTIVE = '#b0b0b0';

/**
 * Notifications is deliberately absent.
 *
 * app/Notification.tsx is 166 lines of static, hardcoded notices with no
 * backing feature — nothing generates a notification, nothing marks one read.
 * A tab that opens a screen of invented content is worse than no tab, so the
 * entry is removed. The route file still exists and can be restored here the
 * day something actually produces notifications.
 */
const TABS = [
  { path: '/HomePage', icon: 'home', label: 'Home' },
  { path: '/Search', icon: 'search', label: 'Search' },
  { path: '/Profile', icon: 'user', label: 'Profile' },
] as const;

export default function BottomTabBar() {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <View style={styles.tabBar}>
      {TABS.slice(0, 2).map((tab) => (
        <TouchableOpacity
          key={tab.path}
          onPress={() => router.navigate(tab.path)}
          style={styles.tabButton}
          accessibilityRole="button"
          accessibilityLabel={tab.label}
          accessibilityState={{ selected: pathname === tab.path }}
        >
          <Feather name={tab.icon} size={26} color={pathname === tab.path ? ACTIVE : INACTIVE} />
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
          <Feather name={tab.icon} size={26} color={pathname === tab.path ? ACTIVE : INACTIVE} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 30,
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginHorizontal: 10,
    marginBottom: 16,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
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
  },
  chefHatButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -24,
    flex: 1,
  },
  chefHatIcon: {
    backgroundColor: ACTIVE,
    borderRadius: 32,
    padding: 8,
  },
});
