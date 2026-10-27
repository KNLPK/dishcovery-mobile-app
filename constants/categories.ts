/**
 * constants/categories.ts
 *
 * The meal-type chips, and what they actually send upstream.
 *
 * WHY THE LABELS CHANGED
 * ----------------------
 * The chips used to read Breakfast / Lunch / Dinner / Snack, and ChefHat sent
 * the lowercased label straight through as Spoonacular's `type` parameter.
 * Spoonacular's `type` vocabulary has no "lunch" and no "dinner" — the valid
 * values are main course, side dish, dessert, appetizer, salad, bread,
 * breakfast, soup, beverage, sauce, marinade, fingerfood, snack and drink. Two
 * of the four chips were therefore sending a value the API does not recognise.
 *
 * Mapping Lunch and Dinner both to "main course" would have made two chips
 * return identical results, which is a quieter version of the same lie. The
 * labels are now four types the API can genuinely distinguish, so every chip
 * changes the results.
 */

export interface Category {
  /** What the chip says. */
  label: string;
  /** The value sent as Spoonacular's `type` query parameter. */
  type: string;
}

export const CATEGORIES: readonly Category[] = [
  { label: 'Breakfast', type: 'breakfast' },
  { label: 'Main course', type: 'main course' },
  { label: 'Snack', type: 'snack' },
  { label: 'Dessert', type: 'dessert' },
] as const;

/** The first chip on Search and Cook, selected by default: no category filter. */
export const ALL_CATEGORIES = 'All';

/** Search and Cook's chips: All, then the four categories. */
export const CATEGORY_CHIPS_WITH_ALL = [
  { value: ALL_CATEGORIES, label: ALL_CATEGORIES },
  ...CATEGORIES.map((c) => ({ value: c.label, label: c.label })),
];

/** The `type` to send for a chip; null for All (and anything unknown). */
export function categoryType(label: string | null): string | null {
  return CATEGORIES.find((c) => c.label === label)?.type ?? null;
}
