// scripts/node-rn/hooks.mjs
// Node resolve hooks for running app modules outside React Native, used by
// scripts/test-quick-test.mjs: Metro-style extensionless relative imports, and
// minimal stubs for the two native modules the Quick test reaches
// (expo-constants and react-native, via src/bench/environment.ts).
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const STUBS = {
  'expo-constants': 'data:text/javascript,export default { expoConfig: null, executionEnvironment: "bare" };',
  'react-native': 'data:text/javascript,export const Platform = { OS: "android", constants: {} };',
};
export async function resolve(spec, ctx, next) {
  if (STUBS[spec]) return { url: STUBS[spec], shortCircuit: true };
  if ((spec.startsWith('./') || spec.startsWith('../')) && ctx.parentURL?.startsWith('file:')) {
    const base = fileURLToPath(new URL(spec, ctx.parentURL));
    for (const ext of ['', '.ts', '.tsx', '.js']) {
      if (ext === '' && !/\.[cm]?[jt]sx?$|\.json$/.test(base)) continue;
      if (existsSync(base + ext)) return next(pathToFileURL(base + ext).href, ctx);
    }
  }
  return next(spec, ctx);
}
