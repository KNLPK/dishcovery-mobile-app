// scripts/node-rn/register.mjs
// Loaded with --import before the test. Installs hooks.mjs and the two React
// Native globals the app code expects: `require` (Metro provides it to every
// module) and __DEV__ (false, as in a release build).
import { createRequire, register } from 'node:module';
import path from 'node:path';

register(new URL('./hooks.mjs', import.meta.url).href);
// Resolve from src/offline/ (the same depth as src/bench/), so the app's
// '../../assets/...' and '../../package.json' requires land correctly.
globalThis.require = createRequire(path.join(import.meta.dirname, '..', '..', 'src', 'offline', 'payloads.ts'));
globalThis.__DEV__ = false;
