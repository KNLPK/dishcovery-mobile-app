/**
 * src/api/useServer.ts
 *
 * The server setting as a React value, for screens that browse recipes: they
 * re-render when it changes, and show NoServerState when `url` is null.
 */

import { useSettings, type ServerMode } from '../settings/settings';
import { effectiveServerMode, serverBaseUrl } from './baseUrl';

export function useServer(): { mode: ServerMode; url: string | null } {
  useSettings();
  return { mode: effectiveServerMode(), url: serverBaseUrl() };
}
