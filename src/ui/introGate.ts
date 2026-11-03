/**
 * src/ui/introGate.ts
 *
 * "The launch intro has finished." Startup work that routing does not need
 * (Home's first recipe fetch, the skeleton pulse) waits for this, so it does
 * not compete with the intro for the phone's CPU while the intro plays.
 *
 * Builds without the intro, and the web, open the gate at once: LaunchIntro
 * calls markIntroDone() as soon as it knows it will not play. Plain TypeScript
 * with no React Native imports, like motionGate.ts.
 */

type Listener = () => void;

let done = false;
const listeners = new Set<Listener>();

export function introDone(): boolean {
  return done;
}

/** Opens the gate, once; later calls do nothing. */
export function markIntroDone(): void {
  if (done) return;
  done = true;
  for (const listener of [...listeners]) listener();
  listeners.clear();
}

/** Runs `run` once the intro has finished (at once if it has). Returns a cancel. */
export function afterIntro(run: () => void): () => void {
  if (done) {
    run();
    return () => {};
  }
  listeners.add(run);
  return () => {
    listeners.delete(run);
  };
}
