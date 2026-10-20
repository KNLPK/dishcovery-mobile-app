/**
 * src/api/serverStatus.ts
 *
 * Timeouts and the "waking the server" step for the browsing screens.
 *
 * The online proxy runs on Render's free plan, which sleeps after 15 idle
 * minutes and takes up to about a minute to start again. So the first request
 * of a session goes to /health with a long timeout (75 s), and after a few
 * seconds the screen says the server is waking up. Once the server has
 * answered, every request gets the normal 15 s limit.
 *
 * This wraps the measured client from outside (src/api/client.ts is not
 * changed), so the timing brackets inside it are untouched. A request that
 * times out is abandoned, not aborted; its late result is ignored.
 */

import { ROUTES } from '../../shared/contract';
import { serverBaseUrl } from './baseUrl';

/** Every browsing request. */
export const REQUEST_TIMEOUT_MS = 15_000;
/** The first health check of a session, which may have to wake the server. */
export const WAKE_TIMEOUT_MS = 75_000;
/** How long a health check runs before the screen says the server is waking. */
const WAKING_NOTICE_AFTER_MS = 3_000;
/** Render sleeps after 15 idle minutes; after 10 without contact, check again. */
const AWAKE_FOR_MS = 10 * 60_000;

export interface HealthInfo {
  mode: 'hosted' | 'local' | null;
  datasetTotal: number | null;
  /** Where browsing comes from, e.g. "catalog (150 Gemini-generated recipes)". */
  source: string | null;
}

/** Thrown when the current server setting has no server to call. */
export class NoServerError extends Error {
  constructor() {
    super('No server is selected (offline mode, or no online server in this build).');
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} timed out after ${Math.round(ms / 1000)} s`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/** GET /health with its own abortable timeout. */
export async function checkHealth(baseUrl: string, timeoutMs: number): Promise<HealthInfo> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${ROUTES.health()}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`Request failed with status ${response.status} — ${baseUrl}${ROUTES.health()}`);
    const body = (await response.json()) as Partial<Record<keyof HealthInfo, unknown>>;
    return {
      mode: body.mode === 'hosted' || body.mode === 'local' ? body.mode : null,
      datasetTotal: typeof body.datasetTotal === 'number' ? body.datasetTotal : null,
      source: typeof body.source === 'string' ? body.source : null,
    };
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`Server check timed out after ${Math.round(timeoutMs / 1000)} s — ${baseUrl}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

let awake: { url: string; at: number } | null = null;
let pending: { url: string; promise: Promise<void> } | null = null;

function markAwake(url: string): void {
  awake = { url, at: Date.now() };
}

/**
 * Resolves with the server URL once the server has answered /health, waking
 * it if needed. `onWaking` fires if the check takes longer than a few seconds.
 */
export async function ensureServer(onWaking?: () => void): Promise<string> {
  const url = serverBaseUrl();
  if (url === null) throw new NoServerError();
  if (awake !== null && awake.url === url && Date.now() - awake.at < AWAKE_FOR_MS) return url;

  const notice = onWaking === undefined ? null : setTimeout(onWaking, WAKING_NOTICE_AFTER_MS);
  try {
    if (pending === null || pending.url !== url) {
      const promise = checkHealth(url, WAKE_TIMEOUT_MS).then(() => markAwake(url));
      pending = { url, promise };
      promise.then(
        () => {
          if (pending?.promise === promise) pending = null;
        },
        () => {
          if (pending?.promise === promise) pending = null;
        }
      );
    }
    await pending.promise;
    return url;
  } finally {
    if (notice !== null) clearTimeout(notice);
  }
}

/**
 * Run one browsing request: make sure the server is up, then give the request
 * REQUEST_TIMEOUT_MS. `what` names the request in a timeout message.
 */
export async function serverRequest<T>(
  request: () => Promise<T>,
  options: { what: string; onWaking?: () => void }
): Promise<T> {
  const url = await ensureServer(options.onWaking);
  const result = await withTimeout(request(), REQUEST_TIMEOUT_MS, options.what);
  markAwake(url);
  return result;
}
