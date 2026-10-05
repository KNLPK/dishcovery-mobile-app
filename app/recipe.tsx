import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Image, ScrollView, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomTabBar from '../components/BottomTabBar'; // Adjust the path if needed
import MetricsBar, { type LastMeasurement } from '../components/MetricsBar';
import { ErrorState, LoadingState } from '../components/StateViews';
import { useLocalSearchParams, useRouter } from 'expo-router'; // If using expo-router
import { fetchRecipe } from '../src/api/client';
import { describeRequestError, type RequestFailure } from '../src/api/errors';
import { toggleFavourite, useSettings } from '../src/settings/settings';
// import { useRoute, useNavigation } from '@react-navigation/native'; // If using React Navigation


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

    setLoading(true);
    setFailure(null);
    try {
      // Routed through the measuring client, in whichever format the user has
      // selected. Every format returns the identical canonical document, so
      // rendering below is unaffected by the choice.
      const { data, meta } = await fetchRecipe(String(recipeId), format);
      setRecipe(data);
      setLast({
        payloadBytes: meta.payloadBytes,
        deserializationMs: meta.deserializationMs,
        heapDeltaBytes: meta.heapDeltaBytes,
        format: meta.format,
      });
    } catch (err) {
      setFailure(describeRequestError(err, 'load this recipe'));
    } finally {
      setLoading(false);
    }
  }, [recipeId, format]);

  useEffect(() => {
    load();
  }, [load]);


  if (loading && recipe === null) {
    return (
      <View style={styles.centered}>
        <LoadingState label="Loading recipe…" />
      </View>
    );
  }

  if (failure !== null) {
    return (
      <View style={styles.centeredPadded}>
        <ErrorState failure={failure} onRetry={load} />
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 20 }}>
          <Text style={{ color: '#20515a', fontWeight: 'bold' }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!recipe) {
       return (
         <View style={styles.centered}>
           <Text>Recipe not found.</Text>
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
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Recipe Image */}
        {recipe.image ? (
          <Image source={{ uri: recipe.image }} style={styles.recipeImage} resizeMode="cover" />
        ) : (
            <View style={styles.noImageIcon}>
                 <MaterialCommunityIcons name="food-off" size={80} color="#b0b0b0" />
                 <Text style={{marginTop: 10, color: '#b0b0b0'}}>No Image Available</Text>
            </View>
        )}


        {/* Header Overlay */}
        <View style={styles.headerOverlay}>
          <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
            <MaterialCommunityIcons name="close" size={24} color="#22313F" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.favoriteButton}
            onPress={() =>
              toggleFavourite({
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
        <View style={styles.content}>
          {/* Format selector and what this fetch cost */}
          <View style={{ marginBottom: 16 }}>
            <MetricsBar last={last} busy={loading} />
          </View>

          {/* Title and Cook Time */}
          <View style={styles.titleRow}>
            <Text style={styles.recipeTitle}>{recipe.title}</Text>
            <View style={styles.cookTime}>
              <MaterialCommunityIcons name="clock-outline" size={16} color="#888" />
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
            >
              <Text style={[styles.tabText, activeTab === 'ingredients' && styles.activeTabText]}>Ingredients</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'instructions' && styles.activeTab]}
              onPress={() => setActiveTab('instructions')}
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
        </View>
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
      color: 'red',
      textAlign: 'center',
      padding: 20,
  },
  recipeImage: {
    width: '100%',
    height: 250, // Adjust height as needed
  },
  noImageIcon: {
      width: '100%',
      height: 250,
      backgroundColor: '#f0f0f0',
      justifyContent: 'center',
      alignItems: 'center',
  },
  headerOverlay: {
    position: 'absolute',
    top: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    zIndex: 1, // Ensure icons are above the image
  },
  closeButton: {
      backgroundColor: '#fff',
      borderRadius: 20,
      padding: 8,
      elevation: 4, // Shadow for Android
      shadowColor: '#000', // Shadow for iOS
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 3,
  },
  favoriteButton: {
      backgroundColor: '#fff',
      borderRadius: 20,
      padding: 8,
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
    color: '#888',
    marginLeft: 4,
  },
  summaryText: {
      fontSize: 14,
      color: '#555',
      marginBottom: 15,
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
    paddingBottom: 10,
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#20515a', // Active tab indicator color
  },
  tabText: {
    fontSize: 16,
    color: '#888',
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
       color: '#888',
       textAlign: 'center',
       paddingVertical: 20,
   }
});
