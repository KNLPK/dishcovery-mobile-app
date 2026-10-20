import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { FlatList, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { IconButton } from 'react-native-paper';

import BottomTabBar from '../components/BottomTabBar';
import MetricsBar, { type LastMeasurement } from '../components/MetricsBar';
import { EmptyState, ErrorState, LoadingState, NoServerState, WAKING_LABEL } from '../components/StateViews';
import { CATEGORIES, categoryType } from '../constants/categories';
import { palette, radius, shadow, spacing, type as typeScale } from '../constants/theme';
import { searchRecipes, type SearchResultItem } from '../src/api/client';
import { describeRequestError, type RequestFailure } from '../src/api/errors';
import { serverRequest } from '../src/api/serverStatus';
import { useServer } from '../src/api/useServer';

/**
 * Example cards, shown before a search has run. These are placeholders with
 * stock imagery, not data from the API — they are labelled "Examples" and are
 * not tappable because there is no recipe behind them.
 */
type SampleCard = { id: string; title: string; image: string };

const popularRecipes: SampleCard[] = [
  { id: '1', title: 'Egg & Avocado', image: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=400&q=80' },
  { id: '2', title: 'Bowl of ramen', image: 'https://images.unsplash.com/photo-1519864600265-abb23847ef2c?auto=format&fit=crop&w=400&q=80' },
  { id: '3', title: 'Chicken Stew', image: 'https://images.unsplash.com/photo-1502741338009-cac2772e18bc?auto=format&fit=crop&w=400&q=80' },
];

const trendingIngredients: SampleCard[] = [
  { id: '1', title: 'Avocado', image: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=80&q=80' },
  { id: '2', title: 'Egg', image: 'https://images.unsplash.com/photo-1464306076886-debca5e8a6b0?auto=format&fit=crop&w=80&q=80' },
  { id: '3', title: 'Chicken', image: 'https://images.unsplash.com/photo-1502741338009-cac2772e18bc?auto=format&fit=crop&w=80&q=80' },
  { id: '4', title: 'Salmon', image: 'https://images.unsplash.com/photo-1519864600265-abb23847ef2c?auto=format&fit=crop&w=80&q=80' },
];



export default function Search() {
  // null means "no meal-type filter". The chips toggle: tapping the selected
  // one clears it, so a plain keyword search is still reachable.
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SearchResultItem[] | null>(null);
  const [lastQuery, setLastQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<RequestFailure | null>(null);
  const [last, setLast] = useState<LastMeasurement | null>(null);
  const [waking, setWaking] = useState(false);
  const server = useServer();
  const router = useRouter();

  const runSearch = async (query: string, category: string | null = selectedCategory) => {
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
      setFailure(describeRequestError(err, 'search recipes'));
      setResults(null);
    } finally {
      setLoading(false);
      setWaking(false);
    }
  };

  const showExamples = server.url !== null && results === null && failure === null && !loading;

  const openRecipe = (id: number | string) => {
    router.push({ pathname: '/recipe', params: { id: String(id) } });
  };

  return (
    <View style={styles.page}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <IconButton
            icon="arrow-left"
            size={22}
            iconColor={palette.primary}
            onPress={() => router.navigate('/HomePage')}
            style={{ width: 48, height: 48 }}
            accessibilityLabel="Back to Home"
          />
          <Text style={styles.headerTitle}>Search</Text>
          <View style={{ width: 48 }} />
        </View>

        {/* Search bar */}
        <View style={styles.searchBarWrapper}>
          <Feather name="search" size={18} color={palette.muted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchBar}
            placeholder="Search recipes"
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => runSearch(search)}
            returnKeyType="search"
            placeholderTextColor={palette.muted}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={15} accessibilityRole="button" accessibilityLabel="Clear search">
              <Feather name="x" size={18} color={palette.muted} />
            </Pressable>
          )}
        </View>

        {/* Format + last measurement */}
        <View style={{ marginTop: spacing.md }}>
          <MetricsBar last={last} busy={loading} />
        </View>

        {/* Categories */}
        <View style={styles.categoryRow}>
          {CATEGORIES.map((cat) => {
            const active = selectedCategory === cat.label;
            return (
              <Pressable
                key={cat.label}
                style={[styles.categoryButton, active && styles.categoryButtonActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                hitSlop={{ top: 7, bottom: 7 }}
                onPress={() => {
                  // Toggle, then re-run the current query so the filter is
                  // visibly applied rather than waiting for the next search.
                  const next = active ? null : cat.label;
                  setSelectedCategory(next);
                  if (lastQuery.length > 0) runSearch(lastQuery, next);
                }}
              >
                <Text style={[styles.categoryText, active && styles.categoryTextActive]}>
                  {cat.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Results, or the sample content before a search has run */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>
            {showExamples ? 'Examples' : server.url === null ? 'Recipes' : 'Results'}
          </Text>
          {showExamples && <Text style={styles.sectionMeta}>Not real recipes · search to load some</Text>}
          {results !== null && results.length > 0 && (
            <Text style={styles.sectionMeta}>
              {results.length} for “{lastQuery}”
              {selectedCategory === null ? '' : ` · ${selectedCategory}`}
            </Text>
          )}
        </View>

        {server.url === null ? (
          <NoServerState mode={server.mode} />
        ) : loading ? (
          <LoadingState label={waking ? WAKING_LABEL : `Searching for “${lastQuery}”…`} />
        ) : failure !== null ? (
          <ErrorState failure={failure} onRetry={() => runSearch(lastQuery)} />
        ) : results === null ? (
          <FlatList
            data={popularRecipes}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.popularCard}>
                <Image source={{ uri: item.image }} style={styles.popularImage} />
                <Text style={styles.popularCardTitle} numberOfLines={2}>
                  {item.title}
                </Text>
              </View>
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
          <View style={styles.resultList}>
            {results.map((item) => (
              <Pressable
                key={String(item.id)}
                style={styles.resultCard}
                onPress={() => openRecipe(item.id)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${item.title}`}
              >
                {item.image !== undefined ? (
                  <Image source={{ uri: item.image }} style={styles.resultImage} />
                ) : (
                  <View style={[styles.resultImage, styles.resultImageEmpty]} />
                )}
                <Text style={styles.resultTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <Feather name="chevron-right" size={18} color={palette.muted} />
              </Pressable>
            ))}
          </View>
        )}

        {/* Trending ingredients — sample content */}
        <Text style={[styles.sectionTitle, { marginTop: spacing.xl, marginBottom: spacing.sm }]}>
          Trending Ingredients
        </Text>
        <FlatList
          data={trendingIngredients}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              style={styles.ingredientCard}
              onPress={() => {
                setSearch(item.title);
                runSearch(item.title);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Search for ${item.title}`}
            >
              <Image source={{ uri: item.image }} style={styles.ingredientImage} />
              <Text style={styles.ingredientName}>{item.title}</Text>
            </Pressable>
          )}
          contentContainerStyle={styles.hList}
          ItemSeparatorComponent={() => <View style={{ width: spacing.md }} />}
        />

      </ScrollView>
      <BottomTabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.surface },
  container: { flex: 1, paddingHorizontal: spacing.lg },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  headerTitle: { ...typeScale.title, color: palette.primary },
  searchBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surfaceTint,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: palette.border,
  },
  searchIcon: { marginRight: spacing.sm },
  searchBar: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingVertical: 10,
    color: palette.ink,
    ...typeScale.body,
    fontSize: 15,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  categoryButton: {
    backgroundColor: palette.surfaceTint,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: palette.border,
  },
  categoryButtonActive: { backgroundColor: palette.accent, borderColor: palette.accent },
  categoryText: { ...typeScale.label, color: palette.muted },
  categoryTextActive: { color: palette.primary },
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
  resultImageEmpty: { backgroundColor: palette.surfaceTint },
  resultTitle: { ...typeScale.cardTitle, color: palette.ink, flex: 1 },
  popularCard: {
    width: 112,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    alignItems: 'center',
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: palette.border,
    ...shadow.card,
  },
  popularImage: { width: 88, height: 88, borderRadius: radius.sm, marginBottom: spacing.sm },
  popularCardTitle: { ...typeScale.label, color: palette.ink, textAlign: 'center' },
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
  ingredientImage: { width: 40, height: 40, borderRadius: 20, marginBottom: spacing.xs },
  ingredientName: { ...typeScale.caption, color: palette.primary, textAlign: 'center' },
});
