/**
 * src/quick/storage.ts
 *
 * Quick test results on disk, in their own folder (quick-tests/), apart from
 * the paper runs in benchmark/. The paper runner, its comparison and its
 * cooldown record never read this folder, so a Quick test can never be mixed
 * into the published protocol's data.
 */

import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { QuickTestResult } from './quickTest';

function root(): string {
  const dir = FileSystem.documentDirectory;
  if (dir === null || dir === undefined) throw new Error('No document directory on this platform.');
  return `${dir}quick-tests`;
}

export async function saveQuickTest(result: QuickTestResult): Promise<void> {
  await FileSystem.makeDirectoryAsync(root(), { intermediates: true });
  await FileSystem.writeAsStringAsync(`${root()}/${result.id}.json`, JSON.stringify(result, null, 2));
}

/** All saved Quick tests, newest first. Unreadable files are skipped. */
export async function listQuickTests(): Promise<QuickTestResult[]> {
  const info = await FileSystem.getInfoAsync(root());
  if (!info.exists) return [];
  const names = (await FileSystem.readDirectoryAsync(root())).filter((n) => n.endsWith('.json'));
  const results: QuickTestResult[] = [];
  for (const name of names.sort().reverse()) {
    try {
      const parsed = JSON.parse(await FileSystem.readAsStringAsync(`${root()}/${name}`)) as QuickTestResult;
      if (parsed.protocol === 'quick-test') results.push(parsed);
    } catch {
      // A damaged file is not worth failing the screen for.
    }
  }
  return results;
}

export async function deleteQuickTest(id: string): Promise<void> {
  await FileSystem.deleteAsync(`${root()}/${id}.json`, { idempotent: true });
}

export async function shareQuickTest(result: QuickTestResult): Promise<void> {
  const path = `${root()}/${result.id}.json`;
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle: result.label });
  }
}
