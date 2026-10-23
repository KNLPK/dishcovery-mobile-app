/**
 * constants/illustrativePhotos.ts
 *
 * Twenty-eight bundled food photos (Unsplash License; sources in
 * docs/IMAGE_CREDITS.md) shown in place of recipe photos the catalog does not
 * have. The generated recipes' `image` field is a generated:// reference and
 * stays exactly as it is in the payloads; the photo is picked here, in the UI,
 * so it only illustrates the kind of dish.
 *
 * Two steps:
 *   1. The kind of dish, from words in the title. Rules are checked in order
 *      and the first match wins, so a dessert word beats everything (a
 *      "Chocolate Rice Pudding" is a dessert), a noodle dish is shown as
 *      noodles whatever is in it, and the main ingredient beats the form of
 *      the dish ("Trout ... Broth" is fish, not soup).
 *   2. One of that kind's photos, from the recipe id. The same recipe always
 *      gets the same photo, on every screen, and recipes of the same kind next
 *      to each other in a list mostly get different ones.
 */

import type { ImageSourcePropType } from 'react-native';

export type PhotoKey =
  | 'dessert'
  | 'noodles'
  | 'chicken'
  | 'beef'
  | 'pork'
  | 'fish'
  | 'egg'
  | 'pasta'
  | 'rice'
  | 'curry'
  | 'soup'
  | 'salad'
  | 'breakfast'
  | 'fallback';

const RULES: readonly (readonly [PhotoKey, RegExp])[] = [
  ['dessert', /\b(cake|cakes|tart|tarts|pudding|cookies?|brownies?|ice cream|mousse|custard|sorbet|chocolate|cheesecake|crumble|flan|panna cotta|tiramisu|dessert|macarons?|pastry|doughnuts?|cobbler|compote|halwa|mochi)\b/i],
  ['noodles', /\b(noodles?|ramen|udon|soba|pho|laksa|lo mein|chow mein|pad thai|vermicelli|sevai)\b/i],
  ['chicken', /\b(chicken|duck|turkey|poultry|quail|hen)\b/i],
  ['beef', /\b(beef|steak|veal|lamb|mutton|goat|brisket|oxtail|short ribs?|venison|meatballs?)\b/i],
  ['pork', /\b(pork|bacon|ham|sausages?|chorizo|pancetta|prosciutto|belly|kielbasa)\b/i],
  ['fish', /\b(fish|salmon|trout|cod|tuna|halibut|snapper|mackerel|sardines?|anchov(y|ies)|shrimp|prawns?|seafood|crab|lobster|mussels?|clams?|scallops?|squid|octopus|calamari)\b/i],
  ['egg', /\b(eggs?|frittata|omelet(te)?|shakshuka|quiche)\b/i],
  ['pasta', /\b(pasta|spaghetti|orzo|linguine|penne|fettuccine|ravioli|gnocchi|gnudi|lasagna|macaroni|couscous|dumplings?)\b/i],
  ['rice', /\b(rice|risotto|paella|pilaf|pilau|biryani|congee|jambalaya)\b/i],
  ['curry', /\b(curry|curries|curried|masala|korma|vindaloo|dal|dhal|rendang)\b/i],
  ['soup', /\b(soup|broth|stew|chowder|bisque|chili|chilli|gumbo|tagine)\b/i],
  ['salad', /\b(salad|slaw|vegetables?|veggie|greens|tofu|chickpeas?|lentils?|beans?|eggplant|aubergine|cauliflower|mushrooms?|grain|freekeh|quinoa|stir[- ]?fr(y|ies|ied))\b/i],
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

const PHOTOS: Record<PhotoKey, readonly ImageSourcePropType[]> = {
  dessert: [require('../assets/images/food/dessert-1.webp'), require('../assets/images/food/dessert-2.webp')],
  noodles: [require('../assets/images/food/noodles-1.webp'), require('../assets/images/food/noodles-2.webp')],
  chicken: [require('../assets/images/food/chicken-1.webp'), require('../assets/images/food/chicken-2.webp')],
  beef: [require('../assets/images/food/beef-1.webp'), require('../assets/images/food/beef-2.webp')],
  pork: [require('../assets/images/food/pork-1.webp'), require('../assets/images/food/pork-2.webp')],
  fish: [require('../assets/images/food/fish-1.webp'), require('../assets/images/food/fish-2.webp')],
  egg: [require('../assets/images/food/egg-1.webp'), require('../assets/images/food/egg-2.webp')],
  pasta: [require('../assets/images/food/pasta-1.webp'), require('../assets/images/food/pasta-2.webp')],
  rice: [require('../assets/images/food/rice-1.webp'), require('../assets/images/food/rice-2.webp')],
  curry: [require('../assets/images/food/curry-1.webp'), require('../assets/images/food/curry-2.webp')],
  soup: [require('../assets/images/food/soup-1.webp'), require('../assets/images/food/soup-2.webp')],
  salad: [require('../assets/images/food/salad-1.webp'), require('../assets/images/food/salad-2.webp')],
  breakfast: [require('../assets/images/food/breakfast-1.webp'), require('../assets/images/food/breakfast-2.webp')],
  fallback: [require('../assets/images/food/fallback-1.webp'), require('../assets/images/food/fallback-2.webp')],
};

/**
 * Which of a kind's photos a recipe gets: a hash of its id, so the choice
 * does not follow the id's parity (consecutive ids are common in the catalog).
 * Without an id (a suggestion card, an ingredient), the first photo.
 */
export function photoIndexFor(id: number | string | null | undefined, count: number): number {
  const n = Number(id);
  if (id === null || id === undefined || !Number.isFinite(n)) return 0;
  let h = Math.trunc(n) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  return (h >>> 0) % count;
}

export function illustrativePhoto(
  title: string | null | undefined,
  id?: number | string | null,
): ImageSourcePropType {
  const photos = PHOTOS[photoKeyFor(title)];
  return photos[photoIndexFor(id, photos.length)];
}
