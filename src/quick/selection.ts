/**
 * src/quick/selection.ts
 *
 * Which payloads a Quick test decodes. Kept apart from quickTest.ts, which
 * needs Expo modules, so scripts can check the selection under Node.
 */

import { COMPLEXITY_TIERS } from '../../shared/contract';
import type { ComplexityTier } from '../../shared/contract';

interface Selectable {
  recipeId: number;
  tier: ComplexityTier;
  byteLength: number;
}

/**
 * `perTier` payloads per tier, spread across the tier's size range: sorted by
 * JSON size, the payload at the midpoint of each of `perTier` equal slices.
 * Deterministic, so every Quick test on every phone decodes the same payloads.
 */
export function selectPayloads<T extends Selectable>(entries: T[], perTier: number): T[] {
  const chosen: T[] = [];
  for (const tier of COMPLEXITY_TIERS) {
    const inTier = entries
      .filter((e) => e.tier === tier)
      .sort((a, b) => a.byteLength - b.byteLength || a.recipeId - b.recipeId);
    for (let i = 0; i < Math.min(perTier, inTier.length); i++) {
      chosen.push(inTier[Math.floor(((i + 0.5) * inTier.length) / Math.min(perTier, inTier.length))]);
    }
  }
  return chosen;
}
