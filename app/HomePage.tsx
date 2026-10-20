import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, FlatList, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { IconButton } from 'react-native-paper';
import BottomTabBar from '../components/BottomTabBar';
import MetricsBar, { type LastMeasurement } from '../components/MetricsBar';
import { EmptyState, ErrorState, LoadingState, NoServerState, WAKING_LABEL } from '../components/StateViews';
import { CATEGORIES, categoryType } from '../constants/categories';
import { searchRecipes, type SearchResultItem } from '../src/api/client';
import { describeRequestError, type RequestFailure } from '../src/api/errors';
import { serverRequest } from '../src/api/serverStatus';
import { useServer } from '../src/api/useServer';
import { toggleFavourite, useSettings } from '../src/settings/settings';

const { width } = Dimensions.get('window');

/** How many recipes the landing screen loads per category. */
const HOME_RESULT_COUNT = 8;
/** The first few become the Featured carousel; the rest fill Popular Recipes. */
const FEATURED_COUNT = 2;

const featuredChefs = [
  { id: '1', name: 'Chef Anna', avatar: 'https://randomuser.me/api/portraits/women/44.jpg' },
  { id: '2', name: 'Chef Ben', avatar: 'https://randomuser.me/api/portraits/men/32.jpg' },
  { id: '3', name: 'Chef Clara', avatar: 'https://randomuser.me/api/portraits/women/65.jpg' },
  { id: '4', name: 'Chef David', avatar: 'https://randomuser.me/api/portraits/men/76.jpg' },
];

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
      setFailure(describeRequestError(err, 'load recipes'));
      setRecipes([]);
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
        contentContainerStyle={{ paddingBottom: 140 }}
        showsVerticalScrollIndicator={true}
      >
        {/* Test it yourself: the study's demo, first thing on the screen */}
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Test it yourself</Text>
          <Text style={styles.bannerSubText}>
            See how fast this phone decodes recipes as JSON, MessagePack and Protocol Buffers. About a
            minute, works offline.
          </Text>
          <TouchableOpacity style={styles.bannerButton} onPress={() => router.push('/quick')} accessibilityRole="button">
            <Text style={styles.bannerButtonText}>Start Quick test</Text>
          </TouchableOpacity>
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
        {/* Featured Chefs */}
        <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>Featured Chefs</Text>
        <FlatList
          data={featuredChefs}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <View style={styles.chefCard}>
              <Image source={{ uri: item.avatar }} style={styles.chefAvatar} />
              <Text style={styles.chefName}>{item.name}</Text>
            </View>
          )}
          contentContainerStyle={{ paddingLeft: 16, paddingRight: 40 }}
          ItemSeparatorComponent={() => <View style={{ width: 16 }} />}
          style={{ marginBottom: 24 }}
        />
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
          <LoadingState label={waking ? WAKING_LABEL : `Loading ${selectedCategory.toLowerCase()} recipes…`} />
        ) : failure !== null ? (
          <ErrorState failure={failure} onRetry={load} />
        ) : featured.length === 0 ? (
          <EmptyState title="Nothing to show" detail="No recipes came back for this category. Try another one." />
        ) : (
          <FlatList
            data={featured}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item, index }) => (
              <TouchableOpacity
                style={[styles.featuredCard, index === featured.length - 1 && { marginBottom: 24 }]}
                onPress={() => openRecipe(item.id)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${item.title}`}
              >
                {item.image !== undefined ? (
                  <Image source={{ uri: item.image }} style={styles.featuredImage} resizeMode="cover" />
                ) : (
                  <View style={[styles.featuredImage, { backgroundColor: '#dfeaec' }]} />
                )}
                <View style={styles.featuredOverlay}>
                  <Text style={styles.featuredTitle} numberOfLines={2}>{item.title}</Text>
                  <View style={styles.featuredInfoRow}>
                    <Text style={styles.featuredAuthor}>{selectedCategory}</Text>
                    <Text style={styles.featuredTime}>View recipe →</Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}
            contentContainerStyle={{ paddingRight: 16, paddingBottom: 24 }}
            ItemSeparatorComponent={() => <View style={{ width: 16 }} />}
          />
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
        {!loading && failure === null && popular.length > 0 && (
          <View style={[styles.popularList, { marginBottom: 24 }]}>
            {popular.map((item, idx) => {
              const saved = savedIds.has(Number(item.id));
              return (
                <TouchableOpacity
                  key={String(item.id)}
                  style={[styles.recipeCard, idx % 2 === 1 && { marginLeft: 16 }]}
                  onPress={() => openRecipe(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${item.title}`}
                >
                  {item.image !== undefined ? (
                    <Image source={{ uri: item.image }} style={styles.recipeImage} resizeMode="cover" />
                  ) : (
                    <View style={[styles.recipeImage, { backgroundColor: '#dfeaec' }]} />
                  )}
                  <TouchableOpacity
                    style={styles.favoriteButton}
                    onPress={() => toggleFavourite({ id: item.id, title: item.title, image: item.image ?? null })}
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
                </TouchableOpacity>
              );
            })}
          </View>
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
    height: 160,
    borderRadius: 18,
    overflow: 'hidden',
    marginRight: 16,
    backgroundColor: '#abe1e5',
    marginBottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    borderRadius: 18,
  },
  featuredOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 16,
    backgroundColor: 'rgba(171, 225, 229, 0.7)',
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
  chefCard: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    width: 90,
    height: 110,
    marginBottom: 0,
    justifyContent: 'center',
  },
  chefAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginBottom: 6,
  },
  chefName: {
    fontSize: 13,
    color: '#20515a',
    fontWeight: 'bold',
    textAlign: 'center',
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