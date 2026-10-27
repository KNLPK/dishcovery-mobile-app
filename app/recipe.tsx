import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomTabBar, { useTabBarSpace } from '../components/BottomTabBar';
import MetricsBar, { type LastMeasurement } from '../components/MetricsBar';
import { FadeIn, Skeleton } from '../components/motion';
import RecipeImage, { hasPhoto } from '../components/RecipeImage';
import { Screen, StackHeader } from '../components/Screen';
import { ConnectingState, ErrorState, NoServerState } from '../components/StateViews';
import { useLocalSearchParams } from 'expo-router';
import { palette } from '../constants/theme';
import { fetchRecipe } from '../src/api/client';
import { describeRequestError, type RequestFailure } from '../src/api/errors';
import { serverRequest } from '../src/api/serverStatus';
import { useServer } from '../src/api/useServer';
import { countRecipeView, useSettings } from '../src/settings/settings';
import { toggleFavouriteWithToast } from '../src/ui/favourites';
import { showToast } from '../src/ui/toast';
import { isGeneratedRecipeId } from '../shared/contract';

const SPOONACULAR_URL = 'https://spoonacular.com/food-api';


export default function RecipeDetailScreen() {
  const params = useLocalSearchParams();
  const recipeId = params.id;

  const [recipe, setRecipe] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<RequestFailure | null>(null);
  const [last, setLast] = useState<LastMeasurement | null>(null);
  const [activeTab, setActiveTab] = useState('ingredients'); // 'ingredients' or 'instructions'
  const [waking, setWaking] = useState(false);
  const server = useServer();
  const tabBarSpace = useTabBarSpace();
  // Profile's "Recipes viewed": one per recipe opened, not per format switch.
  const counted = useRef<string | null>(null);

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
      if (counted.current !== String(recipeId)) {
        counted.current = String(recipeId);
        countRecipeView();
      }
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


  const heart =
    recipe === null ? undefined : (
      <TouchableOpacity
        style={styles.headerButton}
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
          color={saved ? '#e74c3c' : palette.primary}
        />
      </TouchableOpacity>
    );

  if (server.url === null && recipe === null) {
    return (
      <Screen background={palette.surfaceCool}>
        <StackHeader title="Recipe" />
        <View style={styles.centeredPadded}>
          <NoServerState mode={server.mode} />
        </View>
      </Screen>
    );
  }

  if (loading && recipe === null) {
    return (
      <Screen background={palette.surfaceCool}>
        <StackHeader title="Recipe" />
        <Skeleton variant="detail" count={5} label="Loading recipe" />
        {waking && <ConnectingState />}
      </Screen>
    );
  }

  if (failure !== null) {
    return (
      <Screen background={palette.surfaceCool}>
        <StackHeader title="Recipe" />
        <View style={styles.centeredPadded}>
          <ErrorState failure={failure} onRetry={load} />
        </View>
      </Screen>
    );
  }

  if (!recipe) {
       return (
         <Screen background={palette.surfaceCool}>
           <StackHeader title="Recipe" />
           <View style={styles.centeredPadded}>
             <Text style={{ color: palette.ink, fontSize: 15, fontWeight: '600' }}>Recipe not found.</Text>
           </View>
         </Screen>
       );
  }

  // Helper to format nutrition data
  const getNutrient = (name: string) => {
      const nutrient = recipe?.nutrition?.nutrients?.find((n: any) => n.name === name);
      return nutrient ? `${Math.round(nutrient.amount)}${nutrient.unit}` : 'N/A';
  };


  return (
    <Screen background={palette.surface} tabBar>
      <StackHeader title="Recipe" right={heart} />
      <ScrollView contentContainerStyle={{ paddingBottom: tabBarSpace }}>
        {/* Photo, full width, below the header */}
        <RecipeImage uri={recipe.image} id={recipe.id} title={recipe.title} style={styles.recipeImage} />
        {!hasPhoto(recipe.image) && (
          // Bottom right of the photo, just above the content card's rounded top.
          <Text style={[styles.photoCaption, { top: 250 - 30 - 30 }]}>Illustrative photo</Text>
        )}

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
              <Text style={styles.cookTimeText}>{recipe.readyInMinutes} min</Text>
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
                <Text style={styles.ingredientsCount}>
                  {recipe.extendedIngredients.length} ingredient{recipe.extendedIngredients.length === 1 ? '' : 's'}
                </Text>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  recipeImage: {
    width: '100%',
    height: 250,
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
  headerButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
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
