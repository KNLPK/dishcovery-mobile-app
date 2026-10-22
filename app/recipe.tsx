import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomTabBar, { useTabBarSpace } from '../components/BottomTabBar';
import MetricsBar, { type LastMeasurement } from '../components/MetricsBar';
import { FadeIn, Skeleton } from '../components/motion';
import RecipeImage, { hasPhoto } from '../components/RecipeImage';
import { ErrorState, NoServerState, WAKING_LABEL } from '../components/StateViews';
import { useLocalSearchParams, useRouter } from 'expo-router'; // If using expo-router
import { fetchRecipe } from '../src/api/client';
import { describeRequestError, type RequestFailure } from '../src/api/errors';
import { serverRequest } from '../src/api/serverStatus';
import { useServer } from '../src/api/useServer';
import { useSettings } from '../src/settings/settings';
import { toggleFavouriteWithToast } from '../src/ui/favourites';
import { showToast } from '../src/ui/toast';
import { isGeneratedRecipeId } from '../shared/contract';
// import { useRoute, useNavigation } from '@react-navigation/native'; // If using React Navigation

const SPOONACULAR_URL = 'https://spoonacular.com/food-api';


export default function RecipeDetailScreen() {
  // If using expo-router:
  const params = useLocalSearchParams();
  const recipeId = params.id;
  const router = useRouter();

  // If using React Navigation:
  // const route = useRoute();
  // const navigation = useNavigation();
  // const recipeId = route.params?.id;


  const [recipe, setRecipe] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<RequestFailure | null>(null);
  const [last, setLast] = useState<LastMeasurement | null>(null);
  const [activeTab, setActiveTab] = useState('ingredients'); // 'ingredients' or 'instructions'
  const [waking, setWaking] = useState(false);
  const server = useServer();
  const insets = useSafeAreaInsets();
  const tabBarSpace = useTabBarSpace();

  // The app-wide serialization setting. Listed in the effect's dependencies, so
  // switching format on this screen re-fetches this recipe in the new format —
  // the decode the panel reports is the one that produced what is on screen.
  const settings = useSettings();
  const { format } = settings;
  const saved = settings.favourites.some((f) => f.id === Number(recipeId));

  const load = React.useCallback(async () => {
    if (!recipeId) {
      setFailure({
        title: 'No recipe selected',
        detail: 'This screen was opened without a recipe id.',
        hint: 'Go back and pick a recipe from search.',
      });
      setLoading(false);
      return;
    }

    if (server.url === null) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setWaking(false);
    setFailure(null);
    try {
      // Routed through the measuring client, in whichever format the user has
      // selected. Every format returns the identical canonical document, so
      // rendering below is unaffected by the choice.
      const { data, meta } = await serverRequest(() => fetchRecipe(String(recipeId), format), {
        what: 'Loading the recipe',
        onWaking: () => setWaking(true),
      });
      setRecipe(data);
      setLast({
        payloadBytes: meta.payloadBytes,
        deserializationMs: meta.deserializationMs,
        heapDeltaBytes: meta.heapDeltaBytes,
        format: meta.format,
      });
    } catch (err) {
      const described = describeRequestError(err, 'load this recipe');
      setFailure(described);
      showToast({ kind: 'error', message: described.title, action: { label: 'Retry', onPress: () => load() } });
    } finally {
      setLoading(false);
      setWaking(false);
    }
  }, [recipeId, format, server.url]);

  useEffect(() => {
    load();
  }, [load]);


  if (server.url === null && recipe === null) {
    return (
      <View style={styles.centeredPadded}>
        <NoServerState mode={server.mode} />
        <TouchableOpacity onPress={() => router.back()} style={styles.backLink} accessibilityRole="button">
          <Text style={{ color: '#20515a', fontWeight: 'bold' }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading && recipe === null) {
    return (
      <View style={styles.container}>
        <Skeleton variant="detail" count={5} label="Loading recipe" caption={waking ? WAKING_LABEL : undefined} />
      </View>
    );
  }

  if (failure !== null) {
    return (
      <View style={styles.centeredPadded}>
        <ErrorState failure={failure} onRetry={load} />
        <TouchableOpacity onPress={() => router.back()} style={styles.backLink} accessibilityRole="button">
          <Text style={{ color: '#20515a', fontWeight: 'bold' }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!recipe) {
       return (
         <View style={styles.centeredPadded}>
           <Text style={{ color: '#1a2b3b', fontSize: 15, fontWeight: '600' }}>Recipe not found.</Text>
           <TouchableOpacity onPress={() => router.back()} style={styles.backLink} accessibilityRole="button">
             <Text style={{ color: '#20515a', fontWeight: 'bold' }}>Go back</Text>
           </TouchableOpacity>
         </View>
       );
  }

  // Helper to format nutrition data
  const getNutrient = (name: string) => {
      const nutrient = recipe?.nutrition?.nutrients?.find((n: any) => n.name === name);
      return nutrient ? `${Math.round(nutrient.amount)}${nutrient.unit}` : 'N/A';
  };


  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: tabBarSpace }}>
        {/* Recipe Image: full bleed, under the status bar */}
        <RecipeImage uri={recipe.image} title={recipe.title} style={[styles.recipeImage, { height: 250 + insets.top }]} />
        {/* Keeps the status bar's dark icons readable over a dark photo. */}
        <View style={[styles.statusScrim, { height: insets.top }]} />
        {!hasPhoto(recipe.image) && (
          // Bottom right of the photo, just above the content card's rounded top.
          <Text style={[styles.photoCaption, { top: 250 + insets.top - 30 - 30 }]}>Illustrative photo</Text>
        )}

        {/* Header Overlay */}
        <View style={[styles.headerOverlay, { top: insets.top + 8 }]}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Close recipe"
          >
            <MaterialCommunityIcons name="close" size={24} color="#22313F" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.favoriteButton}
            onPress={() =>
              toggleFavouriteWithToast({
                id: Number(recipeId),
                title: recipe?.title ?? 'Recipe',
                image: recipe?.image ?? null,
              })
            }
            accessibilityRole="button"
            accessibilityLabel={saved ? 'Remove from saved recipes' : 'Save this recipe'}
          >
            <MaterialCommunityIcons
              name={saved ? 'heart' : 'heart-outline'}
              size={24}
              color={saved ? '#e74c3c' : '#22313F'}
            />
          </TouchableOpacity>
        </View>

        {/* Content Below Image */}
        <FadeIn style={styles.content}>
          {/* Format selector and what this fetch cost */}
          <View style={{ marginBottom: 16 }}>
            <MetricsBar last={last} busy={loading} />
          </View>

          {/* Title and Cook Time */}
          <View style={styles.titleRow}>
            <Text style={styles.recipeTitle}>{recipe.title}</Text>
            <View style={styles.cookTime}>
              <MaterialCommunityIcons name="clock-outline" size={16} color="#5f6e7a" />
              <Text style={styles.cookTimeText}>{recipe.readyInMinutes} Min</Text>
            </View>
          </View>

          {/* Description */}
          {recipe.summary ? (
              <Text style={styles.summaryText}>
                  {/* The API summary might contain HTML tags, simple regex to remove them */}
                  {recipe.summary.replace(/<\/?[^>]+(>|$)/g, '')}
              </Text>
          ) : null}

          {/* Attribution. Spoonacular's terms require a backlink wherever its
              data is shown (laptop mode). The generated recipes, which are all
              the online server has, are labelled as AI-generated instead, so
              they are never mistaken for real recipes. */}
          {isGeneratedRecipeId(Number(recipeId)) ? (
            <Text style={styles.attribution}>AI-generated recipe (Gemini)</Text>
          ) : (
            <Text style={styles.attribution}>
              Recipe data:{' '}
              <Text
                style={styles.attributionLink}
                onPress={() => Linking.openURL(SPOONACULAR_URL)}
                accessibilityRole="link"
              >
                spoonacular.com
              </Text>
            </Text>
          )}

          {/* Nutrition Info */}
          {/* Check if nutrition data exists before rendering */}
          {recipe.nutrition?.nutrients && (
              <View style={styles.nutritionRow}>
                  <View style={styles.nutritionItem}>
                      <MaterialCommunityIcons name="barley" size={24} color="#20515a" />
                      <Text style={styles.nutritionText}>{getNutrient('Carbohydrates')}</Text>
                  </View>
                  <View style={styles.nutritionItem}>
                       <MaterialCommunityIcons name="egg-outline" size={24} color="#20515a" />
                       <Text style={styles.nutritionText}>{getNutrient('Protein')}</Text>
                  </View>
                  <View style={styles.nutritionItem}>
                      <MaterialCommunityIcons name="fire" size={24} color="#20515a" />
                      <Text style={styles.nutritionText}>{getNutrient('Calories')}</Text>
                  </View>
                  <View style={styles.nutritionItem}>
                       <MaterialCommunityIcons name="food-drumstick-outline" size={24} color="#20515a" />
                       <Text style={styles.nutritionText}>{getNutrient('Fat')}</Text>
                  </View>
              </View>
          )}


          {/* Tabs */}
          <View style={styles.tabsContainer}>
            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'ingredients' && styles.activeTab]}
              onPress={() => setActiveTab('ingredients')}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === 'ingredients' }}
            >
              <Text style={[styles.tabText, activeTab === 'ingredients' && styles.activeTabText]}>Ingredients</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'instructions' && styles.activeTab]}
              onPress={() => setActiveTab('instructions')}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === 'instructions' }}
            >
              <Text style={[styles.tabText, activeTab === 'instructions' && styles.activeTabText]}>Instructions</Text>
            </TouchableOpacity>
          </View>

          {/* Tab Content */}
          <View style={styles.tabContent}>
            {activeTab === 'ingredients' ? (
              <View>
                <Text style={styles.ingredientsCount}>{recipe.extendedIngredients.length} Item</Text>
                {recipe.extendedIngredients.map((ingredient: any, index: number) => (
                  <View key={ingredient.id || index} style={styles.ingredientItem}>
                     <MaterialCommunityIcons name="food-outline" size={24} color="#20515a" style={{marginRight: 12}} />
                    <Text style={styles.ingredientText}>
                        {`${ingredient.amount} ${ingredient.unit} ${ingredient.name}`}
                    </Text>
                     {/* Add + and - buttons if needed, mirroring the input section */}
                  </View>
                ))}
              </View>
            ) : (
              <View>
                 {/* Check if instructions exist */}
                {/*
                  Every instruction set, not just the first.

                  This used to render analyzedInstructions[0] only, silently
                  discarding every later set — 108 of the 250 dataset payloads
                  carry more than one. The set's name is shown as a subheading
                  when it has one, and step numbers restart per set, which is
                  how the upstream data is numbered.
                */}
                {recipe.analyzedInstructions && recipe.analyzedInstructions.length > 0 ? (
                    recipe.analyzedInstructions.map((set: any, setIndex: number) => (
                      <View key={setIndex}>
                        {recipe.analyzedInstructions.length > 1 && (
                          <Text style={styles.instructionSetName}>
                            {set.name && set.name.length > 0 ? set.name : `Part ${setIndex + 1}`}
                          </Text>
                        )}
                        {(set.steps ?? []).map((step: any, index: number) => (
                          <View key={`${setIndex}-${step.number ?? index}`} style={styles.instructionItem}>
                            <Text style={styles.stepNumber}>{step.number ?? index + 1}.</Text>
                            <Text style={styles.instructionText}>{step.step}</Text>
                          </View>
                        ))}
                      </View>
                    ))
                ) : (
                    <Text style={styles.noInstructionsText}>No detailed instructions available.</Text>
                )}
              </View>
            )}
          </View>
        </FadeIn>
      </ScrollView>
      <BottomTabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#eaf4f4', // Background color matching the image
  },
  centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#eaf4f4',
  },
  centeredPadded: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'stretch',
      backgroundColor: '#eaf4f4',
      padding: 20,
  },
  instructionSetName: {
      fontSize: 15,
      fontWeight: '700',
      color: '#20515a',
      marginTop: 16,
      marginBottom: 8,
  },
  errorText: {
      color: '#b3261e',
      textAlign: 'center',
      padding: 20,
  },
  recipeImage: {
    width: '100%',
    height: 250,
  },
  statusScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
  },
  photoCaption: {
    position: 'absolute',
    right: 12,
    fontSize: 11,
    fontWeight: '600',
    color: '#ffffff',
    backgroundColor: 'rgba(26, 43, 59, 0.75)',
    borderRadius: 8,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  headerOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    zIndex: 1, // Ensure icons are above the image
  },
  closeButton: {
      backgroundColor: '#fff',
      borderRadius: 24,
      padding: 12,
      elevation: 4, // Shadow for Android
      shadowColor: '#000', // Shadow for iOS
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 3,
  },
  favoriteButton: {
      backgroundColor: '#fff',
      borderRadius: 24,
      padding: 12,
       elevation: 4, // Shadow for Android
      shadowColor: '#000', // Shadow for iOS
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 3,
  },
  content: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    marginTop: -30, // Pull content up over the image
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  recipeTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#22313F',
    flex: 1, // Allow title to take up available space
    marginRight: 10,
  },
  cookTime: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cookTimeText: {
    fontSize: 14,
    color: '#5f6e7a',
    marginLeft: 4,
  },
  summaryText: {
      fontSize: 14,
      color: '#555',
      marginBottom: 15,
  },
  attribution: {
    fontSize: 12,
    color: '#5f6e7a',
    marginBottom: 15,
  },
  attributionLink: {
    color: '#20515a',
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
  nutritionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around', // Distribute items evenly
    alignItems: 'center',
    backgroundColor: '#f3f7f8',
    borderRadius: 10,
    paddingVertical: 12,
    marginBottom: 20,
  },
  nutritionItem: {
    alignItems: 'center',
  },
  nutritionText: {
    fontSize: 12,
    color: '#22313F',
    marginTop: 4,
  },
  tabsContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tabButton: {
    flex: 1, // Make tabs take equal width
    alignItems: 'center',
    justifyContent: 'flex-end',
    minHeight: 48,
    paddingBottom: 10,
  },
  backLink: {
    marginTop: 20,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#20515a', // Active tab indicator color
  },
  tabText: {
    fontSize: 16,
    color: '#5f6e7a',
  },
  activeTabText: {
    color: '#20515a',
    fontWeight: 'bold',
  },
  tabContent: {
      paddingTop: 10, // Space below tabs
  },
  ingredientsCount: {
      fontSize: 15,
      color: '#555',
      marginBottom: 10,
      fontWeight: 'bold',
  },
  ingredientItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#f9faf7', // Light background for each item
      borderRadius: 8,
      padding: 10,
      marginBottom: 8, // Space between items
  },
  ingredientText: {
      fontSize: 14,
      color: '#22313F',
      flex: 1, // Allow text to wrap
  },
  instructionItem: {
      flexDirection: 'row',
      marginBottom: 10,
      alignItems: 'flex-start', // Align step number and text at the top
  },
  stepNumber: {
      fontSize: 14,
      fontWeight: 'bold',
      color: '#20515a',
      marginRight: 8,
  },
  instructionText: {
      fontSize: 14,
      color: '#22313F',
      flex: 1, // Allow text to wrap
  },
   noInstructionsText: {
       fontSize: 14,
       color: '#5f6e7a',
       textAlign: 'center',
       paddingVertical: 20,
   }
});
