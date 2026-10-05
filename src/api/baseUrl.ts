/**
 * src/api/baseUrl.ts
 *
 * The one place that answers "which proxy are we talking to, and why".
 *
 * Every request in the app goes through resolveBaseUrl(), so an override takes
 * effect on the next fetch without a restart, and error messages can name the
 * exact URL that failed and where that URL came from.
 */

import {
  API_BASE_URL,
  defaultBaseUrlSource,
  type BaseUrlSource,
} from '../../constants/api';
import { getSettings } from '../settings/settings';

export interface ResolvedBaseUrl {
  url: string;
  source: BaseUrlSource;
  /** Human-readable provenance, shown in settings and in error messages. */
  explanation: string;
}

/** The base URL in effect for the next request. */
export function resolveBaseUrl(): string {
  return getSettings().baseUrlOverride ?? API_BASE_URL;
}

/** The same value, with where it came from — for display and diagnostics. */
export function describeBaseUrl(): ResolvedBaseUrl {
  const override = getSettings().baseUrlOverride;
  if (override !== null) {
    return {
      url: override,
      source: 'override',
      explanation: 'set manually in Settings',
    };
  }

  const source = defaultBaseUrlSource();
  return {
    url: API_BASE_URL,
    source,
    explanation:
      source === 'metro'
        ? 'derived from the Metro dev-server host'
        : 'no dev-server host available — fell back to localhost',
  };
}
