/**
 * src/api/errors.ts
 *
 * Turns a thrown request failure into something a person can act on.
 *
 * "Failed to fetch recipes." was the old message on every screen. It named no
 * URL, no status and no cause, so the commonest failure in this project — the
 * proxy address having gone stale — looked identical to a missing recipe, an
 * upstream outage, or a bug. Every message here names the address that failed
 * and what to check.
 */

import { describeBaseUrl, effectiveServerMode } from './baseUrl';

export interface RequestFailure {
  /** One short line, suitable as a heading. */
  title: string;
  /** What actually happened, including the address involved. */
  detail: string;
  /** The single most likely fix, or null when there is nothing to suggest. */
  hint: string | null;
}

function statusOf(message: string): number | null {
  const match = /status (\d{3})/.exec(message);
  return match === null ? null : Number(match[1]);
}

/** Where to go when browsing is unavailable; the Quick test needs no server. */
const OFFLINE_ALTERNATIVE = 'The Quick test and the paper results work without a server (Home → Test it yourself).';

export function describeRequestError(error: unknown, action = 'load'): RequestFailure {
  const message = error instanceof Error ? error.message : String(error);
  const { url, source, explanation } = describeBaseUrl();
  const status = statusOf(message);
  // The online demo server is used by people who did not set it up, so its
  // hints say what to do on the phone; the laptop hints are for the developer.
  const online = source === 'online' && effectiveServerMode() === 'online';

  if (/no server is selected/i.test(message)) {
    return {
      title: 'No server selected',
      detail: 'The app is set to work without a server, so recipes cannot be loaded.',
      hint: `Choose Online or Laptop in Server settings. ${OFFLINE_ALTERNATIVE}`,
    };
  }

  // The online server browses its own catalog and calls no recipe service, so
  // its only limit is the per-phone request rate; 402 cannot come from it.
  if (status === 429) {
    return {
      title: online ? 'Too many requests from this phone' : 'The server has reached its limit',
      detail: online
        ? 'The demo server limits how many requests one phone can make in 10 minutes.'
        : `${message}. The proxy's rate limit is used up.`,
      hint: online
        ? `Try again in a few minutes. ${OFFLINE_ALTERNATIVE}`
        : 'Wait for the window to pass, or restart the proxy to reset its counters.',
    };
  }

  if (status === 402 && !online) {
    return {
      title: 'Recipe quota used up for today',
      detail: `${message}. Spoonacular reports the API key's daily points are used up.`,
      hint: 'Wait for the daily reset, or use another key in dishcovery-proxy/.env.',
    };
  }

  // React Native's fetch throws a TypeError with this text when the socket
  // never opened — wrong host, wrong port, or nothing listening.
  const unreachable =
    /network request failed|failed to fetch|econnrefused|timeout|timed out/i.test(message);

  if (unreachable && online) {
    return {
      title: 'Cannot reach the online server',
      detail: `No answer from ${url}. ${/timed out/i.test(message) ? message + '.' : 'The phone may be offline.'}`,
      hint: `Check the phone's internet connection and try again. ${OFFLINE_ALTERNATIVE}`,
    };
  }

  if (unreachable) {
    return {
      title: `Cannot reach the proxy at ${url}`,
      detail:
        `The request never got a response. That address is ${explanation}.`,
      hint:
        source === 'override'
          ? 'Correct the manual proxy URL in Server settings, or start the proxy on that machine.'
          : 'Start dishcovery-proxy (npm start), keep the phone and laptop on the same Wi-Fi, ' +
            'and allow inbound TCP 3001 through the laptop firewall.',
    };
  }

  if (status === 404) {
    return {
      title: 'Not found',
      detail: online
        ? 'This recipe is not in the online catalog.'
        : `The proxy at ${url} has no record for this request.`,
      hint: online ? 'Go back and pick another recipe.' : 'The recipe id may not exist upstream. Try another recipe.',
    };
  }

  if (status === 400) {
    return {
      title: 'The proxy rejected this request',
      detail: message,
      hint:
        'If the serialization format was just changed, this endpoint may not support it — ' +
        'search serves JSON and MessagePack only.',
    };
  }

  if (status === 401 || status === 403) {
    return {
      title: online ? 'The server refused the request' : 'Upstream refused the request',
      detail: online
        ? 'The online server refused the request.'
        : `${message}. This is usually the Spoonacular API key — expired, missing, or out of quota.`,
      hint: online ? OFFLINE_ALTERNATIVE : 'Check SPOONACULAR_API_KEY in dishcovery-proxy/.env and the daily quota.',
    };
  }

  if (status !== null && status >= 500) {
    return {
      title: 'The proxy failed while handling this request',
      detail: `${message}. The server was reached, so the address is right.`,
      hint: online
        ? 'Try again in a moment.'
        : 'Check the proxy terminal — it logs the stack trace for every 500.',
    };
  }

  if (/json|msgpack|decode|unexpected/i.test(message)) {
    return {
      title: 'The response could not be decoded',
      detail: `${message}. The bytes arrived from ${url} but did not parse in the selected format.`,
      hint: 'Switch the format back to JSON to confirm the endpoint is reachable.',
    };
  }

  return {
    title: `Could not ${action}`,
    detail: message,
    hint: null,
  };
}
