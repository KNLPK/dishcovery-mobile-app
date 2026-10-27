/**
 * src/ui/loaderMotion.ts
 *
 * Which frame the brand loader (components/BrandLoader.tsx) shows, and when it
 * changes.
 *
 *   moving   the bars rise and fall in turn
 *   reduced  the system's "remove animations" setting is on: the bars only
 *            fade gently, nothing moves
 *   paused   the plain mark, still: when the screen asks for it, and always
 *            while the motion gate is closed (the Quick test is measuring)
 *
 * Plain TypeScript with no React Native imports, so scripts/test-motion-gate.mjs
 * can check it under Node, during a real Quick test run.
 */

import { isMeasuring, subscribeMeasuring } from './motionGate';

export type LoaderFrame = 'moving' | 'reduced' | 'paused';

export function loaderFrame(state: { paused: boolean; reduceMotion: boolean; measuring: boolean }): LoaderFrame {
  if (state.paused || state.measuring) return 'paused';
  return state.reduceMotion ? 'reduced' : 'moving';
}

/**
 * Calls `show` with the loader's frame now, and again whenever the motion gate
 * opens or closes. Returns the unsubscribe.
 */
export function followMotionGate(
  options: { paused: boolean; reduceMotion: boolean },
  show: (frame: LoaderFrame) => void
): () => void {
  const frame = (measuring: boolean) => loaderFrame({ ...options, measuring });
  show(frame(isMeasuring()));
  return subscribeMeasuring((measuring) => show(frame(measuring)));
}
