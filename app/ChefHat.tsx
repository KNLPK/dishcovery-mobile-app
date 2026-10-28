/**
 * app/ChefHat.tsx
 *
 * Cook: recipes from what you have (Claude Design handoff, "Cook").
 *
 * One ingredient field, with suggestions as you type; what you add becomes a
 * chip you can remove, and common ingredients are one tap away. Two compact
 * filters, category and cook time, each open a sheet. There is no Find
 * button: 300 ms after the ingredients or filters change, the search runs on
 * its own, and a change while one is still under way cancels it, so only the
 * latest search can show results or count as this screen's last response.
 * Nothing is searched until there is an ingredient or an active filter.
 *
 * The format is the pill in the header (components/FormatPill.tsx).
 *
 * Each result card shows the cook time and how many of your ingredients the
 * recipe uses, when the server sends them (the hosted catalog does; a card
 * without them is just the title).
 */

import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import BottomTabBar, { useTabBarSpace } from '../components/BottomTabBar';
import { SecondaryButton } from '../components/Buttons';
import FormatPill from '../components/FormatPill';
import { FormField, KeyboardForm } from '../components/KeyboardForm';
import type { LastMeasurement } from '../components/MetricsBar';
import { HeartButton, Pop, PressableScale, StaggerItem } from '../components/motion';
import RecipeImage from '../components/RecipeImage';
import { Screen, TabHeader } from '../components/Screen';
import { Sheet } from '../components/Sheet';
import { ConnectingState, ErrorState, NoServerState, WaitState } from '../components/StateViews';
import { ALL_CATEGORIES as ALL, CATEGORY_CHIPS_WITH_ALL, categoryType } from '../constants/categories';
import { COMMON_INGREDIENTS, suggestIngredients } from '../constants/ingredients';
import { palette, radius, shadow, spacing, touchTarget, type } from '../constants/theme';
import { searchRecipes, type SearchResultItem } from '../src/api/client';
import { describeRequestError, type RequestFailure } from '../src/api/errors';
import { serverRequest } from '../src/api/serverStatus';
import { useServer } from '../src/api/useServer';
import { useSettings } from '../src/settings/settings';
import { toggleFavouriteWithToast } from '../src/ui/favourites';
import { showToast } from '../src/ui/toast';

/** How long the ingredients and filters must stay unchanged before a search runs. */
const DEBOUNCE_MS = 300;
const RESULTS = 10;

/**
 * Cook time is a choice, not a typed number: any, or at most 30, 45 or 60
 * minutes, sent as maxReadyTime. There is no 15-minute choice: the shortest
 * catalog recipe takes 20 minutes, so it could only ever find nothing.
 */
type CookTime = 'any' | '30' | '45' | '60';
const COOK_TIMES: { value: CookTime; label: string }[] = [
  { value: 'any', label: 'Any time' },
  { value: '30', label: '30 min or less' },
  { value: '45', label: '45 min or less' },
  { value: '60', label: '60 min or less' },
];

type Results = { items: SearchResultItem[]; total: number };

/** "chicken", "chicken or rice", "chicken, rice or egg": the catalog finds recipes with any of them. */
function either(names: readonly string[]): string {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}

export default function ChefHat() {
  const [ingredients, setIngredients] = useState<string[]>([]);
  // Chips on their way out (Pop): removed from `ingredients` once they have faded.
  const [leaving, setLeaving] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const [category, setCategory] = useState(ALL);
  const [cookTime, setCookTime] = useState<CookTime>('any');
  const [sheet, setSheet] = useState<'category' | 'time' | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Results | null>(null);
  const [failure, setFailure] = useState<RequestFailure | null>(null);
  const [last, setLast] = useState<LastMeasurement | null>(null);
  const [waking, setWaking] = useState(false);
  const [retries, setRetries] = useState(0);
  const server = useServer();
  const router = useRouter();
  const settings = useSettings();
  const tabBarSpace = useTabBarSpace();

  const active = ingredients.length > 0 || category !== ALL || cookTime !== 'any';
  const key = JSON.stringify([ingredients, category, cookTime]);

  useEffect(() => {
    if (!active || server.url === null) {
      setLoading(false);
      setWaking(false);
      setResults(null);
      setFailure(null);
      return;
    }
    const controller = new AbortController();
    const stale = () => controller.signal.aborted;
    const timer = setTimeout(async () => {
      setLoading(true);
      setWaking(false);
      setFailure(null);
      const type = categoryType(category);
      const params: Record<string, string | number> = {
        includeIngredients: ingredients.join(','),
        ...(type === null ? {} : { type }),
        ...(cookTime === 'any' ? {} : { maxReadyTime: Number(cookTime) }),
        number: RESULTS,
      };
      try {
        // Same measured path as search and recipe detail, in the app-wide format.
        const { data, meta } = await serverRequest(() => searchRecipes(params, undefined, controller.signal), {
          what: 'Finding recipes',
          onWaking: () => {
            if (!stale()) setWaking(true);
          },
        });
        if (stale()) return;
        const items = data.results ?? [];
        setResults({ items, total: data.totalResults ?? items.length });
        setLast({
          payloadBytes: meta.payloadBytes,
          deserializationMs: meta.deserializationMs,
          heapDeltaBytes: meta.heapDeltaBytes,
          format: meta.format,
          formatFallbackFrom: meta.formatFallbackFrom,
          empty: items.length === 0,
        });
      } catch (err) {
        if (stale()) return;
        const described = describeRequestError(err, 'find recipes');
        setResults(null);
        setFailure(described);
        showToast({ kind: 'error', message: described.title, action: { label: 'Retry', onPress: () => setRetries((n) => n + 1) } });
      } finally {
        if (!stale()) {
          setLoading(false);
          setWaking(false);
        }
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `key` stands for ingredients, category and cookTime.
  }, [key, active, retries, server.url]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = (name: string) => {
    const clean = name.trim().toLowerCase();
    setDraft('');
    if (clean === '' || ingredients.includes(clean)) return;
    setIngredients([...ingredients, clean]);
  };
  const remove = (name: string) => setLeaving((l) => (l.includes(name) ? l : [...l, name]));
  const gone = (name: string) => {
    setIngredients((list) => list.filter((i) => i !== name));
    setLeaving((l) => l.filter((i) => i !== name));
  };

  // While there is text in the field, focused or not (a tap on a suggestion may blur it first).
  const suggestions = suggestIngredients(draft, ingredients);
  const common = COMMON_INGREDIENTS.filter((i) => !ingredients.includes(i));
  const timeLabel = COOK_TIMES.find((t) => t.value === cookTime)?.label ?? '';
  const count = results === null || loading ? '' : `${results.total} ${results.total === 1 ? 'recipe' : 'recipes'}`;

  return (
    <Screen background={palette.ground} tabBar>
      <KeyboardForm contentContainerStyle={[styles.page, { paddingBottom: tabBarSpace }]}>
        <TabHeader
          title="Cook"
          subtitle="Find recipes from what you have"
          right={<FormatPill last={last} busy={loading} />}
        />

        {/* The ingredient field, and suggestions while typing */}
        <FormField
          look="outlined"
          style={styles.field}
          value={draft}
          onChangeText={setDraft}
          onFocus={() => setTyping(true)}
          onBlur={() => setTyping(false)}
          onSubmitEditing={() => add(draft)}
          submitBehavior="submit"
          returnKeyType="done"
          placeholder="Add an ingredient"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Add an ingredient"
          leading={<Feather name="plus" size={20} color={typing ? palette.primary : palette.muted} style={styles.fieldIcon} />}
          trailing={typing && draft.trim() !== '' ? <Text style={styles.enterHint}>Enter to add</Text> : null}
        />
        {suggestions.length > 0 && (
          <View style={styles.suggestions} accessibilityLabel="Suggestions">
            {suggestions.map((s) => {
              const typed = draft.trim().toLowerCase();
              const at = s.startsWith(typed) ? 0 : s.indexOf(` ${typed}`) + 1;
              return (
                <Pressable
                  key={s}
                  onPress={() => add(s)}
                  style={({ pressed }) => [styles.suggestion, pressed && styles.suggestionPressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${s}`}
                >
                  <Text style={styles.suggestionText}>
                    {s.slice(0, at)}
                    <Text style={styles.bold}>{s.slice(at, at + typed.length)}</Text>
                    {s.slice(at + typed.length)}
                  </Text>
                  <Feather name="plus" size={18} color={palette.muted} />
                </Pressable>
              );
            })}
          </View>
        )}

        {/* What has been added */}
        {ingredients.length > 0 && (
          <View style={styles.chips}>
            {ingredients.map((name) => (
              <Pop key={name} leaving={leaving.includes(name)} onLeft={() => gone(name)}>
                <PressableScale
                  style={styles.chip}
                  onPress={() => remove(name)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${name}`}
                >
                  <Text style={styles.chipText}>{name}</Text>
                  <Feather name="x" size={16} color={palette.surface} />
                </PressableScale>
              </Pop>
            ))}
          </View>
        )}

        {/* One tap to add */}
        <Text style={styles.label}>Common</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.bleed}
          contentContainerStyle={styles.commonRow}
          keyboardShouldPersistTaps="handled"
        >
          {common.map((name) => (
            <PressableScale
              key={name}
              style={styles.addChip}
              onPress={() => add(name)}
              accessibilityRole="button"
              accessibilityLabel={`Add ${name}`}
            >
              <Feather name="plus" size={14} color={palette.primary} />
              <Text style={styles.addChipText}>{name}</Text>
            </PressableScale>
          ))}
        </ScrollView>

        {/* The two filters, and how many recipes */}
        <View style={styles.filters}>
          <FilterPill
            label={category === ALL ? 'All categories' : category}
            active={category !== ALL}
            onPress={() => setSheet('category')}
            accessibilityLabel={`Category: ${category === ALL ? 'all' : category}. Change`}
          />
          <FilterPill
            label={cookTime === 'any' ? 'Any time' : `≤ ${cookTime} min`}
            active={cookTime !== 'any'}
            onPress={() => setSheet('time')}
            accessibilityLabel={`Cook time: ${timeLabel}. Change`}
          />
          <Text style={styles.count}>{count}</Text>
        </View>

        {/* Results */}
        {server.url === null ? (
          <View style={styles.state}>
            <NoServerState mode={server.mode} />
          </View>
        ) : !active ? (
          <View style={styles.empty}>
            <Image source={require('../assets/brand/cook-empty.png')} style={styles.emptyArt} accessibilityIgnoresInvertColors />
            <Text style={styles.emptyTitle}>{"What's in your kitchen?"}</Text>
            <Text style={styles.emptyText}>Add an ingredient or tap one above. Recipes appear here as you go.</Text>
          </View>
        ) : loading ? (
          <View style={styles.state}>
            <WaitState variant="list" count={3} label="Finding recipes" />
          </View>
        ) : failure !== null ? (
          <View style={styles.state}>
            <ErrorState failure={failure} onRetry={() => setRetries((n) => n + 1)} />
          </View>
        ) : results !== null && results.items.length === 0 ? (
          <View style={styles.noMatch}>
            <Image source={require('../assets/brand/cook-no-match.png')} style={styles.emptyArt} accessibilityIgnoresInvertColors />
            <Text style={styles.emptyTitle}>No recipes match</Text>
            <Text style={styles.emptyText}>
              {ingredients.length > 0 ? `Nothing with ${either(ingredients)}` : 'Nothing'}
              {category === ALL ? '' : ` as ${/^[aeiou]/i.test(category) ? 'an' : 'a'} ${category.toLowerCase()}`}
              {cookTime === 'any' ? '' : ` in ${cookTime} minutes or less`}.
              {category === ALL && cookTime === 'any' ? ' Try another ingredient.' : ''}
            </Text>
            {/* One way out per active filter. Ingredients are never removed for you. */}
            <View style={styles.noMatchActions}>
              {category !== ALL && (
                <SecondaryButton label={`Remove “${category}”`} icon="x" onPress={() => setCategory(ALL)} />
              )}
              {cookTime !== 'any' && <SecondaryButton label="Any cook time" icon="x" onPress={() => setCookTime('any')} />}
            </View>
          </View>
        ) : results !== null ? (
          <View style={styles.results}>
            {results.items.map((item, i) => {
              const saved = settings.favourites.some((f) => f.id === Number(item.id));
              return (
                <StaggerItem key={item.id} index={i}>
                <PressableScale
                  style={styles.card}
                  onPress={() => router.push({ pathname: '/recipe', params: { id: item.id } })}
                  accessibilityRole="button"
                  accessibilityLabel={
                    `Open ${item.title}` +
                    (item.readyInMinutes !== undefined ? `, ${item.readyInMinutes} minutes` : '') +
                    (item.usedIngredientCount !== undefined ? `, uses ${item.usedIngredientCount} of your ingredients` : '')
                  }
                >
                  <View>
                    <RecipeImage uri={item.image} id={item.id} title={item.title} style={styles.cardImage} />
                    <HeartButton
                      style={styles.heart}
                      saved={saved}
                      onPress={() => toggleFavouriteWithToast({ id: item.id, title: item.title, image: item.image ?? null })}
                      label={saved ? `Remove ${item.title} from saved` : `Save ${item.title}`}
                    />
                  </View>
                  <View style={styles.cardBody}>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    {(item.readyInMinutes !== undefined || item.usedIngredientCount !== undefined) && (
                      <View style={styles.meta}>
                        {item.readyInMinutes !== undefined && (
                          <View style={styles.time}>
                            <Feather name="clock" size={14} color={palette.muted} />
                            <Text style={styles.timeText}>{item.readyInMinutes} min</Text>
                          </View>
                        )}
                        {item.usedIngredientCount !== undefined && (
                          <Text style={styles.uses}>Uses {item.usedIngredientCount} of your ingredients</Text>
                        )}
                      </View>
                    )}
                  </View>
                </PressableScale>
                </StaggerItem>
              );
            })}
            {results.total > results.items.length && (
              <Text style={styles.more}>Showing the first {results.items.length}. Add an ingredient or a filter to narrow it down.</Text>
            )}
          </View>
        ) : null}
      </KeyboardForm>

      <OptionSheet
        visible={sheet === 'category'}
        title="Category"
        options={CATEGORY_CHIPS_WITH_ALL}
        selected={category}
        onSelect={setCategory}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'time'}
        title="Cook time"
        options={COOK_TIMES}
        selected={cookTime}
        onSelect={setCookTime}
        onClose={() => setSheet(null)}
      />
      {waking && <ConnectingState />}
      <BottomTabBar />
    </Screen>
  );
}

function FilterPill({
  label,
  active,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <PressableScale
      style={[styles.filter, active && styles.filterActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text>
      <Feather name="chevron-down" size={16} color={active ? palette.surface : palette.primary} />
    </PressableScale>
  );
}

/** A sheet of single choices; a tap applies one and closes the sheet. */
function OptionSheet<T extends string>({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: readonly { value: T; label: string }[];
  selected: T;
  onSelect: (value: T) => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View accessibilityRole="radiogroup" accessibilityLabel={title}>
        {options.map((o) => {
          const on = o.value === selected;
          return (
            <Pressable
              key={o.value}
              style={({ pressed }) => [styles.option, pressed && styles.suggestionPressed]}
              onPress={() => {
                onSelect(o.value);
                onClose();
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
            >
              <View style={styles.radio}>{on && <View style={styles.radioDot} />}</View>
              <Text style={styles.optionText}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.sheetNote}>Tap to apply.</Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 20, flexGrow: 1 },
  field: { height: 52 },
  fieldIcon: { marginLeft: spacing.xs },
  enterHint: { ...type.label, color: palette.muted, marginRight: spacing.sm },
  suggestions: {
    marginTop: 6,
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    paddingVertical: spacing.xs,
    ...shadow.card,
  },
  suggestion: {
    height: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  suggestionPressed: { backgroundColor: palette.surfaceTint },
  suggestionText: { fontSize: 15, color: palette.ink },
  bold: { fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  chip: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 14,
    paddingRight: 10,
    borderRadius: radius.pill,
    backgroundColor: palette.primary,
  },
  chipText: { fontSize: 14, fontWeight: '600', color: palette.surface },
  label: { ...type.label, color: palette.muted, marginTop: spacing.lg },
  bleed: { marginHorizontal: -20, marginTop: spacing.sm, flexGrow: 0 },
  commonRow: { gap: spacing.sm, paddingHorizontal: 20 },
  addChip: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingLeft: 10,
    paddingRight: 14,
    borderRadius: radius.pill,
    backgroundColor: palette.surface,
    borderWidth: 1.5,
    borderColor: palette.border,
  },
  addChipText: { fontSize: 14, fontWeight: '600', color: palette.primary },
  filters: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
  filter: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingLeft: 14,
    paddingRight: 10,
    borderRadius: radius.pill,
    backgroundColor: palette.surface,
    borderWidth: 1.5,
    borderColor: palette.border,
  },
  filterActive: { backgroundColor: palette.primary, borderColor: palette.primary },
  filterText: { fontSize: 14, fontWeight: '600', color: palette.primary },
  filterTextActive: { color: palette.surface },
  count: { ...type.label, fontWeight: '500', color: palette.muted, marginLeft: 'auto', fontVariant: ['tabular-nums'] },
  state: { marginTop: spacing.lg },
  empty: { alignItems: 'center', paddingTop: 56 },
  noMatch: { alignItems: 'center', paddingTop: 40 },
  emptyArt: { width: 160, height: 120 },
  emptyTitle: { ...type.section, color: palette.ink, marginTop: spacing.lg, textAlign: 'center' },
  emptyText: { ...type.body, color: palette.muted, marginTop: 6, maxWidth: 270, textAlign: 'center' },
  noMatchActions: { marginTop: 20, gap: spacing.sm, alignItems: 'center' },
  results: { gap: spacing.md, marginTop: spacing.lg },
  card: { backgroundColor: palette.surface, borderRadius: radius.lg, overflow: 'hidden', ...shadow.card },
  cardImage: { width: '100%', height: 128 },
  heart: { position: 'absolute', top: spacing.sm, right: spacing.sm },
  more: { ...type.caption, color: palette.muted, textAlign: 'center', paddingHorizontal: spacing.lg },
  cardBody: { paddingHorizontal: 14, paddingTop: spacing.md, paddingBottom: 14 },
  cardTitle: { ...type.cardTitle, color: palette.ink },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.md, rowGap: 2, marginTop: 6 },
  time: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  timeText: { ...type.label, fontWeight: '400', color: palette.muted, fontVariant: ['tabular-nums'] },
  uses: { ...type.label, color: palette.primary },
  option: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eef3f4',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.primary },
  optionText: { fontSize: 15, color: palette.ink },
  sheetNote: { ...type.label, fontWeight: '400', color: palette.muted, marginTop: spacing.sm },
});
