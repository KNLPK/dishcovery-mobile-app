/**
 * utils/benchmark.ts
 *
 * Client-side benchmark module for thesis research.
 * Measures payload size and deserialization time for JSON, MessagePack,
 * and Protocol Buffers by fetching from the dishcovery-proxy server.
 *
 * ISOLATION RULE: nothing in this file imports from app screens, components,
 * or business logic — and nothing in the app imports from this file.
 *
 * Timing: performance.now() — available globally on React Native via Hermes
 * (RN 0.60+). Returns fractional milliseconds, sub-millisecond resolution.
 */

import { decode as decodeMsgPack } from '@msgpack/msgpack';
import { Root } from 'protobufjs';

// ── Proxy URL ─────────────────────────────────────────────────────────────────
//
// Android emulator : 10.0.2.2  (loopback alias to the host machine)
// iOS simulator    : localhost  or 127.0.0.1
// Physical device  : use machine's LAN IP — found via `ipconfig` on Windows
//
export const PROXY_BASE = 'http://10.10.41.5:3001';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SerializationFormat = 'json' | 'msgpack' | 'protobuf';

export interface BenchmarkResult {
  format: SerializationFormat;
  recipeId: number;
  /** Raw bytes received ÷ 1024, rounded to 3 decimal places */
  payloadSizeKB: number;
  /** Decode-only time in ms — network round-trip is excluded */
  deserializationTimeMs: number;
  /** Unix epoch ms — when this sample was recorded */
  timestamp: number;
}

// ── Protobuf schema — inline JSON descriptor ──────────────────────────────────
//
// Mirrors recipe.proto exactly. Using Root.fromJSON() avoids any file-system
// access, which is unavailable in the React Native bundle environment.
// If recipe.proto changes, update the field IDs and types here too.
//
const PROTO_ROOT = Root.fromJSON({
  nested: {
    Nutrient: {
      fields: {
        name:   { type: 'string', id: 1 },
        amount: { type: 'float',  id: 2 },
        unit:   { type: 'string', id: 3 },
      },
    },
    NutritionInfo: {
      fields: {
        nutrients: { rule: 'repeated', type: 'Nutrient', id: 1 },
      },
    },
    Ingredient: {
      fields: {
        id:     { type: 'int32',  id: 1 },
        amount: { type: 'float',  id: 2 },
        unit:   { type: 'string', id: 3 },
        name:   { type: 'string', id: 4 },
      },
    },
    Step: {
      fields: {
        number: { type: 'int32',  id: 1 },
        step:   { type: 'string', id: 2 },
      },
    },
    RecipeDetail: {
      fields: {
        title:               { type: 'string',        id: 1 },
        image:               { type: 'string',        id: 2 },
        readyInMinutes:      { type: 'int32',         id: 3 },
        summary:             { type: 'string',        id: 4 },
        nutrition:           { type: 'NutritionInfo', id: 5 },
        extendedIngredients: { rule: 'repeated', type: 'Ingredient', id: 6 },
        steps:               { rule: 'repeated', type: 'Step',       id: 7 },
        servings:            { type: 'int32',         id: 8 },
      },
    },
  },
});

// Looked up once at module load time — cheap for subsequent calls
const RecipeDetailType = PROTO_ROOT.lookupType('RecipeDetail');

// ── Internal helpers ──────────────────────────────────────────────────────────

function bytesToKB(n: number): number {
  return Math.round((n / 1024) * 1000) / 1000;
}

async function fetchBytes(url: string): Promise<{ bytes: Uint8Array; sizeKB: number }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Proxy returned HTTP ${response.status} — ${url}`);
  }
  const buffer = await response.arrayBuffer();
  const bytes  = new Uint8Array(buffer);
  return { bytes, sizeKB: bytesToKB(bytes.length) };
}

// ── Benchmark functions ───────────────────────────────────────────────────────

/**
 * benchmarkJSON
 *
 * Fetches the recipe payload as a UTF-8 JSON string, then times JSON.parse().
 * The network fetch completes before the timer starts, so only decode cost
 * is captured — consistent with how msgpack and protobuf are measured.
 */
export async function benchmarkJSON(recipeId: number): Promise<BenchmarkResult> {
  const url      = `${PROXY_BASE}/recipe/${recipeId}?format=json`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Proxy returned HTTP ${response.status} — ${url}`);
  }

  // Get the raw string; encode to bytes only to measure size accurately
  const rawText     = await response.text();
  const payloadSizeKB = bytesToKB(new TextEncoder().encode(rawText).length);

  // Time only the parse step
  const t0 = performance.now();
  JSON.parse(rawText);
  const deserializationTimeMs = performance.now() - t0;

  return {
    format: 'json',
    recipeId,
    payloadSizeKB,
    deserializationTimeMs,
    timestamp: Date.now(),
  };
}

/**
 * benchmarkMsgPack
 *
 * Fetches the recipe payload as MessagePack binary, then times
 * @msgpack/msgpack's decode() on the raw Uint8Array.
 */
export async function benchmarkMsgPack(recipeId: number): Promise<BenchmarkResult> {
  const url              = `${PROXY_BASE}/recipe/${recipeId}?format=msgpack`;
  const { bytes, sizeKB } = await fetchBytes(url);

  const t0 = performance.now();
  decodeMsgPack(bytes);
  const deserializationTimeMs = performance.now() - t0;

  return {
    format: 'msgpack',
    recipeId,
    payloadSizeKB: sizeKB,
    deserializationTimeMs,
    timestamp: Date.now(),
  };
}

/**
 * benchmarkProtobuf
 *
 * Fetches the recipe payload as Protocol Buffers binary, then times
 * protobufjs RecipeDetail.decode() on the raw Uint8Array.
 */
export async function benchmarkProtobuf(recipeId: number): Promise<BenchmarkResult> {
  const url              = `${PROXY_BASE}/recipe/${recipeId}?format=protobuf`;
  const { bytes, sizeKB } = await fetchBytes(url);

  const t0 = performance.now();
  RecipeDetailType.decode(bytes);
  const deserializationTimeMs = performance.now() - t0;

  return {
    format: 'protobuf',
    recipeId,
    payloadSizeKB: sizeKB,
    deserializationTimeMs,
    timestamp: Date.now(),
  };
}
