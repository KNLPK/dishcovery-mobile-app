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

import { describeBaseUrl } from './baseUrl';

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

export function describeRequestError(error: unknown, action = 'load'): RequestFailure {
  const message = error instanceof Error ? error.message : String(error);
  const { url, source, explanation } = describeBaseUrl();
  const status = statusOf(message);

  // React Native's fetch throws a TypeError with this text when the socket
  // never opened — wrong host, wrong port, or nothing listening.
  const unreachable =
    /network request failed|failed to fetch|econnrefused|timeout|timed out/i.test(message);

  if (unreachable) {
    return {
      title: `Cannot reach the proxy at ${url}`,
      detail:
        `The request never got a response. That address is ${explanation}.`,
      hint:
        source === 'override'
          ? 'Clear or correct the manual proxy URL in Settings, or start the proxy on that machine.'
          : 'Start dishcovery-proxy (npm start), keep the phone and laptop on the same Wi-Fi, ' +
            'and allow inbound TCP 3001 through the laptop firewall.',
    };
  }

  if (status === 404) {
    return {
      title: 'Not found',
      detail: `The proxy at ${url} has no record for this request.`,
      hint: 'The recipe id may not exist upstream. Try another recipe.',
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

  if (status === 401 || status === 402 || status === 403) {
    return {
      title: 'Upstream refused the request',
      detail: `${message}. This is usually the Spoonacular API key — expired, missing, or out of quota.`,
      hint: 'Check SPOONACULAR_API_KEY in dishcovery-proxy/.env and the daily quota.',
    };
  }

  if (status !== null && status >= 500) {
    return {
      title: 'The proxy failed while handling this request',
      detail: `${message}. The server was reached, so the address is right.`,
      hint: 'Check the proxy terminal — it logs the stack trace for every 500.',
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
