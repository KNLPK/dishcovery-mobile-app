import React, { useRef, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomTabBar, { useTabBarSpace } from '../components/BottomTabBar';
import { FormField, KeyboardForm, type FormFieldHandle } from '../components/KeyboardForm';
import MetricsBar, { type LastMeasurement } from '../components/MetricsBar';
import { FadeIn, PressableScale, Skeleton, tapHaptic } from '../components/motion';
import RecipeImage from '../components/RecipeImage';
import { EmptyState, ErrorState, NoServerState, WAKING_LABEL } from '../components/StateViews';
import { useRouter } from 'expo-router';
import { CATEGORIES, categoryType } from '../constants/categories';
import { palette, radius, touchTarget } from '../constants/theme';
import { searchRecipes, type SearchResultItem } from '../src/api/client';
import { describeRequestError, type RequestFailure } from '../src/api/errors';
import { serverRequest } from '../src/api/serverStatus';
import { useServer } from '../src/api/useServer';
import { showToast } from '../src/ui/toast';

type Ingredient = { name: string; quantity: string };

export default function ChefHat() {
  const [selectedCategory, setSelectedCategory] = useState(CATEGORIES[0].label);
  const [ingredients, setIngredients] = useState<Ingredient[]>([
    { name: '', quantity: '' },
  ]);
  const [cookTime, setCookTime] = useState(''); // Cook time in minutes
  const [loading, setLoading] = useState(false);
  const [recipes, setRecipes] = useState<SearchResultItem[]>([]);
  const [error, setError] = useState('');
  const [noMatch, setNoMatch] = useState<string | null>(null);
  const [failure, setFailure] = useState<RequestFailure | null>(null);
  const [last, setLast] = useState<LastMeasurement | null>(null);
  const [waking, setWaking] = useState(false);
  const server = useServer();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarSpace = useTabBarSpace();

  // "Next" walks item, quantity, next item, ..., cook time; "Done" there searches.
  const fields = useRef(new Map<string, FormFieldHandle>());
  const fieldRef = (key: string) => (handle: FormFieldHandle | null) => {
    if (handle === null) fields.current.delete(key);
    else fields.current.set(key, handle);
  };
  const focusField = (key: string) => fields.current.get(key)?.focus();

  const handleIngredientChange = (index: number, field: 'name' | 'quantity', value: string) => {
    const newIngredients = [...ingredients];
    newIngredients[index][field] = value;
    setIngredients(newIngredients);
  };

  const addIngredient = () => {
    setIngredients([...ingredients, { name: '', quantity: '' }]);
  };

  const removeIngredient = (index: number) => {
    const newIngredients = ingredients.filter((_, i) => i !== index);
    setIngredients(newIngredients);
  };

  const handleFindRecipe = async () => {
    setLoading(true);
    setWaking(false);
    setError('');
    setNoMatch(null);
    setFailure(null);
    setRecipes([]); // Clear previous results
    try {
      const ingredientList = ingredients
        .filter(ing => ing.name.trim()) // Only include non-empty ingredient names
        .map(ing => ing.name.trim())
        .join(',');

      if (!ingredientList) {
        setError('Please enter at least one ingredient.');
        setLoading(false);
        return;
      }

      const params: Record<string, string | number> = {
        includeIngredients: ingredientList,
        type: categoryType(selectedCategory) ?? '', // a value Spoonacular recognises
        number: 5, // Get up to 5 recipes
      };

      if (cookTime && !isNaN(parseInt(cookTime))) {
          params.maxReadyTime = parseInt(cookTime); // Add cook time if valid
      }

      // Same measured path as search and recipe detail, in the app-wide format.
      const { data, meta } = await serverRequest(() => searchRecipes(params), {
        what: 'Finding recipes',
        onWaking: () => setWaking(true),
      });
      setLast({
        payloadBytes: meta.payloadBytes,
        deserializationMs: meta.deserializationMs,
        heapDeltaBytes: meta.heapDeltaBytes,
        format: meta.format,
        formatFallbackFrom: meta.formatFallbackFrom,
      });

      const results = data.results ?? [];
      if (results.length === 0) {
          setNoMatch(
            `Nothing came back for ${ingredientList.split(',').join(', ')}` +
              `${cookTime ? ` under ${cookTime} minutes` : ''} for ${selectedCategory.toLowerCase()}. ` +
              'Try fewer ingredients, or clear the cook time.'
          );
      } else {
          setRecipes(results);
      }

    } catch (err) {
      const described = describeRequestError(err, 'find recipes');
      setFailure(described);
      showToast({ kind: 'error', message: described.title, action: { label: 'Retry', onPress: handleFindRecipe } });
    } finally {
      setLoading(false);
      setWaking(false);
    }
  };

  const navigateToRecipeDetail = (recipeId: number) => {
    router.push({ pathname: '/recipe', params: { id: recipeId } });
  };

  return (
    <View style={styles.page}>
      <KeyboardForm
        contentContainerStyle={[styles.scrollContainer, { paddingTop: insets.top + 8, paddingBottom: tabBarSpace }]}
      >
        {/* Header */}
        <View style={styles.headerContainer}>
           <Text style={styles.header} accessibilityRole="header">Dishcovery</Text>
        </View>

        {/* Category */}
        <View style={styles.categoryRow}>
          <Text style={styles.sectionTitle}>Category</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryButtonContainer} keyboardShouldPersistTaps="handled">
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat.label}
              style={[styles.categoryButton, selectedCategory === cat.label && styles.categoryButtonActive]}
              onPress={() => setSelectedCategory(cat.label)}
              hitSlop={{ top: 6, bottom: 6 }}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedCategory === cat.label }}
            >
              <Text style={[styles.categoryText, selectedCategory === cat.label && styles.categoryTextActive]}>{cat.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Ingredients */}
        <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Ingredients</Text>
        <View style={styles.columnLabels}>
          <Text style={[styles.columnLabel, styles.ingredientNameInput]}>Item</Text>
          <Text style={[styles.columnLabel, styles.ingredientQuantityInput]}>
            Quantity <Text style={styles.optional}>(optional)</Text>
          </Text>
          <View style={styles.iconButton} />
        </View>
        {ingredients.map((ing, idx) => (
          <View key={idx} style={styles.ingredientRow}>
            <FormField
              ref={fieldRef(`name${idx}`)}
              style={[styles.input, styles.ingredientNameInput]}
              placeholder="e.g. chicken"
              value={ing.name}
              onChangeText={text => handleIngredientChange(idx, 'name', text)}
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => focusField(`qty${idx}`)}
              accessibilityLabel={`Ingredient ${idx + 1}`}
            />
            <FormField
              ref={fieldRef(`qty${idx}`)}
              style={[styles.input, styles.ingredientQuantityInput]}
              placeholder="e.g. 200 g"
              value={ing.quantity}
              onChangeText={text => handleIngredientChange(idx, 'quantity', text)}
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => focusField(idx + 1 < ingredients.length ? `name${idx + 1}` : 'cookTime')}
              accessibilityLabel={`Quantity of ingredient ${idx + 1}, optional`}
            />
            {ingredients.length > 1 ? (
              <TouchableOpacity onPress={() => removeIngredient(idx)} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Remove ingredient">
                 <MaterialCommunityIcons name="minus-circle-outline" size={26} color={palette.muted} />
              </TouchableOpacity>
            ) : (
               <TouchableOpacity onPress={addIngredient} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Add ingredient">
                  <MaterialCommunityIcons name="plus-circle-outline" size={26} color={palette.muted} />
               </TouchableOpacity>
            )}
          </View>
        ))}
         {ingredients.length > 0 && (
             <TouchableOpacity style={styles.addIngredientRow} onPress={addIngredient} accessibilityRole="button">
                 <MaterialCommunityIcons name="plus-circle-outline" size={22} color={palette.primary} />
                 <Text style={styles.addIngredientText}>Add new Ingredient</Text>
             </TouchableOpacity>
         )}

        {/* Cook Time */}
        <View style={styles.detailRow}>
          <MaterialCommunityIcons name="clock-outline" size={24} color={palette.primary} style={{ marginRight: 8 }} />
          <Text style={styles.detailLabel}>Cook time</Text>
           <FormField
              ref={fieldRef('cookTime')}
              style={styles.detailInput}
              placeholder="45 min"
              value={cookTime}
              onChangeText={setCookTime}
              keyboardType="numeric"
              returnKeyType="done"
              onSubmitEditing={handleFindRecipe}
              accessibilityLabel="Cook time in minutes, optional"
            />
        </View>

        {/* Find Recipe Button */}
        {server.url === null ? (
          <NoServerState mode={server.mode} />
        ) : (
          <PressableScale
            style={styles.findBtn}
            onPress={() => {
              tapHaptic();
              handleFindRecipe();
            }}
            disabled={loading}
            accessibilityRole="button"
            accessibilityState={{ busy: loading, disabled: loading }}
          >
            {loading ? (
              <ActivityIndicator color={palette.surface} />
            ) : (
              <Text style={styles.findBtnText}>Find Food Recipe</Text>
            )}
          </PressableScale>
        )}
        {loading && (
          <Skeleton variant="list" count={3} label="Finding recipes" caption={waking ? WAKING_LABEL : undefined} />
        )}

        {/* Format selector + the last request's measurements */}
        <View style={{ marginTop: 20 }}>
          <MetricsBar last={last} busy={loading} />
        </View>

        {/* Results */}
        {failure !== null && (
          <View style={{ marginTop: 16 }}>
            <ErrorState failure={failure} onRetry={handleFindRecipe} />
          </View>
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {noMatch !== null && <EmptyState title="No recipes matched" detail={noMatch} />}
        {recipes.length > 0 && (
          <FadeIn style={{ marginTop: 24 }}>
            <Text style={[styles.sectionTitle, { marginBottom: 10 }]}>Recipes Found:</Text>
            <View style={{ gap: 10 }}>
              {recipes.map(item => (
                <PressableScale
                  key={item.id}
                  style={styles.recipeCard}
                  onPress={() => navigateToRecipeDetail(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${item.title}`}
                >
                  <RecipeImage uri={item.image} title={item.title} style={styles.recipeImage} />
                  <View style={styles.recipeInfo}>
                     <Text style={styles.recipeTitle}>{item.title}</Text>
                  </View>
                </PressableScale>
              ))}
            </View>
          </FadeIn>
        )}
      </KeyboardForm>
      <BottomTabBar />
    </View>
  );
}

const styles = StyleSheet.create({
    page: {
      flex: 1,
      backgroundColor: palette.surfaceCool,
    },
    scrollContainer: {
      paddingHorizontal: 20,
      backgroundColor: palette.surfaceCool,
    },
    headerContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
      marginTop: 8,
    },
    header: {
      fontSize: 24,
      lineHeight: 30,
      fontWeight: 'bold',
      color: palette.primary,
      alignSelf: 'center',
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: '#22313F',
    },
     categoryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
         marginTop: 8,
    },
    categoryButtonContainer: {
        paddingRight: 20,
        marginBottom: 20,
    },
    categoryButton: {
      backgroundColor: palette.surfaceTint,
      borderRadius: 20,
      paddingHorizontal: 20,
      paddingVertical: 8,
      marginRight: 10,
    },
    categoryButtonActive: {
      backgroundColor: palette.accent,
    },
    categoryText: {
      color: palette.primary,
      fontWeight: '500',
      fontSize: 15,
    },
    categoryTextActive: {
      color: palette.primary,
      fontWeight: 'bold',
    },
    columnLabels: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      marginTop: 8,
      marginBottom: 4,
    },
    columnLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: palette.body,
      marginLeft: 4,
    },
    optional: {
      fontWeight: '400',
      color: palette.muted,
    },
    ingredientRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    input: {
      backgroundColor: palette.surface,
      borderRadius: 10,
      borderColor: palette.border,
      minHeight: touchTarget,
    },
    ingredientNameInput: {
      flex: 1,
      marginRight: 8,
    },
    ingredientQuantityInput: {
      width: 120,
      marginRight: 8,
    },
     iconButton: {
         minWidth: touchTarget,
         minHeight: touchTarget,
         alignItems: 'center',
         justifyContent: 'center',
     },
    addIngredientRow: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: touchTarget,
        marginTop: 4,
        marginBottom: 16,
    },
    addIngredientText: {
        color: palette.primary,
        fontWeight: 'bold',
        marginLeft: 6,
        fontSize: 15,
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: palette.surfaceTint,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 18,
         marginTop: 10,
    },
     detailLabel: {
        color: palette.primary,
        fontWeight: 'bold',
        fontSize: 16,
        marginRight: 8,
     },
    detailInput: {
        flex: 1,
        backgroundColor: palette.surface,
        borderRadius: 10,
        borderColor: palette.border,
        minHeight: touchTarget,
    },
    // The app's primary button: brand teal pill, as on Home and in the Quick test.
    findBtn: {
      backgroundColor: palette.primary,
      borderRadius: radius.pill,
      minHeight: touchTarget,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 10,
      marginBottom: 20,
    },
    findBtnText: {
      color: palette.surface,
      fontWeight: 'bold',
      fontSize: 16,
    },
    error: {
      color: palette.danger,
      marginTop: 10,
      marginBottom: 10,
      textAlign: 'center',
    },
    recipeCard: {
        backgroundColor: palette.surface,
        borderRadius: 12,
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
        elevation: 1,
         shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
    },
    recipeImage: {
        width: 80,
        height: 60,
        borderRadius: 8,
        marginRight: 12,
    },
    recipeInfo: {
        flex: 1,
    },
    recipeTitle: {
        fontWeight: 'bold',
        fontSize: 14,
        color: '#22313F',
    },
});
