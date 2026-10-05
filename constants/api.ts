/**
 * constants/api.ts
 *
 * Where the dishcovery-proxy lives, resolved at runtime instead of typed in.
 *
 * WHY THIS IS NOT A HARDCODED IP ANY MORE
 * ---------------------------------------
 * It used to be `http://10.10.41.7:3001`. DHCP then handed the laptop a new
 * lease, every request in the app started failing, and the symptom ("Failed to
 * fetch recipes") pointed nowhere near the cause. A constant that silently goes
 * stale is a bug generator, not a configuration.
 *
 * The app is already talking to the Metro dev server on the developer's
 * machine, so Expo knows an address for that machine that works from this
 * device — LAN IP on a physical phone, 127.0.0.1 on an emulator with adb
 * reverse, localhost on web. The proxy runs on the same machine, so the right
 * host is the bundler's host with the proxy's port. It follows the dev server
 * automatically and never needs hand-editing.
 *
 * A manual override still exists for the cases this cannot cover (proxy on a
 * different machine, a tunnel, a deployed instance). It lives in user settings,
 * not in source: see src/settings/settings.ts and resolveBaseUrl() in
 * src/api/baseUrl.ts. Nothing in the app should read API_BASE_URL directly for
 * a request — use resolveBaseUrl(), which honours the override.
 */

import Constants from 'expo-constants';

/** The port dishcovery-proxy/server.js listens on (PORT || 3001). */
export const PROXY_PORT = 3001;

/**
 * Last resort when no bundler host is discoverable — a standalone release
 * build, for instance. Correct only on web or an emulator with a port forward,
 * which is why the UI shows which source was used.
 */
export const FALLBACK_BASE_URL = `http://localhost:${PROXY_PORT}`;

/**
 * The Metro/Expo bundler host as this device reaches it, without the port.
 * Returns null when there is no dev server (a production build).
 */
export function metroHost(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants.expoGoConfig as { debuggerHost?: string } | null | undefined)?.debuggerHost ??
    null;

  const host = hostUri?.split(':')[0]?.trim();
  return host !== undefined && host.length > 0 ? host : null;
}

/** The derived proxy base URL, or null when there is no bundler host. */
export function metroDerivedBaseUrl(): string | null {
  const host = metroHost();
  return host === null ? null : `http://${host}:${PROXY_PORT}`;
}

/**
 * The default base URL: derived from the bundler host, falling back to
 * localhost. This is the DEFAULT, not necessarily the one in effect — a user
 * override takes precedence. Call resolveBaseUrl() to get the effective value.
 */
export const API_BASE_URL: string = metroDerivedBaseUrl() ?? FALLBACK_BASE_URL;

export type BaseUrlSource = 'override' | 'metro' | 'fallback';

/** Which of the three sources produced the default, for display. */
export function defaultBaseUrlSource(): Exclude<BaseUrlSource, 'override'> {
  return metroDerivedBaseUrl() === null ? 'fallback' : 'metro';
}
