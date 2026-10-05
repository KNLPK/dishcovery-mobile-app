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

export function categoryType(label: string | null): string | null {
  return CATEGORIES.find((c) => c.label === label)?.type ?? null;
}
