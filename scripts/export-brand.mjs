/**
 * scripts/export-brand.mjs
 *
 * Exports the PNGs the app uses from the SVG sources in assets/brand/, and
 * checks them (size, and transparent or opaque as each must be). See
 * docs/BRAND.md for what each file is for.
 *
 *   node scripts/export-brand.mjs            export, then check
 *   node scripts/export-brand.mjs --check    check only (e.g. after replacing
 *                                            the PNGs with your own exports)
 *
 * Rendering uses an installed Chrome or Edge in headless mode (no package is
 * added). Set CHROME to its path if it is not in the usual place.
 *
 * Prints PASS or FAIL per file; exit code 1 on FAIL.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.join(import.meta.dirname, '..');
const BRAND = path.join(ROOT, 'assets', 'brand');
const Jimp = createRequire(import.meta.url)('jimp-compact');

/**
 * name: [width, height, 'opaque' | 'transparent', scales?]
 * With scales, each is exported: 1 as name.png, 3 as name@3x.png (React
 * Native picks the density it needs); width and height are the 1x size in dp.
 */
export const FILES = {
  'icon': [1024, 1024, 'opaque'],
  'adaptive-foreground': [1024, 1024, 'transparent'],
  'monochrome': [1024, 1024, 'transparent'],
  'splash-icon': [1024, 1024, 'transparent'],
  'onboarding-1-recipes': [312, 200, 'transparent', [1, 3]],
  'onboarding-2-formats': [312, 200, 'transparent', [1, 3]],
  'onboarding-3-quick-test': [312, 200, 'transparent', [1, 3]],
  'onboarding-4-start': [312, 200, 'transparent', [1, 3]],
  'cook-empty': [160, 120, 'transparent', [1, 3]],
  'cook-no-match': [160, 120, 'transparent', [1, 3]],
};

/** Every PNG to export and check: [png name, svg name, width, height, kind]. */
const OUTPUTS = Object.entries(FILES).flatMap(([name, [w, h, kind, scales = [1]]]) =>
  scales.map((s) => [s === 1 ? `${name}.png` : `${name}@${s}x.png`, name, w * s, h * s, kind])
);

function findChrome() {
  const candidates = [
    process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ];
  const found = candidates.find((c) => c && existsSync(c));
  if (!found) throw new Error('No Chrome or Edge found; set CHROME to its path.');
  return found;
}

function exportAll() {
  const chrome = findChrome();
  const work = mkdtempSync(path.join(tmpdir(), 'brand-'));
  try {
    for (const [png, name, w, h] of OUTPUTS) {
      const page = path.join(work, `${png}.html`);
      writeFileSync(
        page,
        `<!doctype html><html><body style="margin:0;background:transparent">` +
          `<img src="${pathToFileURL(path.join(BRAND, `${name}.svg`)).href}" width="${w}" height="${h}" style="display:block">` +
          `</body></html>`
      );
      execFileSync(chrome, [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        '--default-background-color=00000000',
        `--user-data-dir=${path.join(work, 'profile')}`,
        `--window-size=${w},${h}`,
        `--screenshot=${path.join(BRAND, png)}`,
        pathToFileURL(page).href,
      ], { stdio: 'ignore' });
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

async function checkAll() {
  let failed = false;
  for (const [png, , w, h, kind] of OUTPUTS) {
    const file = path.join(BRAND, png);
    if (!existsSync(file)) {
      console.log(`FAIL  ${png} missing`);
      failed = true;
      continue;
    }
    const img = await Jimp.read(file);
    const { width, height, data } = img.bitmap;
    let transparent = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] < 255) transparent++;
    const corner = data[3]; // alpha of the top-left pixel
    const ok =
      width === w &&
      height === h &&
      (kind === 'opaque' ? transparent === 0 : corner === 0 && transparent < width * height);
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${png} ${width}×${height}, ${kind}` +
        ` (${((100 * transparent) / (width * height)).toFixed(0)}% transparent pixels)`
    );
    if (!ok) failed = true;
  }
  if (failed) process.exitCode = 1;
}

if (!process.argv.includes('--check')) exportAll();
await checkAll();
