/**
 * scripts/build-paper-results.ts
 *
 * Writes constants/paperResults.generated.ts, the numbers behind the app's
 * "Paper results" tab, from the published reproducibility package. No number
 * in the app is typed by hand.
 *
 *   node --experimental-strip-types scripts/build-paper-results.ts [artifactDir]
 *
 * artifactDir defaults to ../dishcovery-benchmark-artifact (a checkout of
 * github.com/KNLPK/dishcovery-benchmark-artifact).
 *
 * Two tables come out:
 *
 *   pooled         analysis/reference_output/table_main.csv, copied as is: the
 *                  paper's Table II/III numbers, all 250 payloads.
 *   generatedOnly  the 150 generated payloads only (source = generated),
 *                  computed from analysis/reference_output/per_payload.csv with
 *                  the definitions analyze.py uses for table_main. This is what
 *                  the app can compare against, because it ships only these
 *                  payloads.
 *
 * per_payload.csv holds one mean decode time per payload, not every decode, so
 * the decode-level sd of time (ms_sd) cannot be computed for the subset and is
 * left null. Every other column can, and the method is checked first: applied
 * to all 250 payloads it must reproduce table_main.csv within a relative 1e-9,
 * or the script fails and writes nothing.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ARTIFACT = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, '..', '..', 'dishcovery-benchmark-artifact'));
const TABLE_MAIN = 'analysis/reference_output/table_main.csv';
const PER_PAYLOAD = 'analysis/reference_output/per_payload.csv';
const OUT = path.join(import.meta.dirname, '..', 'constants', 'paperResults.generated.ts');

const DOI = '10.5281/zenodo.23410763';
const TIERS = ['low', 'medium', 'high'] as const;
const FORMATS = ['json', 'msgpack', 'protobuf'] as const;
const RTOL = 1e-9;

type Row = Record<string, string>;

function readCsv(rel: string): { rows: Row[]; sha256: string } {
  const text = readFileSync(path.join(ARTIFACT, rel), 'utf8');
  const [header, ...lines] = text.replace(/\r\n/g, '\n').trim().split('\n');
  const cols = header.split(',');
  const rows = lines.map((line) => {
    const cells = line.split(',');
    if (cells.length !== cols.length) throw new Error(`${rel}: unexpected comma in "${line}"`);
    return Object.fromEntries(cols.map((c, i) => [c, cells[i]]));
  });
  return { rows, sha256: createHash('sha256').update(readFileSync(path.join(ARTIFACT, rel))).digest('hex') };
}

const num = (s: string): number | null => (s === '' ? null : Number(s));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
function sd(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

interface Cell {
  tier: (typeof TIERS)[number];
  format: (typeof FORMATS)[number];
  payloads: number;
  /** Wire size, kB (1 kB = 1000 bytes), mean and sd over payloads. */
  kbMean: number;
  kbSd: number;
  /** Decode time, ms. msSd is over individual decodes; null where not computable. */
  msMean: number;
  msSd: number | null;
  /** Heap allocated per decode, MB (10^6 bytes), mean and sd over payloads. */
  mbMean: number;
  mbSd: number;
  kbPctVsJson: number | null;
  msPctVsJson: number | null;
  mbPctVsJson: number | null;
  /** Protocol Buffers only: decode + toObject vs decode alone, %. */
  materialisationPct: number | null;
}

/** analyze.py's table_main definitions, applied to per-payload rows. */
function tableFrom(pp: Row[]): Cell[] {
  const cells: Cell[] = [];
  for (const tier of TIERS) {
    let base: Cell | null = null;
    for (const format of FORMATS) {
      const p = pp.filter((r) => r.tier === tier && r.format === format);
      if (p.length === 0) throw new Error(`no payloads for ${tier}/${format}`);
      const wire = p.map((r) => Number(r.wire));
      const heap = p.map((r) => Number(r.heap));
      // Every payload has the same number of decodes (30 per run x 3 runs), so
      // the mean over decodes equals the mean of the per-payload means.
      const ms = p.map((r) => Number(r.ms));
      const cell: Cell = {
        tier,
        format,
        payloads: p.length,
        kbMean: mean(wire) / 1000,
        kbSd: sd(wire) / 1000,
        msMean: mean(ms),
        msSd: null,
        mbMean: mean(heap) / 1e6,
        mbSd: sd(heap) / 1e6,
        kbPctVsJson: null,
        msPctVsJson: null,
        mbPctVsJson: null,
        materialisationPct: null,
      };
      if (format === 'json') base = cell;
      else if (base !== null) {
        cell.kbPctVsJson = 100 * (cell.kbMean / base.kbMean - 1);
        cell.msPctVsJson = 100 * (cell.msMean / base.msMean - 1);
        cell.mbPctVsJson = 100 * (cell.mbMean / base.mbMean - 1);
      }
      if (format === 'protobuf') {
        cell.materialisationPct = 100 * (mean(p.map((r) => Number(r.ms_mat))) / cell.msMean - 1);
      }
      cells.push(cell);
    }
  }
  return cells;
}

function pooledFrom(rows: Row[]): Cell[] {
  return rows.map((r) => ({
    tier: r.tier as Cell['tier'],
    format: r.format as Cell['format'],
    payloads: Number(r.payloads),
    kbMean: Number(r.kb_mean),
    kbSd: Number(r.kb_sd),
    msMean: Number(r.ms_mean),
    msSd: Number(r.ms_sd),
    mbMean: Number(r.mb_mean),
    mbSd: Number(r.mb_sd),
    kbPctVsJson: num(r.kb_pct_vs_json),
    msPctVsJson: num(r.ms_pct_vs_json),
    mbPctVsJson: num(r.mb_pct_vs_json),
    materialisationPct: num(r.materialisation_pct),
  }));
}

const tableMain = readCsv(TABLE_MAIN);
const perPayload = readCsv(PER_PAYLOAD);
const pooled = pooledFrom(tableMain.rows);

// ── Method check: all 250 payloads must reproduce table_main ──
const recomputed = tableFrom(perPayload.rows);
const problems: string[] = [];
const keys = ['payloads', 'kbMean', 'kbSd', 'msMean', 'mbMean', 'mbSd', 'kbPctVsJson', 'msPctVsJson', 'mbPctVsJson', 'materialisationPct'] as const;
let compared = 0;
for (const a of pooled) {
  const b = recomputed.find((c) => c.tier === a.tier && c.format === a.format)!;
  for (const k of keys) {
    const x = a[k];
    const y = b[k];
    if (x === null && y === null) continue;
    compared++;
    if (x === null || y === null || Math.abs(x - y) > RTOL * Math.max(Math.abs(x), Math.abs(y))) {
      problems.push(`${a.tier}/${a.format} ${k}: table_main ${x} vs recomputed ${y}`);
    }
  }
}
if (problems.length > 0) {
  console.error('Method check FAILED; nothing written.\n' + problems.join('\n'));
  process.exit(1);
}
console.log(`method check: ${compared} values of table_main.csv reproduced from per_payload.csv (rtol ${RTOL})`);

// ── The subset ──
const generatedRows = perPayload.rows.filter((r) => r.source === 'generated');
const generatedOnly = tableFrom(generatedRows);
const generatedPayloads = new Set(generatedRows.map((r) => r.payloadId)).size;
if (generatedPayloads !== 150) throw new Error(`expected 150 generated payloads, found ${generatedPayloads}`);

const bySourceTier: Record<string, Record<string, number>> = {};
for (const r of perPayload.rows.filter((r) => r.format === 'json')) {
  (bySourceTier[r.source] ??= {})[r.tier] = (bySourceTier[r.source]?.[r.tier] ?? 0) + 1;
}

let artifactCommit = 'unknown';
try {
  artifactCommit = execFileSync('git', ['-C', ARTIFACT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
} catch {
  /* not a git checkout; the file hashes still identify the inputs */
}

const data = {
  doi: DOI,
  doiUrl: `https://doi.org/${DOI}`,
  source: {
    repository: 'https://github.com/KNLPK/dishcovery-benchmark-artifact',
    artifactCommit,
    files: { [TABLE_MAIN]: tableMain.sha256, [PER_PAYLOAD]: perPayload.sha256 },
  },
  payloadsBySourceAndTier: bySourceTier,
  pooled,
  generatedOnly,
};

const out =
  `/**\n * constants/paperResults.generated.ts\n *\n * GENERATED by scripts/build-paper-results.ts. Do not edit by hand.\n *\n` +
  ` * pooled: the paper's table (all 250 payloads), from ${TABLE_MAIN}.\n` +
  ` * generatedOnly: the 150 generated payloads, computed from ${PER_PAYLOAD};\n` +
  ` * msSd is null there because per-payload means cannot give a decode-level sd.\n */\n\n` +
  `export interface PaperCell {\n  tier: 'low' | 'medium' | 'high';\n  format: 'json' | 'msgpack' | 'protobuf';\n` +
  `  payloads: number;\n  kbMean: number;\n  kbSd: number;\n  msMean: number;\n  msSd: number | null;\n` +
  `  mbMean: number;\n  mbSd: number;\n  kbPctVsJson: number | null;\n  msPctVsJson: number | null;\n` +
  `  mbPctVsJson: number | null;\n  materialisationPct: number | null;\n}\n\n` +
  `export const PAPER_RESULTS: {\n  doi: string;\n  doiUrl: string;\n` +
  `  source: { repository: string; artifactCommit: string; files: Record<string, string> };\n` +
  `  payloadsBySourceAndTier: Record<string, Record<string, number>>;\n` +
  `  pooled: PaperCell[];\n  generatedOnly: PaperCell[];\n} = ${JSON.stringify(data, null, 2)};\n`;

writeFileSync(OUT, out);
console.log(`wrote ${path.relative(process.cwd(), OUT)}: ${pooled.length} pooled + ${generatedOnly.length} generated-only cells, artifact ${artifactCommit.slice(0, 7)}`);
