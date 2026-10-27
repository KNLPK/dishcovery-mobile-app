/**
 * constants/ingredients.ts
 *
 * The ingredients Cook offers: the one-tap "Common" chips, and the words the
 * ingredient field suggests as you type.
 *
 * Every word here occurs in the ingredient names of at least two recipes in
 * the online catalog (the generated recipes, fixtures/generated/payloads), so
 * a suggestion never leads to a search the catalog cannot answer on its own.
 * The proxy matches an ingredient as part of a name ("tomato" finds "cherry
 * tomatoes"), so words are singular. Most used first: that is the order the
 * suggestions are offered in.
 */

/** The "Common" row, in the design's order. */
export const COMMON_INGREDIENTS = [
  'chicken',
  'egg',
  'rice',
  'tofu',
  'beef',
  'salmon',
  'tomato',
  'onion',
  'garlic',
  'pasta',
] as const;

export const INGREDIENTS: readonly string[] = [
  'garlic', 'onion', 'lemon', 'butter', 'olive oil', 'vinegar', 'sugar', 'cilantro', 'tomato', 'tomato paste',
  'parsley', 'cumin', 'ginger', 'lime', 'sesame', 'rice', 'chili', 'egg', 'cream', 'cheese',
  'corn', 'cinnamon', 'carrot', 'milk', 'paprika', 'flour', 'mint', 'honey', 'shallot', 'soy sauce',
  'turmeric', 'coconut', 'coconut milk', 'bean', 'apple', 'cucumber', 'bell pepper', 'almond', 'mushroom', 'cardamom',
  'orange', 'thyme', 'scallion', 'potato', 'sweet potato', 'celery', 'pork', 'fish', 'chicken', 'cherry tomato',
  'beef', 'avocado', 'peanut', 'basil', 'bread', 'noodle', 'pear', 'chickpea', 'raisin', 'cabbage',
  'spinach', 'rosemary', 'parmesan', 'leek', 'squash', 'zucchini', 'feta', 'pistachio', 'tamarind', 'tofu',
  'pumpkin', 'tortilla', 'couscous', 'saffron', 'fig', 'shrimp', 'lentil', 'sausage', 'walnut', 'miso',
  'mozzarella', 'bacon', 'barley', 'plum', 'duck', 'kimchi', 'lamb', 'cashew', 'squid', 'prawn',
  'pasta', 'lettuce', 'salmon', 'cod', 'yogurt', 'banana', 'mango', 'chocolate', 'bulgur', 'pineapple',
];

/**
 * Up to `limit` suggestions for what is being typed: names that start with it
 * first, then names with a later word that does, leaving out those already
 * added. Empty for an empty field.
 */
export function suggestIngredients(typed: string, exclude: readonly string[], limit = 3): string[] {
  const q = typed.trim().toLowerCase();
  if (q === '') return [];
  const open = INGREDIENTS.filter((name) => !exclude.includes(name) && name !== q);
  const starts = open.filter((name) => name.startsWith(q));
  const later = open.filter((name) => !name.startsWith(q) && name.split(' ').some((w) => w.startsWith(q)));
  return [...starts, ...later].slice(0, limit);
}
