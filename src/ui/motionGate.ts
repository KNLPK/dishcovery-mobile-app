/**
 * src/ui/motionGate.ts
 *
 * One switch that keeps the UI still while decodes are being timed.
 *
 * Any animation, toast or haptic that starts while a benchmark is measuring
 * competes with the decodes for the phone's CPU and adds noise to the numbers.
 * So every animation in the app starts through startMotion(), which refuses
 * while the gate is closed, and looping animations (the skeleton shimmer)
 * subscribe and stop themselves when it closes. Toasts raised meanwhile are
 * held back and shown once it opens again.
 *
 * The Quick test closes the gate for its whole run, from loading the payloads
 * to the last measured decode. Plain TypeScript with no React Native imports,
 * so scripts/test-motion-gate.mjs can check it under Node.
 */

type Listener = (measuring: boolean) => void;

let measuring = false;
const listeners = new Set<Listener>();
let started = 0;
let blocked = 0;

export function isMeasuring(): boolean {
  return measuring;
}

export function setMeasuring(on: boolean): void {
  if (on === measuring) return;
  measuring = on;
  for (const listener of [...listeners]) listener(on);
}

/** Calls `listener` whenever the gate opens or closes; returns the unsubscribe. */
export function subscribeMeasuring(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Runs `start` (which should start one animation, or fire one haptic) unless a
 * benchmark is measuring. Returns whether it ran.
 */
export function startMotion(start: () => void): boolean {
  if (measuring) {
    blocked++;
    return false;
  }
  started++;
  start();
  return true;
}

/** Counters for tests: animations started, and refused while measuring. */
export function motionStats(): { started: number; blocked: number } {
  return { started, blocked };
}
