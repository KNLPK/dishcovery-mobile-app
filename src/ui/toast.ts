/**
 * src/ui/toast.ts
 *
 * showToast() from anywhere; components/ToastHost.tsx draws it.
 *
 * One toast at a time: a new one replaces the one on screen. A toast raised
 * while the Quick test is measuring is held back (only the latest is kept) and
 * shown when the measurement ends, so nothing slides in mid-measurement.
 * Plain TypeScript, so the hold-back is testable under Node.
 */

import { isMeasuring, subscribeMeasuring } from './motionGate';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastSpec {
  kind: ToastKind;
  message: string;
  /** One action button, e.g. Retry or View results. */
  action?: { label: string; onPress: () => void };
  /** Default 3.5 s, or 5 s when there is an action to reach. */
  durationMs?: number;
}

export interface Toast extends ToastSpec {
  id: number;
}

type Listener = (toast: Toast | null) => void;

let nextId = 1;
let current: Toast | null = null;
let held: Toast | null = null;
const listeners = new Set<Listener>();

function publish(toast: Toast | null) {
  current = toast;
  for (const listener of [...listeners]) listener(toast);
}

export function showToast(spec: ToastSpec): void {
  const toast = { ...spec, id: nextId++ };
  if (isMeasuring()) held = toast;
  else publish(toast);
}

export function dismissToast(id: number): void {
  if (current?.id === id) publish(null);
}

export function subscribeToast(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function currentToast(): Toast | null {
  return current;
}

/** Test hook: the toast waiting for the measurement to end, if any. */
export function heldToast(): Toast | null {
  return held;
}

subscribeMeasuring((measuring) => {
  if (!measuring && held !== null) {
    const toast = held;
    held = null;
    publish(toast);
  }
});
