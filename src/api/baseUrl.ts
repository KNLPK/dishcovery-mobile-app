/**
 * src/api/baseUrl.ts
 *
 * The one place that answers "which proxy are we talking to, and why".
 *
 * Every request in the app goes through resolveBaseUrl(), so a change of
 * server setting takes effect on the next fetch without a restart, and error
 * messages can name the exact URL that failed and where that URL came from.
 *
 * Server modes (Settings → Server):
 *   online   the hosted proxy, ONLINE_BASE_URL
 *   laptop   the proxy on the developer's machine: the manual URL when one is
 *            set, otherwise derived from the Metro host
 *   offline  no server at all
 *
 * Until the user picks one, a dev build (Metro host known) defaults to laptop
 * and an installed build to online.
 */

import {
  API_BASE_URL,
  ONLINE_BASE_URL,
  defaultBaseUrlSource,
  metroHost,
  type BaseUrlSource,
} from '../../constants/api';
import { getSettings, type ServerMode } from '../settings/settings';

export interface ResolvedBaseUrl {
  url: string;
  source: BaseUrlSource | 'online';
  /** Human-readable provenance, shown in settings and in error messages. */
  explanation: string;
}

/** The server mode in effect: the user's choice, or the build's default. */
export function effectiveServerMode(): ServerMode {
  return getSettings().serverMode ?? (metroHost() !== null ? 'laptop' : 'online');
}

/** The laptop proxy: the manual URL if set, else the Metro-derived default. */
export function laptopBaseUrl(): string {
  return getSettings().baseUrlOverride ?? API_BASE_URL;
}

/**
 * The server the browsing screens should use, or null when there is none:
 * offline mode, or online mode in a build without an online URL.
 */
export function serverBaseUrl(): string | null {
  switch (effectiveServerMode()) {
    case 'online':
      return ONLINE_BASE_URL;
    case 'laptop':
      return laptopBaseUrl();
    case 'offline':
      return null;
  }
}

/**
 * The base URL for the next request. Always a string, because the researcher
 * screens (benchmark) need an address even in offline mode; they fall back to
 * the laptop proxy. Browsing screens check serverBaseUrl() first.
 */
export function resolveBaseUrl(): string {
  return serverBaseUrl() ?? laptopBaseUrl();
}

/** The same value, with where it came from — for display and diagnostics. */
export function describeBaseUrl(): ResolvedBaseUrl {
  const url = resolveBaseUrl();
  if (effectiveServerMode() === 'online' && ONLINE_BASE_URL !== null) {
    return { url, source: 'online', explanation: 'the online demo server' };
  }
  if (getSettings().baseUrlOverride !== null) {
    return { url, source: 'override', explanation: 'set manually in Server settings' };
  }
  const source = defaultBaseUrlSource();
  return {
    url,
    source,
    explanation:
      source === 'metro'
        ? 'derived from the Metro dev-server host'
        : 'no dev-server host available — fell back to localhost',
  };
}
