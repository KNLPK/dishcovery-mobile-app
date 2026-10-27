/**
 * components/useReduceMotion.ts
 *
 * The system "remove animations" setting, for the animations that have a
 * reduced version (BrandLoader, LaunchIntro, the onboarding steps, the
 * micro-interactions in motion.tsx and Sheet). null until it has been read;
 * each caller decides what an unknown setting means for it.
 *
 * One read and one subscription for the whole app, shared by every caller:
 * each button uses this, and a screen can hold dozens.
 */

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

let current: boolean | null = null;
let started = false;
const listeners = new Set<(on: boolean | null) => void>();

function set(on: boolean) {
  current = on;
  for (const listener of [...listeners]) listener(on);
}

function start() {
  if (started) return;
  started = true;
  AccessibilityInfo.isReduceMotionEnabled()
    .then(set)
    .catch(() => set(false));
  AccessibilityInfo.addEventListener('reduceMotionChanged', set);
}

export function useReduceMotion(): boolean | null {
  const [on, setOn] = useState<boolean | null>(current);
  useEffect(() => {
    start();
    listeners.add(setOn);
    setOn(current);
    return () => {
      listeners.delete(setOn);
    };
  }, []);
  return on;
}
