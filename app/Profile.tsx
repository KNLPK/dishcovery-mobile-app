import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, FlatList } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import BottomTabBar, { useTabBarSpace } from '../components/BottomTabBar';
import { TextLink } from '../components/Buttons';
import { FormField } from '../components/KeyboardForm';
import { PressableScale } from '../components/motion';
import RecipeImage from '../components/RecipeImage';
import { Screen, TabHeader } from '../components/Screen';
import { EmptyState } from '../components/StateViews';
import { palette } from '../constants/theme';
import { listQuickTests } from '../src/quick/storage';
import { setDisplayName, shownName, useSettings } from '../src/settings/settings';
import { toggleFavouriteWithToast } from '../src/ui/favourites';

const LINKS = [
  ['chart-bar', 'Results', 'Your quick tests and the paper results', '/results'],
  ['server-network', 'Server settings', 'Online, Laptop or Offline', '/settings'],
  ['information-outline', 'About', 'The study, the recipes and the photos', '/about'],
] as const;

export default function Profile() {
  const router = useRouter();
  const tabBarSpace = useTabBarSpace();

  // Real saved recipes, from the same persisted store the hearts write to.
  const settings = useSettings();
  const favourites = settings.favourites;

  // Everything shown is either entered by the user or counted on this phone;
  // nothing is invented. The name is the one asked for after the welcome
  // cards, and "Guest" without one, as on Home.
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(settings.displayName);
  const name = shownName(settings.displayName);
  const initial = name.charAt(0).toUpperCase();

  // Saved quick tests, counted again whenever Profile comes back into view.
  const [quickTests, setQuickTests] = useState<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      listQuickTests().then((all) => setQuickTests(all.length));
    }, [])
  );

  const saveName = () => {
    setDisplayName(draftName);
    setEditingName(false);
  };

  const stats = [
    [settings.recipesViewed, 'Recipes viewed'],
    [quickTests ?? '–', 'Quick tests run'],
    [favourites.length, 'Saved'],
  ] as const;

  return (
    <Screen background={palette.surface} tabBar>
      <FlatList
        style={styles.container}
        keyboardShouldPersistTaps="handled"
        data={favourites}
        keyExtractor={item => String(item.id)}
        numColumns={2}
        columnWrapperStyle={{ justifyContent: 'space-between' }}
        ListHeaderComponent={
          <>
            <TabHeader title="Profile" />
            {/* Avatar and name */}
            <View style={styles.identity}>
              <View style={styles.avatar}>
                <Text style={styles.avatarInitial}>{initial}</Text>
              </View>
              {editingName ? (
                <View style={styles.nameEditRow}>
                  <FormField
                    style={styles.nameInput}
                    value={draftName}
                    onChangeText={setDraftName}
                    placeholder="Your name"
                    autoFocus
                    maxLength={40}
                    returnKeyType="done"
                    accessibilityLabel="Your name"
                    onSubmitEditing={saveName}
                  />
                  <TextLink label="Save" onPress={saveName} />
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.nameRow}
                  onPress={() => {
                    setDraftName(settings.displayName);
                    setEditingName(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${name}. Edit your name`}
                >
                  <Text style={styles.name}>{name}</Text>
                  <MaterialCommunityIcons name="pencil-outline" size={18} color={palette.primary} />
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.nameNote}>Your name stays on this phone.</Text>

            {/* Stats: all counted on this phone, none invented */}
            <View style={styles.statsRow}>
              {stats.map(([value, label]) => (
                <View key={label} style={styles.statItem} accessible accessibilityLabel={`${label}: ${value}`}>
                  <Text style={styles.statNumber}>{value}</Text>
                  <Text style={styles.statLabel}>{label}</Text>
                </View>
              ))}
            </View>

            {/* Study screens, the server setting and About */}
            <View style={styles.linkList}>
              {LINKS.map(([icon, label, detail, path]) => (
                <TouchableOpacity
                  key={path}
                  style={styles.linkRow}
                  onPress={() => router.push(path)}
                  accessibilityRole="button"
                >
                  <MaterialCommunityIcons name={icon} size={22} color={palette.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.linkLabel}>{label}</Text>
                    <Text style={styles.linkDetail}>{detail}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={22} color={palette.muted} />
                </TouchableOpacity>
              ))}
            </View>

            {/* Saved recipes */}
            <View style={styles.favHeaderRow}>
              <Text style={styles.favHeader}>Saved recipes</Text>
              <Text style={styles.favCount}>
                {favourites.length === 0 ? '' : `${favourites.length} saved`}
              </Text>
            </View>
          </>
        }
        renderItem={({ item }) => (
          <PressableScale
            style={styles.favCard}
            onPress={() => router.push({ pathname: '/recipe', params: { id: String(item.id) } })}
            accessibilityRole="button"
            accessibilityLabel={`Open ${item.title}`}
          >
            <RecipeImage uri={item.image} title={item.title} style={styles.favImage} />
            <TouchableOpacity
              style={styles.favLike}
              onPress={() => toggleFavouriteWithToast(item)}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${item.title} from saved`}
              hitSlop={8}
            >
              <MaterialCommunityIcons name="heart" size={18} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.favTitle} numberOfLines={2}>{item.title}</Text>
          </PressableScale>
        )}
        ListEmptyComponent={
          <EmptyState
            title="No saved recipes yet"
            detail="Tap the heart on any recipe to save it here."
          />
        }
        contentContainerStyle={{ paddingBottom: tabBarSpace }}
        showsVerticalScrollIndicator={false}
      />
      <BottomTabBar />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 18,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: palette.surface,
    fontSize: 30,
    fontWeight: '700',
  },
  nameRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
  },
  name: {
    fontWeight: 'bold',
    fontSize: 20,
    color: palette.ink,
    flexShrink: 1,
  },
  nameNote: {
    color: palette.muted,
    fontSize: 12,
    marginTop: 8,
  },
  nameEditRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  nameInput: {
    flex: 1,
    backgroundColor: palette.surfaceTint,
    borderRadius: 8,
    minHeight: 48,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 16,
    marginBottom: 8,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: palette.border,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    fontWeight: 'bold',
    fontSize: 20,
    color: palette.ink,
  },
  statLabel: {
    color: palette.body,
    fontSize: 12,
    marginTop: 2,
  },
  linkList: {
    marginTop: 4,
    marginBottom: 8,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingVertical: 6,
  },
  linkLabel: {
    color: palette.primary,
    fontSize: 15,
    fontWeight: 'bold',
  },
  linkDetail: {
    color: palette.muted,
    fontSize: 12,
  },
  favHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: palette.border,
  },
  favHeader: {
    fontWeight: 'bold',
    fontSize: 18,
    color: palette.ink,
  },
  favCount: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  favCard: {
    backgroundColor: palette.surfaceAlt,
    borderRadius: 14,
    padding: 10,
    marginBottom: 14,
    width: '48%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  favImage: {
    width: '100%',
    height: 90,
    borderRadius: 12,
    marginBottom: 8,
  },
  favLike: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: palette.primary,
    borderRadius: 12,
    padding: 4,
    zIndex: 2,
  },
  favTitle: {
    fontWeight: 'bold',
    fontSize: 14,
    color: palette.ink,
    marginBottom: 2,
  },
});
