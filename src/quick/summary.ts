/**
 * src/quick/summary.ts
 *
 * One plain-language line per tier for the Results screen, generated from the
 * decode-time means, never written by hand. Pure, so scripts can test it under
 * Node.
 *
 *   "Medium payloads: MessagePack decoded 2.3× faster than JSON on this phone;
 *    Protocol Buffers 1.8× faster."
 *
 * "n× faster" is the ratio of mean decode times, JSON / format. Within 5% of
 * JSON counts as "about as fast".
 */

import type { ComplexityTier, SerializationFormat } from '../../shared/contract';

export const FORMAT_NAMES: Record<SerializationFormat, string> = {
  json: 'JSON',
  msgpack: 'MessagePack',
  protobuf: 'Protocol Buffers',
};

const TIER_NAMES: Record<ComplexityTier, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

/** Ratios this close to 1 are reported as "about the same". */
const SAME = 0.05;

export interface TimedCell {
  tier: ComplexityTier;
  format: SerializationFormat;
  msMean: number;
}

const x = (r: number) => `${r.toFixed(1)}×`;

function relation(name: string, ratio: number): string {
  if (Math.abs(ratio - 1) < SAME) return `${name} about as fast as JSON`;
  return ratio > 1 ? `${name} ${x(ratio)} faster` : `${name} ${x(1 / ratio)} slower`;
}

/**
 * The summary line for one tier, or null when a format is missing. `where` is
 * the phrase that says whose numbers these are, e.g. "on this phone".
 */
export function tierSummary(cells: readonly TimedCell[], tier: ComplexityTier, where: string): string | null {
  const ms = (f: SerializationFormat) => cells.find((c) => c.tier === tier && c.format === f)?.msMean;
  const json = ms('json');
  const others = (['msgpack', 'protobuf'] as const)
    .map((f) => ({ f, v: ms(f) }))
    .filter((o): o is { f: 'msgpack' | 'protobuf'; v: number } => o.v !== undefined && o.v > 0);
  if (json === undefined || json <= 0 || others.length !== 2) return null;

  const ranked = others.map((o) => ({ name: FORMAT_NAMES[o.f], ratio: json / o.v })).sort((a, b) => b.ratio - a.ratio);
  const [best, second] = ranked;
  const head = `${TIER_NAMES[tier]} payloads:`;

  if (best.ratio >= 1 + SAME) {
    return `${head} ${best.name} decoded ${x(best.ratio)} faster than JSON ${where}; ${relation(second.name, second.ratio)}.`;
  }
  if (best.ratio > 1 - SAME) {
    return `${head} ${best.name} decoded about as fast as JSON ${where}; ${relation(second.name, second.ratio)}.`;
  }
  return `${head} JSON decoded fastest ${where}; ${best.name} took ${x(1 / best.ratio)} as long, ${second.name} ${x(1 / second.ratio)}.`;
}
