import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { FlatList, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import BottomTabBar, { useTabBarSpace } from '../components/BottomTabBar';
import { ChipRow } from '../components/Chips';
import MetricsBar, { type LastMeasurement } from '../components/MetricsBar';
import { FadeIn, PressableScale } from '../components/motion';
import RecipeImage from '../components/RecipeImage';
import { Screen, TabHeader } from '../components/Screen';
import { ConnectingState, EmptyState, ErrorState, NoServerState, WaitState } from '../components/StateViews';
import { ALL_CATEGORIES, CATEGORY_CHIPS_WITH_ALL, categoryType } from '../constants/categories';
import { illustrativePhoto } from '../constants/illustrativePhotos';
import { palette, radius, shadow, spacing, type as typeScale } from '../constants/theme';
import { searchRecipes, type SearchResultItem } from '../src/api/client';
import { describeRequestError, type RequestFailure } from '../src/api/errors';
import { serverRequest } from '../src/api/serverStatus';
import { useServer } from '../src/api/useServer';
import { showToast } from '../src/ui/toast';

/**
 * Searches to try, before one has run. Each card runs its search, and every
 * one of them finds recipes in the online catalog. They used to be three
 * "Examples" with hotlinked stock photos that did not match (a chicken stew
 * showed blueberries) or did not load; the photos now come from the same
 * bundled set and title-based mapping as every recipe card
 * (constants/illustrativePhotos.ts).
 */
const SUGGESTED_SEARCHES = ['Chicken stew', 'Noodle bowl', 'Lentil soup'] as const;

/** One-word searches, with the photo for that ingredient's kind of dish. */
const INGREDIENTS = ['Egg', 'Chicken', 'Salmon', 'Rice', 'Tofu'] as const;


export default function Search() {
  // null means "no meal-type filter". The chips toggle: tapping the selected
  // one clears it, so a plain keyword search is still reachable.
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORIES);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SearchResultItem[] | null>(null);
  const [lastQuery, setLastQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<RequestFailure | null>(null);
  const [last, setLast] = useState<LastMeasurement | null>(null);
  const [waking, setWaking] = useState(false);
  const server = useServer();
  const router = useRouter();
  const tabBarSpace = useTabBarSpace();
  const [searchFocused, setSearchFocused] = useState(false);

  const runSearch = async (query: string, category: string = selectedCategory) => {
    const trimmed = query.trim();
    if (trimmed.length === 0 || server.url === null) return;

    setLoading(true);
    setWaking(false);
    setFailure(null);
    setLastQuery(trimmed);
    try {
      // The measured path — same instruments as recipe detail, in whichever
      // format is selected app-wide. The chip, when one is active, becomes
      // Spoonacular's `type` filter, exactly as ChefHat uses it.
      const type = categoryType(category);
      const { data, meta } = await serverRequest(
        () =>
          searchRecipes({
            query: trimmed,
            ...(type === null ? {} : { type }),
            number: 10,
          }),
        { what: 'Search', onWaking: () => setWaking(true) }
      );
      setResults(data.results ?? []);
      setLast({
        payloadBytes: meta.payloadBytes,
        deserializationMs: meta.deserializationMs,
        heapDeltaBytes: meta.heapDeltaBytes,
        format: meta.format,
        formatFallbackFrom: meta.formatFallbackFrom,
      });
    } catch (err) {
      const described = describeRequestError(err, 'search recipes');
      setFailure(described);
      setResults(null);
      showToast({
        kind: 'error',
        message: described.title,
        action: { label: 'Retry', onPress: () => runSearch(trimmed, category) },
      });
    } finally {
      setLoading(false);
      setWaking(false);
    }
  };

  const searchFor = (query: string) => {
    setSearch(query);
    runSearch(query);
  };

  const showSuggestions = server.url !== null && results === null && failure === null && !loading;

  const openRecipe = (id: number | string) => {
    router.push({ pathname: '/recipe', params: { id: String(id) } });
  };

  return (
    <Screen background={palette.surface} tabBar>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: tabBarSpace }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <TabHeader title="Search" />

        {/* Search bar */}
        <View style={[styles.searchBarWrapper, searchFocused && styles.searchBarFocused]}>
          <Feather name="search" size={18} color={palette.muted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchBar}
            placeholder="Search recipes"
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => runSearch(search)}
            returnKeyType="search"
            placeholderTextColor={palette.muted}
            underlineColorAndroid="transparent"
            cursorColor={palette.primary}
            selectionColor="rgba(32, 81, 90, 0.3)"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            accessibilityLabel="Search recipes"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={15} accessibilityRole="button" accessibilityLabel="Clear search">
              <Feather name="x" size={18} color={palette.muted} />
            </Pressable>
          )}
        </View>

        {/* Format + last measurement */}
        <View style={{ marginTop: spacing.md }}>
          <MetricsBar last={last} busy={loading} list />
        </View>

        {/* Categories: All first, as on Cook */}
        <View style={{ marginTop: spacing.lg }}>
          <ChipRow
            options={CATEGORY_CHIPS_WITH_ALL}
            selected={selectedCategory}
            onSelect={(label) => {
              if (label === selectedCategory) return;
              // Re-run the current query so the filter is visibly applied
              // rather than waiting for the next search.
              setSelectedCategory(label);
              if (lastQuery.length > 0) runSearch(lastQuery, label);
            }}
            background={palette.surface}
            accessibilityLabel="Category"
          />
        </View>

        {/* Results, or searches to try before one has run */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>
            {showSuggestions ? 'Try a search' : server.url === null ? 'Recipes' : 'Results'}
          </Text>
          {results !== null && results.length > 0 && (
            <Text style={styles.sectionMeta}>
              {results.length} for “{lastQuery}”
              {selectedCategory === ALL_CATEGORIES ? '' : ` · ${selectedCategory}`}
            </Text>
          )}
        </View>

        {server.url === null ? (
          <NoServerState mode={server.mode} />
        ) : loading ? (
          <WaitState variant="list" count={4} label={`Searching for “${lastQuery}”`} />
        ) : failure !== null ? (
          <ErrorState failure={failure} onRetry={() => runSearch(lastQuery)} />
        ) : results === null ? (
          <FlatList
            data={SUGGESTED_SEARCHES}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <PressableScale
                style={styles.suggestionCard}
                onPress={() => searchFor(item)}
                accessibilityRole="button"
                accessibilityLabel={`Search for ${item}`}
              >
                <Image source={illustrativePhoto(item)} style={styles.suggestionImage} resizeMode="cover" />
                <Text style={styles.suggestionTitle} numberOfLines={2}>
                  {item}
                </Text>
              </PressableScale>
            )}
            contentContainerStyle={styles.hList}
            ItemSeparatorComponent={() => <View style={{ width: spacing.md }} />}
          />
        ) : results.length === 0 ? (
          <EmptyState
            title="No recipes matched"
            detail={`Nothing came back for “${lastQuery}”. Try a single ingredient, like “chicken”.`}
          />
        ) : (
          <FadeIn style={styles.resultList}>
            {results.map((item) => (
              <PressableScale
                key={String(item.id)}
                style={styles.resultCard}
                onPress={() => openRecipe(item.id)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${item.title}`}
              >
                <RecipeImage uri={item.image} id={item.id} title={item.title} style={styles.resultImage} />
                <Text style={styles.resultTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <Feather name="chevron-right" size={18} color={palette.muted} />
              </PressableScale>
            ))}
          </FadeIn>
        )}

        {/* One-tap searches by ingredient */}
        <Text style={[styles.sectionTitle, { marginTop: spacing.xl, marginBottom: spacing.sm }]}>
          Search by ingredient
        </Text>
        <FlatList
          data={INGREDIENTS}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item}
          renderItem={({ item }) => (
            <PressableScale
              style={styles.ingredientCard}
              onPress={() => searchFor(item)}
              accessibilityRole="button"
              accessibilityLabel={`Search for ${item}`}
            >
              <Image source={illustrativePhoto(item)} style={styles.ingredientImage} resizeMode="cover" />
              <Text style={styles.ingredientName}>{item}</Text>
            </PressableScale>
          )}
          contentContainerStyle={styles.hList}
          ItemSeparatorComponent={() => <View style={{ width: spacing.md }} />}
        />
        <Text style={styles.photoNote}>Photos are illustrative.</Text>
      </ScrollView>
      {waking && <ConnectingState />}
      <BottomTabBar />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.lg },
  searchBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surfaceTint,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    borderWidth: 2,
    borderColor: palette.border,
  },
  searchBarFocused: { borderColor: palette.primary, backgroundColor: palette.surface },
  searchIcon: { marginRight: spacing.sm },
  searchBar: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingVertical: 10,
    color: palette.ink,
    ...typeScale.body,
    fontSize: 15,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  sectionTitle: { ...typeScale.section, color: palette.ink },
  sectionMeta: { ...typeScale.caption, color: palette.muted },
  hList: { paddingRight: spacing.lg, paddingVertical: spacing.xs },
  resultList: { gap: spacing.sm },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.sm,
    ...shadow.card,
  },
  resultImage: { width: 56, height: 56, borderRadius: radius.sm },
  resultTitle: { ...typeScale.cardTitle, color: palette.ink, flex: 1 },
  suggestionCard: {
    width: 128,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    overflow: 'hidden',
    ...shadow.card,
  },
  suggestionImage: { width: '100%', height: 80 },
  suggestionTitle: { ...typeScale.label, fontSize: 13, color: palette.ink, padding: spacing.sm },
  ingredientCard: {
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    width: 84,
    borderWidth: 1,
    borderColor: palette.border,
    ...shadow.card,
  },
  ingredientImage: { width: 44, height: 44, borderRadius: 22, marginBottom: spacing.xs },
  ingredientName: { ...typeScale.label, color: palette.primary, textAlign: 'center' },
  photoNote: { ...typeScale.caption, color: palette.muted, marginTop: spacing.sm },
});
