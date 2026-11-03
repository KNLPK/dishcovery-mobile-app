/**
 * components/useIntroDone.ts
 *
 * True once the launch intro has finished (src/ui/introGate.ts), so a screen
 * can hold back work that would compete with it.
 */

import { useEffect, useState } from 'react';

import { afterIntro, introDone } from '../src/ui/introGate';

export function useIntroDone(): boolean {
  const [done, setDone] = useState(introDone);
  useEffect(() => afterIntro(() => setDone(true)), []);
  return done;
}
