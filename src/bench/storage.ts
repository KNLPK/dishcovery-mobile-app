/**
 * src/bench/storage.ts
 *
 * Checkpoints, row chunks and export.
 *
 * Rows are flushed to numbered chunk files as the run proceeds, and the
 * checkpoint records which payloads are done and which chunks exist. A run that
 * dies at 80% resumes from the next unmeasured payload; nothing is re-measured
 * and nothing already written is rewritten.
 *
 * Chunking rather than one growing file is deliberate: expo-file-system has no
 * cheap append, so rewriting a single accumulating CSV 250 times would write
 * hundreds of megabytes to flash for a 2.5 MB result.
 */

import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { SerializationFormat } from '../../shared/contract';
import type {
  DecodeRow,
  PerCellProfileReport,
  RunAggregate,
  RunCheckpoint,
  WarmupProfileReport,
} from './types';

const ROOT_DIR_NAME = 'benchmark';
/** Payloads per chunk file. 25 × 90 rows ≈ 2,250 rows per flush. */
export const CHUNK_PAYLOADS = 25;

function root(): string {
  const dir = FileSystem.documentDirectory;
  if (dir === null || dir === undefined) {
    throw new Error('No document directory on this platform — the run cannot be checkpointed.');
  }
  return `${dir}${ROOT_DIR_NAME}`;
}

export function runDir(runId: string): string {
  return `${root()}/${runId}`;
}

export async function ensureRunDir(runId: string): Promise<void> {
  await FileSystem.makeDirectoryAsync(runDir(runId), { intermediates: true });
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

export const CSV_HEADER = [
  'runId',
  'payloadId',
  'source',
  'tier',
  'byteLength',
  'format',
  'wireBytes',
  'iteration',
  'deserializationMs',
  'heapDeltaBytesRaw',
  'heapDeltaBytesCorrected',
  'deserializationWithMaterializationMs',
  'cellStartedAt',
].join(',');

function cell(value: string | number | null): string {
  return value === null ? '' : String(value);
}

export function rowToCsv(row: DecodeRow): string {
  return [
    row.runId,
    row.payloadId,
    row.source,
    row.tier,
    row.byteLength,
    row.format,
    row.wireBytes,
    row.iteration,
    // Full precision. Rounding happens at the reporting boundary, never here.
    row.deserializationMs,
    cell(row.heapDeltaBytesRaw),
    cell(row.heapDeltaBytesCorrected),
    cell(row.deserializationWithMaterializationMs),
    row.cellStartedAt,
  ].join(',');
}

// ─── Checkpoints ──────────────────────────────────────────────────────────────

function checkpointUri(runId: string): string {
  return `${runDir(runId)}/state.json`;
}

export async function writeCheckpoint(state: RunCheckpoint): Promise<void> {
  await FileSystem.writeAsStringAsync(checkpointUri(state.runId), JSON.stringify(state));
}

export async function readCheckpoint(runId: string): Promise<RunCheckpoint | null> {
  try {
    const info = await FileSystem.getInfoAsync(checkpointUri(runId));
    if (!info.exists) return null;
    return JSON.parse(await FileSystem.readAsStringAsync(checkpointUri(runId))) as RunCheckpoint;
  } catch {
    return null;
  }
}

/** Every run directory on the device, newest first. */
export async function listRuns(): Promise<RunCheckpoint[]> {
  try {
    const info = await FileSystem.getInfoAsync(root());
    if (!info.exists) return [];
    const names = await FileSystem.readDirectoryAsync(root());
    const states = await Promise.all(names.map((name) => readCheckpoint(name)));
    return states
      .filter((s): s is RunCheckpoint => s !== null)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  } catch {
    return [];
  }
}

// ─── Warm-up profiles ─────────────────────────────────────────────────────────

/**
 * Profiles are written to disk, one file per leading format.
 *
 * The three orderings have to be run from three cold app launches, so nothing in
 * memory survives between them. Keying by lead format means re-running one
 * ordering replaces that ordering rather than accumulating duplicates.
 */
function profileDir(): string {
  return `${root()}/warmup-profiles`;
}

function profileUri(leadFormat: SerializationFormat): string {
  return `${profileDir()}/lead-${leadFormat}.json`;
}

export async function saveWarmupProfile(report: WarmupProfileReport): Promise<void> {
  await FileSystem.makeDirectoryAsync(profileDir(), { intermediates: true });
  await FileSystem.writeAsStringAsync(profileUri(report.leadFormat), JSON.stringify(report, null, 2));
}

export async function listWarmupProfiles(): Promise<WarmupProfileReport[]> {
  try {
    const info = await FileSystem.getInfoAsync(profileDir());
    if (!info.exists) return [];
    const names = await FileSystem.readDirectoryAsync(profileDir());
    const reports: WarmupProfileReport[] = [];
    // Only the per-lead cold profiles. The directory also holds per-cell.json
    // and the export bundle, neither of which is a cold profile.
    for (const name of names.filter((n) => n.startsWith('lead-'))) {
      try {
        const text = await FileSystem.readAsStringAsync(`${profileDir()}/${name}`);
        reports.push(JSON.parse(text) as WarmupProfileReport);
      } catch {
        // A truncated file from a kill mid-write is skipped, not fatal.
      }
    }
    return reports.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  } catch {
    return [];
  }
}

export async function clearWarmupProfiles(): Promise<void> {
  await FileSystem.deleteAsync(profileDir(), { idempotent: true });
}

/**
 * The per-cell profile: one file, not one per lead.
 *
 * Unlike the cold profiles it needs no fresh launch, so there is nothing to
 * accumulate across sessions — a later run simply supersedes an earlier one.
 */
function perCellUri(): string {
  return `${profileDir()}/per-cell.json`;
}

export async function savePerCellProfile(report: PerCellProfileReport): Promise<void> {
  await FileSystem.makeDirectoryAsync(profileDir(), { intermediates: true });
  await FileSystem.writeAsStringAsync(perCellUri(), JSON.stringify(report, null, 2));
}

export async function readPerCellProfile(): Promise<PerCellProfileReport | null> {
  try {
    const info = await FileSystem.getInfoAsync(perCellUri());
    if (!info.exists) return null;
    return JSON.parse(await FileSystem.readAsStringAsync(perCellUri())) as PerCellProfileReport;
  } catch {
    return null;
  }
}

/** Hand the combined profiles to the share sheet, for the methodology appendix. */
export async function exportWarmupProfiles(payload: unknown): Promise<string> {
  await FileSystem.makeDirectoryAsync(profileDir(), { intermediates: true });
  const target = `${profileDir()}/warmup-profiles.json`;
  await FileSystem.writeAsStringAsync(target, JSON.stringify(payload, null, 2));
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(target, {
      mimeType: 'application/json',
      dialogTitle: 'Warm-up profiles',
    });
  }
  return target;
}

// ─── Row chunks ───────────────────────────────────────────────────────────────

export async function writeChunk(runId: string, index: number, rows: DecodeRow[]): Promise<string> {
  const name = `rows-${String(index).padStart(4, '0')}.csv`;
  const body = rows.map(rowToCsv).join('\n');
  await FileSystem.writeAsStringAsync(`${runDir(runId)}/${name}`, `${body}\n`);
  return name;
}

/** Read one chunk file back, verbatim. */
export async function readChunk(runId: string, name: string): Promise<string> {
  return FileSystem.readAsStringAsync(`${runDir(runId)}/${name}`);
}

export async function writeAggregate(aggregate: RunAggregate): Promise<void> {
  await FileSystem.writeAsStringAsync(
    `${runDir(aggregate.runId)}/aggregate.json`,
    JSON.stringify(aggregate, null, 2)
  );
}

export async function readAggregate(runId: string): Promise<RunAggregate | null> {
  try {
    const uri = `${runDir(runId)}/aggregate.json`;
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return null;
    return JSON.parse(await FileSystem.readAsStringAsync(uri)) as RunAggregate;
  } catch {
    return null;
  }
}

/**
 * Stitch the chunks into one CSV with a header and hand it to the share sheet.
 * This is how the data leaves the phone — no adb, no cable.
 */
export async function exportCsv(state: RunCheckpoint): Promise<string> {
  const parts: string[] = [CSV_HEADER];
  for (const name of state.chunkFiles) {
    parts.push((await FileSystem.readAsStringAsync(`${runDir(state.runId)}/${name}`)).trimEnd());
  }

  const target = `${runDir(state.runId)}/dishcovery-benchmark-${state.runId}.csv`;
  await FileSystem.writeAsStringAsync(target, `${parts.join('\n')}\n`);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(target, { mimeType: 'text/csv', dialogTitle: 'Benchmark rows' });
  }
  return target;
}

export async function exportAggregate(runId: string): Promise<string> {
  const target = `${runDir(runId)}/aggregate.json`;
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(target, { mimeType: 'application/json', dialogTitle: 'Benchmark summary' });
  }
  return target;
}

export async function deleteRun(runId: string): Promise<void> {
  await FileSystem.deleteAsync(runDir(runId), { idempotent: true });
}
