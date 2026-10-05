/**
 * src/settings/settings.ts
 *
 * App-wide user settings: the serialization format every request uses, and an
 * optional manual proxy URL. Persisted across launches, readable synchronously,
 * and observable so a change takes effect on the next fetch with no restart.
 *
 * WHY THE FORMAT LIVES HERE AND NOT IN A BENCHMARK SCRIPT
 * ------------------------------------------------------
 * The study's claim is about what a real app pays for a serialization format on
 * its real data path. If the format were a benchmark-only parameter, the app
 * would only ever run JSON and the measurements would describe a harness rather
 * than the product. Making it a user setting is what makes the claim true: the
 * screens genuinely consume whichever format is selected.
 *
 * STORAGE
 * -------
 * expo-file-system, which ships as a dependency of the `expo` package itself
 * (18.1.11 here) and is built into Expo Go — no install, no version change.
 * AsyncStorage would be the conventional choice but is not present, and adding
 * it means touching a frozen dependency tree.
 *
 * Reads are synchronous from an in-memory cache; the cache is filled once at
 * startup by loadSettings(). A failed read or write is never fatal: the app
 * falls back to defaults and keeps working, because a settings file is not
 * worth crashing over.
 */

import * as FileSystem from 'expo-file-system';
import { useEffect, useState } from 'react';

import { SERIALIZATION_FORMATS, type SerializationFormat } from '../../shared/contract';

/**
 * A saved recipe. Title and image are stored alongside the id so the favourites
 * list renders without a network round trip per entry — opening Profile should
 * not cost one API call per saved recipe.
 */
export interface FavouriteRecipe {
  id: number;
  title: string;
  image: string | null;
  savedAt: number;
}

export interface Settings {
  /** The format every request uses. */
  format: SerializationFormat;
  /**
   * Manual proxy base URL, e.g. "http://192.168.1.20:3001".
   * null means "derive it from the Metro host" — the normal case.
   */
  baseUrlOverride: string | null;
  /** Saved recipes, newest first. */
  favourites: FavouriteRecipe[];
  /**
   * What Profile calls the person using the app. Empty means "not set", and
   * the screen shows a neutral label rather than inventing a name.
   */
  displayName: string;
}

export const DEFAULT_SETTINGS: Settings = {
  format: 'json',
  baseUrlOverride: null,
  favourites: [],
  displayName: '',
};

const FILE_NAME = 'dishcovery-settings.json';

function fileUri(): string | null {
  const dir = FileSystem.documentDirectory;
  return dir === null || dir === undefined ? null : `${dir}${FILE_NAME}`;
}

// ─── In-memory state ──────────────────────────────────────────────────────────

let current: Settings = { ...DEFAULT_SETTINGS };
let loaded = false;

type Listener = (settings: Settings) => void;
const listeners = new Set<Listener>();

/** The settings in effect right now. Synchronous by design — callers are hot. */
export function getSettings(): Settings {
  return current;
}

/** True once loadSettings() has finished, so the UI can avoid a flash of default. */
export function settingsLoaded(): boolean {
  return loaded;
}

export function subscribeToSettings(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(): void {
  for (const listener of listeners) listener(current);
}

// ─── Validation ───────────────────────────────────────────────────────────────

function isFormat(value: unknown): value is SerializationFormat {
  return (
    typeof value === 'string' &&
    (SERIALIZATION_FORMATS as readonly string[]).includes(value)
  );
}

/**
 * Accept only a syntactically plausible http(s) origin. A malformed override is
 * worse than none: it produces failures that look like server faults.
 */
export function normaliseBaseUrl(raw: string): string | null {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/]+$/i.test(trimmed)) return null;
  return trimmed;
}

/** Drop anything malformed rather than letting it reach a render. */
function sanitiseFavourites(value: unknown): FavouriteRecipe[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is FavouriteRecipe =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as FavouriteRecipe).id === 'number' &&
        typeof (entry as FavouriteRecipe).title === 'string'
    )
    .map((entry) => ({
      id: entry.id,
      title: entry.title,
      image: typeof entry.image === 'string' ? entry.image : null,
      savedAt: typeof entry.savedAt === 'number' ? entry.savedAt : 0,
    }));
}

function sanitise(parsed: unknown): Settings {
  const record = (parsed ?? {}) as Partial<Record<keyof Settings, unknown>>;
  const override =
    typeof record.baseUrlOverride === 'string'
      ? normaliseBaseUrl(record.baseUrlOverride)
      : null;

  return {
    format: isFormat(record.format) ? record.format : DEFAULT_SETTINGS.format,
    baseUrlOverride: override,
    favourites: sanitiseFavourites(record.favourites),
    displayName:
      typeof record.displayName === 'string' ? record.displayName.slice(0, 40) : '',
  };
}

// ─── Persistence ──────────────────────────────────────────────────────────────

/** Read the settings file once at startup. Safe to call more than once. */
export async function loadSettings(): Promise<Settings> {
  if (loaded) return current;

  const uri = fileUri();
  if (uri !== null) {
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists) {
        current = sanitise(JSON.parse(await FileSystem.readAsStringAsync(uri)));
      }
    } catch {
      // Corrupt or unreadable file: keep the defaults rather than fail to start.
      current = { ...DEFAULT_SETTINGS };
    }
  }

  loaded = true;
  emit();
  return current;
}

async function persist(): Promise<void> {
  const uri = fileUri();
  if (uri === null) return;
  try {
    await FileSystem.writeAsStringAsync(uri, JSON.stringify(current));
  } catch {
    // The in-memory value is already live; losing persistence costs the user
    // their choice on next launch, which is not worth an error dialog.
  }
}

/**
 * Apply a change. The in-memory value and every subscriber update immediately —
 * the write is fire-and-forget, so a fetch issued on the very next line already
 * uses the new setting.
 */
export function updateSettings(patch: Partial<Settings>): Settings {
  current = { ...current, ...patch };
  emit();
  void persist();
  return current;
}

export function setFormat(format: SerializationFormat): void {
  updateSettings({ format });
}

export function setBaseUrlOverride(override: string | null): void {
  updateSettings({ baseUrlOverride: override });
}

export function setDisplayName(name: string): void {
  updateSettings({ displayName: name.slice(0, 40) });
}

// ─── Favourites ───────────────────────────────────────────────────────────────

export function isFavourite(id: number | string): boolean {
  const numeric = Number(id);
  return current.favourites.some((f) => f.id === numeric);
}

/**
 * Save or unsave a recipe. Returns the state after the toggle, so a caller can
 * react without re-reading the store.
 */
export function toggleFavourite(recipe: {
  id: number | string;
  title: string;
  image?: string | null;
}): boolean {
  const id = Number(recipe.id);
  const existing = current.favourites.some((f) => f.id === id);

  const favourites = existing
    ? current.favourites.filter((f) => f.id !== id)
    : [
        { id, title: recipe.title, image: recipe.image ?? null, savedAt: Date.now() },
        ...current.favourites,
      ];

  updateSettings({ favourites });
  return !existing;
}

// ─── React binding ────────────────────────────────────────────────────────────

/** Subscribe a component to settings. Re-renders on every change. */
export function useSettings(): Settings {
  const [snapshot, setSnapshot] = useState<Settings>(current);
  useEffect(() => subscribeToSettings(setSnapshot), []);
  return snapshot;
}
