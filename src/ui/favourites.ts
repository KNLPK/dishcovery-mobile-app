/**
 * src/ui/favourites.ts
 *
 * Saving and unsaving a recipe from any screen, with a toast that says which
 * happened and can undo it.
 */

import { toggleFavourite } from '../settings/settings';
import { showToast } from './toast';

export function toggleFavouriteWithToast(recipe: { id: number | string; title: string; image?: string | null }): void {
  const saved = toggleFavourite(recipe);
  showToast({
    kind: saved ? 'success' : 'info',
    message: saved ? 'Saved to your recipes' : 'Removed from your recipes',
    action: { label: 'Undo', onPress: () => toggleFavourite(recipe) },
  });
}
