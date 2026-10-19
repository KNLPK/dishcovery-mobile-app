/**
 * scripts/proxyProcess.ts
 *
 * Starts dishcovery-proxy as a child process for the offline-bundle scripts,
 * waits for /health, and stops only that child afterwards.
 *
 * The child gets a placeholder SPOONACULAR_API_KEY so the real key is never
 * read: the scripts only request generated payloads, which never reach
 * Spoonacular.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';

const PROXY_DIR = path.join(import.meta.dirname, '..', 'dishcovery-proxy');

export interface RunningProxy {
  baseUrl: string;
  stop(): void;
}

export async function startProxy(port: number): Promise<RunningProxy> {
  const child: ChildProcess = spawn(
    process.execPath,
    ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', 'server.js'],
    {
      cwd: PROXY_DIR,
      env: {
        ...process.env,
        PORT: String(port),
        SPOONACULAR_API_KEY: 'not-used-by-this-script',
        DISHCOVERY_MODE: 'local',
        RENDER: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  let log = '';
  child.stdout?.on('data', (d) => (log += d));
  child.stderr?.on('data', (d) => (log += d));

  const baseUrl = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) break;
    try {
      if ((await fetch(`${baseUrl}/health`)).ok) {
        return { baseUrl, stop: () => child.kill() };
      }
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  child.kill();
  throw new Error(`proxy did not start on port ${port}:\n${log}`);
}
