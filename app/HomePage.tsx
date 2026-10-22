import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { IconButton } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomTabBar, { useTabBarSpace } from '../components/BottomTabBar';
import MetricsBar, { type LastMeasurement } from '../components/MetricsBar';
import { FadeIn, PressableScale, Skeleton, tapHaptic } from '../components/motion';
import RecipeImage from '../components/RecipeImage';
import { EmptyState, ErrorState, NoServerState, WAKING_LABEL } from '../components/StateViews';
import { CATEGORIES, categoryType } from '../constants/categories';
import { searchRecipes, type SearchResultItem } from '../src/api/client';
import { describeRequestError, type RequestFailure } from '../src/api/errors';
import { serverRequest } from '../src/api/serverStatus';
import { useServer } from '../src/api/useServer';
import { useSettings } from '../src/settings/settings';
import { toggleFavouriteWithToast } from '../src/ui/favourites';
import { showToast } from '../src/ui/toast';

const { width } = Dimensions.get('window');

/** How many recipes the landing screen loads per category. */
const HOME_RESULT_COUNT = 8;
/** The first few become the Featured carousel; the rest fill Popular Recipes. */
const FEATURED_COUNT = 2;


export default function HomePage() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const username = typeof params.username === 'string' ? params.username : 'Guest';
  const [selectedCategory, setSelectedCategory] = useState(CATEGORIES[0].label);
  const [recipes, setRecipes] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<RequestFailure | null>(null);
  const [last, setLast] = useState<LastMeasurement | null>(null);
  const [waking, setWaking] = useState(false);
  const server = useServer();
  const scrollRef = useRef<ScrollView>(null);
  const [recipesY, setRecipesY] = useState(0);
  const insets = useSafeAreaInsets();
  const tabBarSpace = useTabBarSpace();

  // Subscribed so a heart tapped here repaints immediately, and so a recipe
  // saved on the detail screen shows as saved when the user comes back.
  const savedIds = new Set(useSettings().favourites.map((f) => f.id));

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  /**
   * The landing screen used to show two hardcoded cards with stock photography
   * and invented calorie counts, none of which opened anything. It now loads
   * real recipes for the selected category through the measured client, so the
   * cards lead somewhere and the category chips actually do something.
   */
  const load = useCallback(async () => {
    setFailure(null);
    setWaking(false);
    if (server.url === null) {
      setRecipes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const type = categoryType(selectedCategory);
      const { data, meta } = await serverRequest(
        () =>
          searchRecipes({
            query: selectedCategory,
            ...(type === null ? {} : { type }),
            number: HOME_RESULT_COUNT,
          }),
        { what: 'Loading recipes', onWaking: () => setWaking(true) }
      );
      setRecipes(data.results ?? []);
      setLast({
        payloadBytes: meta.payloadBytes,
        deserializationMs: meta.deserializationMs,
        heapDeltaBytes: meta.heapDeltaBytes,
        format: meta.format,
        formatFallbackFrom: meta.formatFallbackFrom,
      });
    } catch (err) {
      const described = describeRequestError(err, 'load recipes');
      setFailure(described);
      setRecipes([]);
      showToast({ kind: 'error', message: described.title, action: { label: 'Retry', onPress: () => load() } });
    } finally {
      setLoading(false);
      setWaking(false);
    }
  }, [selectedCategory, server.url]);

  useEffect(() => {
    load();
  }, [load]);

  const openRecipe = (id: number | string) => {
    router.push({ pathname: '/recipe', params: { id: String(id) } });
  };

  const featured = recipes.slice(0, FEATURED_COUNT);
  const popular = recipes.slice(FEATURED_COUNT);

  return (
    <View style={{ flex: 1, backgroundColor: '#f9faf7' }}>
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: tabBarSpace }}
        showsVerticalScrollIndicator={true}
      >
        {/* Test it yourself: the study's demo, first thing on the screen */}
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Test it yourself</Text>
          <Text style={styles.bannerSubText}>
            See how fast this phone decodes recipes as JSON, MessagePack and Protocol Buffers. Usually
            under a minute, works offline.
          </Text>
          <PressableScale
            style={styles.bannerButton}
            onPress={() => {
              tapHaptic();
              router.push('/quick');
            }}
            accessibilityRole="button"
          >
            <Text style={styles.bannerButtonText}>Start Quick test</Text>
          </PressableScale>
          <View style={styles.bannerLinks}>
            <TouchableOpacity
              style={styles.bannerLink}
              onPress={() => router.push({ pathname: '/results', params: { tab: 'paper' } })}
              accessibilityRole="button"
            >
              <Text style={styles.bannerLinkText}>Paper results</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.bannerLink}
              onPress={() => scrollRef.current?.scrollTo({ y: recipesY, animated: true })}
              accessibilityRole="button"
            >
              <Text style={styles.bannerLinkText}>Browse recipes ↓</Text>
            </TouchableOpacity>
          </View>
        </View>
        {/* Header */}
        <View style={[styles.headerRow, { marginBottom: 18 }]}>
          <View>
            <Text style={styles.greeting}>{getGreeting()}</Text>
            <Text style={styles.username}>{username}</Text>
          </View>
          <IconButton
            icon="heart-outline"
            size={32}
            style={styles.heartIcon}
            iconColor="#20515a"
            accessibilityLabel="Saved recipes"
            onPress={() => router.navigate('/Profile')}
          />
        </View>
        {/* Format selector + what the last load cost */}
        <View style={{ marginBottom: 20 }}>
          <MetricsBar last={last} busy={loading} />
        </View>

        {/* Featured */}
        <Text
          style={[styles.sectionTitle, { marginBottom: 8 }]}
          onLayout={(e) => setRecipesY(e.nativeEvent.layout.y)}
        >
          Featured
        </Text>
        {server.url === null ? (
          <NoServerState mode={server.mode} />
        ) : loading ? (
          <Skeleton
            variant="cards"
            count={2}
            label={`Loading ${selectedCategory.toLowerCase()} recipes`}
            caption={waking ? WAKING_LABEL : undefined}
          />
        ) : failure !== null ? (
          <ErrorState failure={failure} onRetry={load} />
        ) : featured.length === 0 ? (
          <EmptyState title="Nothing to show" detail="No recipes came back for this category. Try another one." />
        ) : (
          <FadeIn>
            <FlatList
              data={featured}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <PressableScale
                  style={styles.featuredCard}
                  onPress={() => openRecipe(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${item.title}`}
                >
                  {/* Photo on top, text below: they never overlap. */}
                  <RecipeImage uri={item.image} title={item.title} style={styles.featuredImage} />
                  <View style={styles.featuredText}>
                    <Text style={styles.featuredTitle} numberOfLines={2}>{item.title}</Text>
                    <View style={styles.featuredInfoRow}>
                      <Text style={styles.featuredAuthor}>{selectedCategory}</Text>
                      <Text style={styles.featuredTime}>View recipe →</Text>
                    </View>
                  </View>
                </PressableScale>
              )}
              contentContainerStyle={{ paddingRight: 16, paddingBottom: 24 }}
              ItemSeparatorComponent={() => <View style={{ width: 16 }} />}
            />
          </FadeIn>
        )}

        {/* Category */}
        <View style={[styles.categoryRow, { marginBottom: 12, marginTop: 18 }]}>
          <Text style={styles.sectionTitle}>Category</Text>
          <TouchableOpacity onPress={() => router.navigate('/Search')} style={styles.seeAllTarget} accessibilityRole="button">
            <Text style={styles.seeAll}>Search all</Text>
          </TouchableOpacity>
        </View>
        <FlatList
          data={CATEGORIES}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.label}
          contentContainerStyle={[styles.categoryList, { paddingVertical: 8, paddingLeft: 16, paddingRight: 40 }]}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.categoryButton, selectedCategory === item.label && styles.categoryButtonActive, { marginRight: 16 }]}
              onPress={() => setSelectedCategory(item.label)}
              hitSlop={{ top: 6, bottom: 6 }}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedCategory === item.label }}
            >
              <Text style={[styles.categoryText, selectedCategory === item.label && styles.categoryTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
          style={{ marginBottom: 24 }}
        />

        {/* Popular Recipes */}
        <View style={[styles.categoryRow, { marginBottom: 12, marginTop: 18 }]}>
          <Text style={styles.sectionTitle}>Popular Recipes</Text>
          <TouchableOpacity onPress={() => router.navigate('/Search')} style={styles.seeAllTarget} accessibilityRole="button">
            <Text style={styles.seeAll}>Search all</Text>
          </TouchableOpacity>
        </View>
        {loading && server.url !== null && <Skeleton variant="cards" count={2} label="Loading popular recipes" />}
        {!loading && failure === null && popular.length > 0 && (
          <FadeIn style={[styles.popularList, { marginBottom: 24 }]}>
            {popular.map((item) => {
              const saved = savedIds.has(Number(item.id));
              return (
                <PressableScale
                  key={String(item.id)}
                  style={styles.recipeCard}
                  onPress={() => openRecipe(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${item.title}`}
                >
                  <RecipeImage uri={item.image} title={item.title} style={styles.recipeImage} />
                  <TouchableOpacity
                    style={styles.favoriteButton}
                    onPress={() => toggleFavouriteWithToast({ id: item.id, title: item.title, image: item.image ?? null })}
                    accessibilityRole="button"
                    accessibilityLabel={saved ? `Remove ${item.title} from saved` : `Save ${item.title}`}
                    hitSlop={8}
                  >
                    <IconButton
                      icon={saved ? 'heart' : 'heart-outline'}
                      iconColor={saved ? '#e74c3c' : '#20515a'}
                      size={20}
                      style={{ margin: 0 }}
                    />
                  </TouchableOpacity>
                  <Text style={styles.recipeTitle} numberOfLines={2}>{item.title}</Text>
                </PressableScale>
              );
            })}
          </FadeIn>
        )}
        {/* Tips & Tricks */}
        <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>Tips & Tricks</Text>
        <View style={[styles.tipsContainer, { marginBottom: 24 }]}>
          <View style={styles.tipCard}>
            <Text style={styles.tipTitle}>How to keep herbs fresh</Text>
            <Text style={styles.tipDesc}>Wrap them in a damp paper towel and store in a ziplock bag in the fridge.</Text>
          </View>
          <View style={styles.tipCard}>
            <Text style={styles.tipTitle}>Perfect boiled eggs</Text>
            <Text style={styles.tipDesc}>Boil for 7 minutes for a creamy yolk, then cool in ice water.</Text>
          </View>
        </View>
      </ScrollView>
      <BottomTabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9faf7',
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 8,
  },
  greeting: {
    color: '#20515a',
    fontSize: 16,
    fontWeight: '500',
  },
  username: {
    color: '#20515a',
    fontSize: 28,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  heartIcon: {
    backgroundColor: 'white',
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a2b3b',
    marginTop: 16,
    marginBottom: 8,
  },
  seeAll: {
    color: '#20515a',
    fontWeight: 'bold',
    alignSelf: 'center',
    marginLeft: 8,
  },
  featuredCard: {
    width: width * 0.8,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#abe1e5',
  },
  featuredImage: {
    width: '100%',
    height: 120,
  },
  featuredText: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
  },
  featuredTitle: {
    color: '#20515a',
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 4,
  },
  featuredInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  featuredAuthor: {
    color: '#20515a',
    fontSize: 13,
  },
  featuredTime: {
    color: '#20515a',
    fontSize: 13,
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 4,
  },
  categoryList: {
    paddingVertical: 8,
  },
  categoryButton: {
    backgroundColor: '#f3f7f8',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginRight: 12,
  },
  categoryButtonActive: {
    backgroundColor: '#abe1e5',
  },
  categoryText: {
    color: '#20515a',
    fontWeight: '500',
    fontSize: 15,
  },
  categoryTextActive: {
    color: '#20515a',
    fontWeight: 'bold',
  },
  popularList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  recipeCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    width: width * 0.42,
    minWidth: 140,
    maxWidth: 180,
    marginBottom: 16,
    paddingBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    marginRight: 0,
    marginLeft: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipeImage: {
    width: '100%',
    height: 100,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  favoriteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 2,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 2,
    elevation: 2,
  },
  recipeTitle: {
    color: '#1a2b3b',
    fontWeight: 'bold',
    fontSize: 15,
    marginTop: 8,
    marginHorizontal: 8,
  },
  recipeInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 8,
    marginTop: 4,
  },
  recipeInfo: {
    color: '#20515a',
    fontSize: 13,
  },
  banner: {
    backgroundColor: '#abe1e5',
    borderRadius: 18,
    padding: 18,
    marginTop: 18,
    marginBottom: 10,
    alignItems: 'center',
  },
  bannerText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#20515a',
  },
  bannerSubText: {
    fontSize: 15,
    lineHeight: 21,
    color: '#20515a',
    marginTop: 4,
    textAlign: 'center',
  },
  bannerButton: {
    alignSelf: 'stretch',
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#20515a',
    borderRadius: 24,
    marginTop: 14,
  },
  bannerButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  bannerLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 6,
  },
  bannerLink: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  bannerLinkText: {
    color: '#20515a',
    fontWeight: 'bold',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  seeAllTarget: {
    minHeight: 48,
    justifyContent: 'center',
  },
  tipsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 16,
  },
  tipCard: {
    flex: 1,
    backgroundColor: '#f3f7f8',
    borderRadius: 14,
    padding: 12,
    marginRight: 8,
  },
  tipTitle: {
    fontWeight: 'bold',
    color: '#20515a',
    marginBottom: 4,
  },
  tipDesc: {
    color: '#1a2b3b',
    fontSize: 13,
  },

}); 