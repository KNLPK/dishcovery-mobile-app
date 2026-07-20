/**
 * utils/runBenchmark.ts
 *
 * Automated benchmark runner for thesis research.
 *
 * What it does:
 *   1. Fetches 100 recipe IDs from the proxy (/recipes/ids) — all guaranteed
 *      to have step-by-step instructions (instructionsRequired=true on Spoonacular).
 *   2. For every recipe ID, runs 3 iterations × 3 formats = 9 requests.
 *   3. Waits 300 ms between each request to respect Spoonacular's rate limit
 *      (the proxy caches normalised data, so Spoonacular is only hit once per
 *      recipe ID — but the delay is kept to guard against burst traffic).
 *   4. Saves the full results array as a timestamped JSON file on-device.
 *   5. Opens the OS share sheet so the file can be sent to a PC (email,
 *      Google Drive, AirDrop, etc.) for statistical analysis.
 *
 * Total samples: 100 IDs × 3 iterations × 3 formats = 900
 * Minimum run time: 900 requests × 300 ms delay ≈ 4.5 minutes (+ network)
 *
 * ISOLATION RULE: this file does not import from any app screen or component.
 * Trigger it from a temporary dev screen or a useEffect during development.
 */

import * as FileSystem from 'expo-file-system';
import * as Sharing    from 'expo-sharing';

import {
  benchmarkJSON,
  benchmarkMsgPack,
  benchmarkProtobuf,
  PROXY_BASE,
  type BenchmarkResult,
  type SerializationFormat,
} from './benchmark';

// ── Configuration ─────────────────────────────────────────────────────────────

const BENCHMARK_CONFIG = {
  /** How many recipe IDs to fetch from the proxy */
  recipeCount:      100,
  /** How many times to run all 3 formats for each recipe */
  iterationsPerRecipe: 3,
  /** Delay in ms between every individual request */
  delayBetweenRequestsMs: 300,
  /** Formats to test — order is preserved in the output */
  formats: ['json', 'msgpack', 'protobuf'] as SerializationFormat[],
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProgressInfo {
  done:            number;
  total:           number;
  percentComplete: number;
  currentRecipeId: number;
  currentIteration: number;
  currentFormat:   SerializationFormat;
  latest:          BenchmarkResult;
}

export interface BenchmarkReport {
  meta: {
    startedAt:             string;   // ISO 8601
    finishedAt:            string;
    durationMs:            number;
    totalSamples:          number;
    recipeCount:           number;
    iterationsPerRecipe:   number;
    delayBetweenRequestsMs: number;
    formats:               SerializationFormat[];
    proxyBase:             string;
  };
  results: BenchmarkResult[];
}

export type ProgressCallback = (info: ProgressInfo) => void;

// ── Internal helpers ──────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch the list of recipe IDs from the proxy.
 * All returned IDs are guaranteed to have analyzedInstructions (steps),
 * because the proxy queries Spoonacular with instructionsRequired=true.
 */
async function fetchRecipeIds(count: number): Promise<number[]> {
  const url      = `${PROXY_BASE}/recipes/ids?count=${count}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch recipe IDs — HTTP ${response.status}`);
  }

  const json = (await response.json()) as { count: number; ids: number[] };

  if (!Array.isArray(json.ids) || json.ids.length === 0) {
    throw new Error('Proxy returned an empty recipe ID list');
  }

  return json.ids;
}

// ── Main runner ───────────────────────────────────────────────────────────────

/**
 * runBenchmark(onProgress?)
 *
 * Runs the full benchmark suite and returns a BenchmarkReport.
 * Pass an onProgress callback to update UI during the run.
 *
 * Example usage (inside a React component):
 *   const report = await runBenchmark(info => {
 *     setProgress(info.percentComplete);
 *     console.log(`[${info.done}/${info.total}] ${info.currentFormat} recipe ${info.currentRecipeId}`);
 *   });
 */
export async function runBenchmark(
  onProgress?: ProgressCallback
): Promise<BenchmarkReport> {
  const {
    recipeCount,
    iterationsPerRecipe,
    delayBetweenRequestsMs,
    formats,
  } = BENCHMARK_CONFIG;

  const total = recipeCount * iterationsPerRecipe * formats.length;
  let done    = 0;

  // ── Step 1: Fetch recipe IDs ───────────────────────────────────────────────
  console.log(`[benchmark] fetching ${recipeCount} recipe IDs from proxy…`);
  const recipeIds = await fetchRecipeIds(recipeCount);
  console.log(`[benchmark] got ${recipeIds.length} IDs, starting benchmark`);

  const results: BenchmarkResult[] = [];
  const startMs  = Date.now();
  const startedAt = new Date(startMs).toISOString();

  // ── Step 2: Main loop ──────────────────────────────────────────────────────
  //
  // Loop order: recipe → iteration → format
  // Keeping all iterations of a recipe together means the proxy's in-memory
  // cache is always warm when the 2nd and 3rd iterations run (no extra
  // Spoonacular calls, faster requests, tighter timing measurements).
  //
  for (const recipeId of recipeIds) {
    for (let iter = 1; iter <= iterationsPerRecipe; iter++) {
      for (const format of formats) {
        // Run the correct benchmark function for this format
        let result: BenchmarkResult;
        if (format === 'json') {
          result = await benchmarkJSON(recipeId);
        } else if (format === 'msgpack') {
          result = await benchmarkMsgPack(recipeId);
        } else {
          result = await benchmarkProtobuf(recipeId);
        }

        results.push(result);
        done++;

        // Notify caller so a progress bar / log can be updated
        onProgress?.({
          done,
          total,
          percentComplete: Math.round((done / total) * 100),
          currentRecipeId: recipeId,
          currentIteration: iter,
          currentFormat:   format,
          latest:          result,
        });

        // Throttle requests — preserves Spoonacular rate limit headroom even
        // though the proxy caches data; also spaces out mobile CPU work
        await delay(delayBetweenRequestsMs);
      }
    }
  }

  const finishedAt = new Date().toISOString();
  const durationMs = Date.now() - startMs;

  console.log(
    `[benchmark] done — ${results.length} samples in ${(durationMs / 1000).toFixed(1)}s`
  );

  return {
    meta: {
      startedAt,
      finishedAt,
      durationMs,
      totalSamples:           results.length,
      recipeCount:            recipeIds.length,
      iterationsPerRecipe,
      delayBetweenRequestsMs,
      formats: [...formats],
      proxyBase: PROXY_BASE,
    },
    results,
  };
}

// ── File export ───────────────────────────────────────────────────────────────

/**
 * saveReport(report)
 *
 * Writes the BenchmarkReport to a JSON file in the app's document directory
 * and returns the local file URI.
 *
 * File naming: benchmark_<unix-ms>.json  (e.g. benchmark_1746672000000.json)
 *
 * To retrieve the file from an Android emulator:
 *   adb pull /data/data/<app-package>/files/benchmark_xxx.json ./
 *
 * To retrieve from a physical device, call shareReport() afterwards.
 */
export async function saveReport(report: BenchmarkReport): Promise<string> {
  const filename = `benchmark_${Date.now()}.json`;
  const fileUri  = `${FileSystem.documentDirectory}${filename}`;

  await FileSystem.writeAsStringAsync(
    fileUri,
    JSON.stringify(report, null, 2),
    { encoding: FileSystem.EncodingType.UTF8 }
  );

  console.log(`[benchmark] report saved → ${fileUri}`);
  return fileUri;
}

/**
 * shareReport(fileUri)
 *
 * Opens the OS share sheet for the saved report file.
 * Use this to send the JSON to a PC via email, Google Drive, AirDrop, etc.
 * On Android emulator this is a no-op (sharing is not available in emulators).
 */
export async function shareReport(fileUri: string): Promise<void> {
  const isAvailable = await Sharing.isAvailableAsync();

  if (!isAvailable) {
    console.warn(
      '[benchmark] Sharing not available on this device/emulator. ' +
      `Pull the file manually:\n  adb pull ${fileUri.replace('file://', '')} ./`
    );
    return;
  }

  await Sharing.shareAsync(fileUri, {
    mimeType:   'application/json',
    dialogTitle: 'Export benchmark results',
  });
}

// ── Convenience: run + save + share in one call ───────────────────────────────

/**
 * runAndExport(onProgress?)
 *
 * Runs the full benchmark, saves the report to disk, and opens the share
 * sheet — all in one call. Returns the BenchmarkReport.
 *
 * This is the function to call from a benchmark trigger screen.
 */
export async function runAndExport(
  onProgress?: ProgressCallback
): Promise<BenchmarkReport> {
  const report  = await runBenchmark(onProgress);
  const fileUri = await saveReport(report);
  await shareReport(fileUri);
  return report;
}
