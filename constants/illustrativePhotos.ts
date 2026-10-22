/**
 * constants/illustrativePhotos.ts
 *
 * Twelve bundled food photos (Unsplash License; sources in
 * docs/IMAGE_CREDITS.md) shown in place of recipe photos the catalog does not
 * have. The generated recipes' `image` field is a generated:// reference and
 * stays exactly as it is in the payloads; the photo is picked here, in the UI,
 * from words in the recipe title, so it only illustrates the kind of dish.
 *
 * Rules are checked in order and the first match wins, so the main ingredient
 * beats the form of the dish ("Trout ... Broth" is fish, not soup), and a
 * dessert word beats everything (a "Chocolate Rice Pudding" is a dessert).
 */

import type { ImageSourcePropType } from 'react-native';

export type PhotoKey =
  | 'dessert'
  | 'chicken'
  | 'beef'
  | 'pork'
  | 'fish'
  | 'egg'
  | 'pasta'
  | 'rice'
  | 'soup'
  | 'salad'
  | 'breakfast'
  | 'fallback';

const RULES: readonly (readonly [PhotoKey, RegExp])[] = [
  ['dessert', /\b(cake|cakes|tart|tarts|pudding|cookies?|brownies?|ice cream|mousse|custard|sorbet|chocolate|cheesecake|crumble|flan|panna cotta|tiramisu|dessert|macarons?|pastry|doughnuts?|cobbler|compote|halwa|mochi)\b/i],
  ['chicken', /\b(chicken|duck|turkey|poultry|quail|hen)\b/i],
  ['beef', /\b(beef|steak|veal|lamb|mutton|goat|brisket|oxtail|short ribs?|venison|meatballs?)\b/i],
  ['pork', /\b(pork|bacon|ham|sausages?|chorizo|pancetta|prosciutto|belly)\b/i],
  ['fish', /\b(fish|salmon|trout|cod|tuna|halibut|snapper|mackerel|sardines?|anchov(y|ies)|shrimp|prawns?|seafood|crab|lobster|mussels?|clams?|scallops?|squid|octopus|calamari)\b/i],
  ['egg', /\b(eggs?|frittata|omelet(te)?|shakshuka|quiche)\b/i],
  ['pasta', /\b(pasta|noodles?|spaghetti|orzo|linguine|penne|fettuccine|ravioli|gnocchi|gnudi|lasagna|udon|ramen|soba|macaroni|couscous|dumplings?)\b/i],
  ['rice', /\b(rice|risotto|paella|pilaf|pilau|biryani|congee|jambalaya)\b/i],
  ['soup', /\b(soup|broth|stew|chowder|bisque|curry|chili|chilli|gumbo|tagine)\b/i],
  ['salad', /\b(salad|slaw|vegetables?|veggie|greens|tofu|chickpeas?|lentils?|beans?|eggplant|aubergine|cauliflower|mushrooms?|grain|freekeh|quinoa)\b/i],
  ['breakfast', /\b(bread|flatbread|toast|pancakes?|waffles?|muffins?|scones?|porridge|oats?|granola|crepes?|bagels?|buns?|brioche|focaccia|breakfast)\b/i],
];

/** Dish names whose words would otherwise match the wrong rule. */
const NOT_WHAT_IT_SAYS: readonly (readonly [RegExp, string])[] = [
  [/\brice cakes?\b/gi, 'rice'], // Korean tteok: savoury, not a cake
  [/\brice (flour )?flatbread\b/gi, 'flatbread'],
  [/\begg noodles?\b/gi, 'noodles'],
];

export function photoKeyFor(title: string | null | undefined): PhotoKey {
  if (typeof title === 'string') {
    const name = NOT_WHAT_IT_SAYS.reduce((t, [pattern, word]) => t.replace(pattern, word), title);
    for (const [key, pattern] of RULES) if (pattern.test(name)) return key;
  }
  return 'fallback';
}

/* eslint-disable @typescript-eslint/no-require-imports */
const PHOTOS: Record<PhotoKey, ImageSourcePropType> = {
  dessert: require('../assets/images/food/dessert.webp'),
  chicken: require('../assets/images/food/chicken.webp'),
  beef: require('../assets/images/food/beef.webp'),
  pork: require('../assets/images/food/pork.webp'),
  fish: require('../assets/images/food/fish.webp'),
  egg: require('../assets/images/food/egg.webp'),
  pasta: require('../assets/images/food/pasta.webp'),
  rice: require('../assets/images/food/rice.webp'),
  soup: require('../assets/images/food/soup.webp'),
  salad: require('../assets/images/food/salad.webp'),
  breakfast: require('../assets/images/food/breakfast.webp'),
  fallback: require('../assets/images/food/fallback.webp'),
};
/* eslint-enable @typescript-eslint/no-require-imports */

export function illustrativePhoto(title: string | null | undefined): ImageSourcePropType {
  return PHOTOS[photoKeyFor(title)];
}
