/**
 * components/useReduceMotion.ts
 *
 * The system "remove animations" setting, for the animations that have a
 * reduced version (BrandLoader, LaunchIntro, the onboarding steps, the
 * micro-interactions in motion.tsx). null until it has been read; each caller
 * decides what an unknown setting means for it.
 */

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReduceMotion(): boolean | null {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (live) setOn(value);
      })
      .catch(() => {
        if (live) setOn(false);
      });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setOn);
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);
  return on;
}
