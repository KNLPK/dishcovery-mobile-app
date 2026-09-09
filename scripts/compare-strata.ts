/**
 * scripts/compare-strata.ts
 *
 * Compares the API-SOURCED stratum (Spoonacular, fixtures/benchmark-recipe-ids.json)
 * against the GENERATED stratum (fixtures/generated/manifest.json).
 *
 * WHY THIS IS A RESULT, NOT A DIAGNOSTIC
 *   Every one of the 100 harvested Spoonacular recipes classifies as `low`, so
 *   `low` is the only cell of the design that BOTH sources occupy. That overlap
 *   is the study's provenance control: if API-sourced and generated payloads
 *   behave equivalently at `low`, then differences observed at `medium` and
 *   `high` can be attributed to structural complexity rather than to where the
 *   payload came from. If they do NOT agree at `low`, provenance is a confound
 *   and the medium/high comparisons have to be qualified accordingly.
 *
 *   This script therefore reports the low-tier agreement on all six structural
 *   measures as a finding in its own right, not as a debugging aid.
 *
 * It also reports the verbosity control — mean characters per step and summary
 * length per tier — so it can be shown that the upper tiers reach their byte
 * bands through STRUCTURE (more elements) rather than through longer prose.
 *
 * Reads committed files only. Makes no network requests and calls no model.
 *
 * Usage:
 *   npm run compare:strata
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  COMPLEXITY_TIERS,
  classifyFromMeasures,
  measureComplexity,
  type ComplexityTier,
  type GenerationManifest,
  type HarvestManifest,
  type Recipe,
} from '../shared/contract.ts';

const ROOT = path.join(import.meta.dirname, '..');
const HARVEST_PATH = path.join(ROOT, 'fixtures', 'benchmark-recipe-ids.json');
const RAW_DIR = path.join(ROOT, 'fixtures', 'recipes-raw');
const GENERATED_MANIFEST_PATH = path.join(ROOT, 'fixtures', 'generated', 'manifest.json');
const GENERATED_PAYLOAD_DIR = path.join(ROOT, 'fixtures', 'generated', 'payloads');

// ─── Statistics ───────────────────────────────────────────────────────────────

function mean(v: number[]): number {
  return v.length === 0 ? 0 : v.reduce((a, b) => a + b, 0) / v.length;
}

/** Sample standard deviation, n-1 denominator, per the study methodology. */
function sd(v: number[]): number {
  if (v.length < 2) return 0;
  const m = mean(v);
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
}

function median(v: number[]): number {
  if (v.length === 0) return 0;
  const s = [...v].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Percentage change of `got` against `reference`. */
function pctChange(got: number, reference: number): number {
  if (reference === 0) return got === 0 ? 0 : Number.POSITIVE_INFINITY;
  return ((got - reference) / reference) * 100;
}

function f(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return 'n/a';
  return n.toFixed(digits);
}

// ─── Measures ─────────────────────────────────────────────────────────────────

/**
 * The measures compared across strata.
 *
 * The first six are the structural measures the harvest records for every
 * Spoonacular recipe. `meanCharsPerStep` and `summaryChars` are the verbosity
 * controls, added so text density can be compared as well as structure.
 */
interface Measures {
  byteLength: number;
  charCount: number;
  maxDepth: number;
  nutrientCount: number;
  ingredientCount: number;
  stepCount: number;
  instructionSetCount: number;
  meanCharsPerStep: number;
  summaryChars: number;
}

const MEASURE_LABELS: { key: keyof Measures; label: string; digits: number; structural: boolean }[] = [
  { key: 'byteLength', label: 'byteLength (B)', digits: 0, structural: true },
  { key: 'charCount', label: 'charCount', digits: 0, structural: true },
  { key: 'maxDepth', label: 'maxDepth', digits: 2, structural: true },
  { key: 'nutrientCount', label: 'nutrientCount', digits: 1, structural: true },
  { key: 'ingredientCount', label: 'ingredientCount', digits: 1, structural: true },
  { key: 'stepCount', label: 'stepCount', digits: 1, structural: true },
  { key: 'instructionSetCount', label: 'instructionSets', digits: 2, structural: true },
  { key: 'meanCharsPerStep', label: 'chars/step', digits: 1, structural: false },
  { key: 'summaryChars', label: 'summaryChars', digits: 0, structural: false },
];

function measuresOf(recipe: Recipe): Measures {
  const complexity = measureComplexity(recipe);
  const steps = recipe.analyzedInstructions.flatMap((a) => a.steps);
  return {
    byteLength: complexity.byteLength,
    charCount: complexity.charCount,
    maxDepth: complexity.maxDepth,
    nutrientCount: recipe.nutrition.nutrients.length,
    ingredientCount: recipe.extendedIngredients.length,
    stepCount: steps.length,
    instructionSetCount: recipe.analyzedInstructions.length,
    meanCharsPerStep: steps.length === 0 ? 0 : mean(steps.map((s) => s.step.length)),
    summaryChars: recipe.summary.length,
  };
}

// ─── Loading ──────────────────────────────────────────────────────────────────

/**
 * Rebuild the canonical shape from a verbatim Spoonacular snapshot.
 *
 * This is the same mapping the proxy applies at serve time. It is duplicated
 * here rather than imported because the proxy is CommonJS and this script is a
 * type-stripped ES module; the mapping is asserted against the harvest manifest
 * below, so drift between the two would be caught rather than silently accepted.
 */
function toCanonicalShape(data: any): Recipe {
  return {
    id: data.id || 0,
    title: data.title || '',
    image: data.image || '',
    readyInMinutes: data.readyInMinutes || 0,
    servings: data.servings || 0,
    summary: data.summary || '',
    nutrition: {
      nutrients: (data.nutrition?.nutrients || []).map((n: any) => ({
        name: n.name || '',
        amount: n.amount || 0,
        unit: n.unit || '',
        percentOfDailyNeeds: n.percentOfDailyNeeds || 0,
      })),
    },
    extendedIngredients: (data.extendedIngredients || []).map((i: any) => ({
      id: i.id || 0,
      amount: i.amount || 0,
      unit: i.unit || '',
      name: i.name || '',
    })),
    analyzedInstructions: (data.analyzedInstructions || []).map((ai: any) => ({
      name: ai.name || '',
      steps: (ai.steps || []).map((s: any) => ({
        number: s.number || 0,
        step: s.step || '',
      })),
    })),
  };
}

interface Stratum {
  source: 'spoonacular' | 'generated';
  items: { recipeId: number; tier: ComplexityTier; measures: Measures }[];
}

function loadSpoonacular(): Stratum {
  const manifest = JSON.parse(fs.readFileSync(HARVEST_PATH, 'utf8')) as HarvestManifest;
  const items: Stratum['items'] = [];
  let drift = 0;

  for (const entry of manifest.recipes) {
    const rawPath = path.join(RAW_DIR, `${entry.recipeId}.json`);
    if (!fs.existsSync(rawPath)) continue;
    const recipe = toCanonicalShape(JSON.parse(fs.readFileSync(rawPath, 'utf8')));
    const measures = measuresOf(recipe);

    // Guard against the local mapping drifting from the one the harvest used.
    if (measures.byteLength !== entry.byteLength) drift++;

    items.push({
      recipeId: entry.recipeId,
      tier: classifyFromMeasures(measures),
      measures,
    });
  }

  if (drift > 0) {
    console.warn(
      `[compare] WARNING: ${drift} of ${items.length} Spoonacular payloads measure differently ` +
        `than recorded in the harvest manifest. The canonical mapping has drifted — ` +
        `re-run the harvest or reconcile toCanonicalShape before trusting these numbers.`
    );
  }

  return { source: 'spoonacular', items };
}

function loadGenerated(): Stratum | null {
  if (!fs.existsSync(GENERATED_MANIFEST_PATH)) return null;
  const manifest = JSON.parse(fs.readFileSync(GENERATED_MANIFEST_PATH, 'utf8')) as GenerationManifest;
  const items: Stratum['items'] = [];

  for (const entry of manifest.recipes) {
    const payloadPath = path.join(GENERATED_PAYLOAD_DIR, `${entry.recipeId}.json`);
    if (!fs.existsSync(payloadPath)) continue;
    const recipe = JSON.parse(fs.readFileSync(payloadPath, 'utf8')) as Recipe;
    const measures = measuresOf(recipe);
    items.push({
      recipeId: entry.recipeId,
      tier: classifyFromMeasures(measures),
      measures,
    });
  }

  return { source: 'generated', items };
}

// ─── Report ───────────────────────────────────────────────────────────────────

function tierOf(stratum: Stratum, tier: ComplexityTier) {
  return stratum.items.filter((i) => i.tier === tier);
}

function values(items: Stratum['items'], key: keyof Measures): number[] {
  return items.map((i) => i.measures[key]);
}

function main(): void {
  const spoon = loadSpoonacular();
  const generated = loadGenerated();

  console.log(`\n${'='.repeat(84)}`);
  console.log('STRATA COMPARISON — API-sourced vs generated');
  console.log('='.repeat(84));

  // ── Tier distribution by source ─────────────────────────────────────────────
  console.log('\n-- Tier distribution by source --\n');
  console.log(`  ${'source'.padEnd(14)}${'low'.padStart(8)}${'medium'.padStart(9)}${'high'.padStart(7)}${'total'.padStart(8)}`);
  const strata: Stratum[] = generated ? [spoon, generated] : [spoon];
  for (const stratum of strata) {
    const row = COMPLEXITY_TIERS.map((t) => tierOf(stratum, t).length);
    console.log(
      `  ${stratum.source.padEnd(14)}${String(row[0]).padStart(8)}${String(row[1]).padStart(9)}` +
        `${String(row[2]).padStart(7)}${String(stratum.items.length).padStart(8)}`
    );
  }
  const combined = strata.flatMap((s) => s.items);
  console.log(
    `  ${'TOTAL'.padEnd(14)}` +
      COMPLEXITY_TIERS.map((t) => String(combined.filter((i) => i.tier === t).length))
        .map((v, idx) => v.padStart([8, 9, 7][idx]))
        .join('') +
      String(combined.length).padStart(8)
  );

  if (!generated) {
    console.log(
      `\nNo generated stratum yet (${GENERATED_MANIFEST_PATH} not found).\n` +
        `Run \`npm run generate:dataset -- --model=<id>\` to produce it.\n` +
        `Until then the medium and high levels of the complexity independent variable\n` +
        `are EMPTY — the API cannot populate them.\n`
    );
    return;
  }

  // ── THE PROVENANCE CONTROL ──────────────────────────────────────────────────
  const spoonLow = tierOf(spoon, 'low');
  const genLow = tierOf(generated, 'low');

  console.log(`\n${'='.repeat(84)}`);
  console.log('PROVENANCE CONTROL — low tier, both sources');
  console.log('='.repeat(84));
  console.log(
    `\n  n = ${spoonLow.length} API-sourced, ${genLow.length} generated.\n` +
      `  Low is the only cell both sources occupy. Agreement here is what licenses\n` +
      `  attributing medium/high differences to complexity rather than provenance.\n`
  );

  if (spoonLow.length === 0 || genLow.length === 0) {
    console.log('  One side is empty — the control cannot be evaluated.\n');
  } else {
    console.log(
      `  ${'measure'.padEnd(18)}${'API mean'.padStart(11)}${'(sd)'.padStart(10)}` +
        `${'gen mean'.padStart(11)}${'(sd)'.padStart(10)}${'diff'.padStart(10)}`
    );
    console.log(`  ${'-'.repeat(68)}`);
    for (const m of MEASURE_LABELS) {
      const a = values(spoonLow, m.key);
      const b = values(genLow, m.key);
      const delta = pctChange(mean(b), mean(a));
      const marker = !m.structural ? '' : Math.abs(delta) > 20 ? '  <<' : '';
      console.log(
        `  ${m.label.padEnd(18)}${f(mean(a), m.digits).padStart(11)}${`(${f(sd(a), m.digits)})`.padStart(10)}` +
          `${f(mean(b), m.digits).padStart(11)}${`(${f(sd(b), m.digits)})`.padStart(10)}` +
          `${`${delta >= 0 ? '+' : ''}${f(delta, 1)}%`.padStart(10)}${marker}`
      );
    }
    console.log(
      `\n  Medians — byteLength: API ${f(median(values(spoonLow, 'byteLength')), 0)} B, ` +
        `generated ${f(median(values(genLow, 'byteLength')), 0)} B` +
        `   |   stepCount: API ${f(median(values(spoonLow, 'stepCount')), 1)}, ` +
        `generated ${f(median(values(genLow, 'stepCount')), 1)}`
    );
    console.log(
      '\n  "<<" marks a structural measure differing by more than 20% — a provenance\n' +
        '  difference large enough to qualify the medium/high comparisons.'
    );
  }

  // ── Generated profile across tiers (structure vs verbosity) ─────────────────
  console.log(`\n${'='.repeat(84)}`);
  console.log('GENERATED STRATUM ACROSS TIERS — structure vs verbosity');
  console.log('='.repeat(84));
  console.log(
    `\n  ${'tier'.padEnd(8)}${'n'.padStart(4)}${'bytes'.padStart(10)}${'(sd)'.padStart(9)}` +
      `${'nutr'.padStart(7)}${'ingr'.padStart(7)}${'steps'.padStart(8)}${'sets'.padStart(6)}` +
      `${'chars/step'.padStart(12)}${'summary'.padStart(9)}`
  );
  for (const tier of COMPLEXITY_TIERS) {
    const items = tierOf(generated, tier);
    if (items.length === 0) {
      console.log(`  ${tier.padEnd(8)}${String(0).padStart(4)}   (none)`);
      continue;
    }
    console.log(
      `  ${tier.padEnd(8)}${String(items.length).padStart(4)}` +
        `${f(mean(values(items, 'byteLength')), 0).padStart(10)}` +
        `${`(${f(sd(values(items, 'byteLength')), 0)})`.padStart(9)}` +
        `${f(mean(values(items, 'nutrientCount')), 1).padStart(7)}` +
        `${f(mean(values(items, 'ingredientCount')), 1).padStart(7)}` +
        `${f(mean(values(items, 'stepCount')), 1).padStart(8)}` +
        `${f(mean(values(items, 'instructionSetCount')), 1).padStart(6)}` +
        `${f(mean(values(items, 'meanCharsPerStep')), 1).padStart(12)}` +
        `${f(mean(values(items, 'summaryChars')), 0).padStart(9)}`
    );
  }

  // The verbosity verdict, stated rather than left for the reader to infer.
  const perTierChars = COMPLEXITY_TIERS
    .map((t) => ({ tier: t, items: tierOf(generated, t) }))
    .filter((x) => x.items.length > 0)
    .map((x) => ({ tier: x.tier, chars: mean(values(x.items, 'meanCharsPerStep')) }));

  if (perTierChars.length >= 2) {
    const lowest = Math.min(...perTierChars.map((x) => x.chars));
    const highest = Math.max(...perTierChars.map((x) => x.chars));
    const spread = pctChange(highest, lowest);
    console.log(
      `\n  Verbosity control: mean chars/step ranges ${f(lowest, 1)}–${f(highest, 1)} ` +
        `across tiers (spread ${f(spread, 1)}%).`
    );
    console.log(
      spread <= 15
        ? '  VERDICT: text density is effectively flat across tiers. The size increase came\n' +
            '  from element COUNT — the upper tiers are structurally complex, not verbose.'
        : '  VERDICT: text density is NOT flat across tiers. Part of the size increase came\n' +
            '  from longer text rather than more elements. This must be stated in the paper:\n' +
            '  the tiers differ in verbosity as well as structure.'
    );
  }

  // ── Multi-instruction-set coverage ──────────────────────────────────────────
  console.log('\n-- Multi-instruction-set coverage (the case the pre-Stage-2 schema destroyed) --\n');
  for (const stratum of strata) {
    for (const tier of COMPLEXITY_TIERS) {
      const items = tierOf(stratum, tier);
      if (items.length === 0) continue;
      const multi = items.filter((i) => i.measures.instructionSetCount > 1).length;
      console.log(
        `  ${stratum.source.padEnd(14)}${tier.padEnd(8)}${String(multi).padStart(4)}/${String(items.length).padEnd(5)}` +
          ` (${f((multi / items.length) * 100, 1)}%)`
      );
    }
  }
  const totalMulti = combined.filter((i) => i.measures.instructionSetCount > 1).length;
  console.log(`\n  Combined: ${totalMulti}/${combined.length} payloads carry more than one instruction set.`);

  console.log('');
}

main();
