import React, { useRef, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomTabBar, { useTabBarSpace } from '../components/BottomTabBar';
import { PrimaryButton, TextLink } from '../components/Buttons';
import { ChipRow } from '../components/Chips';
import { FormField, KeyboardForm, type FormFieldHandle } from '../components/KeyboardForm';
import MetricsBar, { type LastMeasurement } from '../components/MetricsBar';
import { FadeIn, PressableScale, Skeleton, tapHaptic } from '../components/motion';
import RecipeImage from '../components/RecipeImage';
import { Screen, TabHeader } from '../components/Screen';
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

const CATEGORY_CHIPS = CATEGORIES.map((c) => ({ value: c.label, label: c.label }));

/**
 * Cook time is a choice, not a typed number: "Any", or at most 30, 45 or 60
 * minutes, sent as maxReadyTime. There is no 15-minute chip: the shortest
 * catalog recipe takes 20 minutes, so it could only ever find nothing.
 */
type CookTime = 'any' | '30' | '45' | '60';
const COOK_TIMES: { value: CookTime; label: string }[] = [
  { value: '30', label: '30 min' },
  { value: '45', label: '45 min' },
  { value: '60', label: '60 min' },
  { value: 'any', label: 'Any' },
];

export default function ChefHat() {
  const [selectedCategory, setSelectedCategory] = useState(CATEGORIES[0].label);
  const [ingredients, setIngredients] = useState<Ingredient[]>([
    { name: '', quantity: '' },
  ]);
  const [cookTime, setCookTime] = useState<CookTime>('any');
  const [loading, setLoading] = useState(false);
  const [recipes, setRecipes] = useState<SearchResultItem[]>([]);
  const [error, setError] = useState('');
  const [noMatch, setNoMatch] = useState<string | null>(null);
  const [failure, setFailure] = useState<RequestFailure | null>(null);
  const [last, setLast] = useState<LastMeasurement | null>(null);
  const [waking, setWaking] = useState(false);
  const server = useServer();
  const router = useRouter();
  const tabBarSpace = useTabBarSpace();

  // "Next" walks item, quantity, next item, ...; "Done" on the last quantity
  // closes the keyboard.
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
        setError('Enter at least one ingredient.');
        setLoading(false);
        return;
      }

      const params: Record<string, string | number> = {
        includeIngredients: ingredientList,
        type: categoryType(selectedCategory) ?? '', // a value Spoonacular recognises
        number: 5, // Get up to 5 recipes
      };

      if (cookTime !== 'any') {
        params.maxReadyTime = Number(cookTime);
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
              `${cookTime === 'any' ? '' : ` in ${cookTime} minutes or less`} for ${selectedCategory.toLowerCase()}. ` +
              `Try fewer ingredients${cookTime === 'any' ? '' : ', or a longer cook time'}.`
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
    <Screen background={palette.surfaceCool} tabBar>
      <KeyboardForm contentContainerStyle={[styles.scrollContainer, { paddingBottom: tabBarSpace }]}>
        <TabHeader title="Cook" subtitle="Find recipes from what you have" />

        {/* Category */}
        <Text style={styles.sectionTitle}>Category</Text>
        <View style={styles.chips}>
          <ChipRow
            options={CATEGORY_CHIPS}
            selected={selectedCategory}
            onSelect={setSelectedCategory}
            background={palette.surfaceCool}
            gutter={20}
            accessibilityLabel="Category"
          />
        </View>

        {/* Ingredients */}
        <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Ingredients</Text>
        <View style={styles.columnLabels}>
          <Text style={[styles.columnLabel, styles.ingredientNameInput]}>Item</Text>
          <Text style={[styles.columnLabel, styles.ingredientQuantityInput]}>
            Quantity <Text style={styles.optional}>(optional)</Text>
          </Text>
          <View style={styles.iconButton} />
        </View>
        {ingredients.map((ing, idx) => {
          const lastRow = idx + 1 === ingredients.length;
          return (
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
                returnKeyType={lastRow ? 'done' : 'next'}
                submitBehavior={lastRow ? 'blurAndSubmit' : 'submit'}
                onSubmitEditing={() => {
                  if (!lastRow) focusField(`name${idx + 1}`);
                }}
                accessibilityLabel={`Quantity of ingredient ${idx + 1}, optional`}
              />
              {ingredients.length > 1 ? (
                <TouchableOpacity onPress={() => removeIngredient(idx)} style={styles.iconButton} accessibilityRole="button" accessibilityLabel={`Remove ingredient ${idx + 1}`}>
                   <MaterialCommunityIcons name="minus-circle-outline" size={26} color={palette.muted} />
                </TouchableOpacity>
              ) : (
                <View style={styles.iconButton} />
              )}
            </View>
          );
        })}
        <TextLink label="+ Add ingredient" onPress={addIngredient} style={styles.addIngredient} />

        {/* Cook time */}
        <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Cook time</Text>
        <View style={styles.chips}>
          <ChipRow
            options={COOK_TIMES}
            selected={cookTime}
            onSelect={setCookTime}
            background={palette.surfaceCool}
            gutter={20}
            accessibilityLabel="Cook time"
          />
        </View>

        {/* Find recipes */}
        {server.url === null ? (
          <NoServerState mode={server.mode} />
        ) : (
          <PrimaryButton
            label="Find recipes"
            style={styles.findBtn}
            busy={loading}
            onPress={() => {
              tapHaptic();
              handleFindRecipe();
            }}
          />
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
            <Text style={[styles.sectionTitle, { marginBottom: 10 }]}>Recipes found</Text>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
    scrollContainer: {
      paddingHorizontal: 20,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: palette.ink,
    },
    chips: {
      marginTop: 8,
      marginBottom: 8,
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
    addIngredient: {
      alignSelf: 'flex-start',
      paddingHorizontal: 4,
      marginBottom: 8,
    },
    findBtn: {
      marginTop: 16,
      marginBottom: 20,
    },
    error: {
      color: palette.danger,
      marginTop: 10,
      marginBottom: 10,
      textAlign: 'center',
    },
    recipeCard: {
        backgroundColor: palette.surface,
        borderRadius: radius.md,
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
        color: palette.ink,
    },
});
