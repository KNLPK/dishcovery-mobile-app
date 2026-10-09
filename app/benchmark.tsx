/**
 * app/benchmark.tsx
 *
 * The benchmark runner's control surface.
 *
 * Unlike the heap probe, this route is NOT development-only: the publishable
 * numbers have to come from a release build, so this screen must exist in the
 * release build that produces them. It is reachable from the metrics screen and
 * from nowhere in the ordinary user path.
 */

import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { palette, radius, spacing, type } from '../constants/theme';
import { describeBaseUrl } from '../src/api/baseUrl';
import { describeRequestError } from '../src/api/errors';
import { compareRuns, type CrossRunReport } from '../src/bench/compareRuns';
import { captureEnvironment, describeEnvironment } from '../src/bench/environment';
import { assessCooldown, secondsRemaining, type DeviceActivity } from '../src/bench/cooldown';
import {
  gatherDeviceActivity,
  loadSufficiency,
  loadWarmupSeries,
  runBenchmark,
  runPerCellProfile,
  runWarmupProfile,
  type Progress,
} from '../src/bench/runner';
import {
  clearExclusion,
  clearWarmupProfiles,
  deleteRun,
  exportAggregate,
  exportCsv,
  exportWarmupProfiles,
  listRuns,
  readAggregate,
  readExclusion,
  readPerCellProfile,
  writeExclusion,
} from '../src/bench/storage';
import type {
  PerCellProfileReport,
  RunAggregate,
  RunExclusion,
  RunCheckpoint,
  WarmupProfileSeries,
  WarmupSufficiency,
} from '../src/bench/types';
import { analyseSettling } from '../src/bench/warmupRules';
import { BENCHMARK_CONFIG, SERIALIZATION_FORMATS } from '../shared/contract';
import type { SerializationFormat } from '../shared/contract';

/**
 * Payload count the plan quotes before a run has loaded the dataset.
 *
 * The runner uses the dataset's real length; this is only for the pre-run
 * estimate, which is why it is named rather than inlined.
 */
const PLANNED_PAYLOADS = 250;

/** Computed, never written down — see the note on PLANNED_PAYLOADS. */
function projectPlan() {
  const cells = PLANNED_PAYLOADS * SERIALIZATION_FORMATS.length;
  return {
    measuredRows: cells * BENCHMARK_CONFIG.measuredIterations,
    totalDecodes: cells * (BENCHMARK_CONFIG.warmupIterations + BENCHMARK_CONFIG.measuredIterations),
    prewarmDecodes: BENCHMARK_CONFIG.prewarmDecodes * SERIALIZATION_FORMATS.length,
  };
}

function pct(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}

/** A reason to prefill when excluding a run, built from what was measured. */
function suggestExclusionReason(thermal: CrossRunReport['thermal'][number] | undefined): string {
  if (thermal === undefined) return '';
  const parts: string[] = [];
  if (thermal.gap.gapSeconds !== null) {
    parts.push(
      `started ${thermal.gap.gapSeconds} s after ${thermal.gap.previousActivity} ` +
        `${thermal.gap.previousId} ended`
    );
  }
  if (thermal.drift !== null && thermal.drift.length > 0) {
    parts.push(`sentinel drift ${thermal.drift.map((d) => `${d.format} ${pct(d.driftPercent)}`).join(', ')}`);
  }
  return parts.length === 0 ? '' : `Thermal contamination: ${parts.join('; ')}.`;
}

function mmss(ms: number | null): string {
  if (ms === null) return '—';
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`;
}

export default function BenchmarkScreen() {
  const router = useRouter();
  const [runs, setRuns] = useState<RunCheckpoint[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<RunAggregate | null>(null);
  const [cross, setCross] = useState<CrossRunReport | null>(null);
  const [warmup, setWarmup] = useState<WarmupProfileSeries | null>(null);
  const [lastLead, setLastLead] = useState<SerializationFormat | null>(null);
  const [perCell, setPerCell] = useState<PerCellProfileReport | null>(null);
  const [sufficiency, setSufficiency] = useState<WarmupSufficiency | null>(null);
  const [activity, setActivity] = useState<DeviceActivity[]>([]);
  const [now, setNow] = useState(Date.now());
  const [exclusions, setExclusions] = useState<Record<string, RunExclusion>>({});
  const [editingExclusion, setEditingExclusion] = useState<{ runId: string; text: string } | null>(
    null
  );

  // A ref would be lost across re-renders of a long-running loop; a module-free
  // closure over state is enough because the runner only reads it between
  // payloads.
  const [stopRequested, setStopRequested] = useState(false);

  const environment = React.useMemo(() => captureEnvironment(null), []);
  const connection = describeBaseUrl();
  const plan = projectPlan();
  // Recomputed on every tick, so the countdown moves without a refresh.
  const cooldown = assessCooldown(activity, now);

  const refresh = useCallback(async () => {
    setRuns(await listRuns());
    setCross(await compareRuns());
    // Profiles are persisted per leading format: the three orderings are run
    // from three cold launches, so they must be reloaded, not remembered.
    setWarmup(await loadWarmupSeries());
    setPerCell(await readPerCellProfile());
    setSufficiency(await loadSufficiency());
    setActivity(await gatherDeviceActivity());
    setNow(Date.now());
    const stored = await listRuns();
    const found: Record<string, RunExclusion> = {};
    for (const run of stored) {
      const m = await readExclusion(run.runId);
      if (m !== null) found[run.runId] = m;
    }
    setExclusions(found);
  }, []);

  // A clock for the cooldown countdown. Five seconds is fine-grained enough for
  // a ten-minute wait and costs nothing between ticks.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function profileWarmup(leadFormat: SerializationFormat) {
    setBusy(true);
    setError(null);
    try {
      await runWarmupProfile(150, 10, setProgress, leadFormat);
      // Read back from disk rather than merging in memory, so what is shown is
      // what a later session will actually load.
      setWarmup(await loadWarmupSeries());
      setSufficiency(await loadSufficiency());
      setLastLead(leadFormat);
    } catch (err) {
      const failure = describeRequestError(err, `profile warm-up (${leadFormat} first)`);
      setError(`${failure.title} — ${failure.detail}`);
    } finally {
      setBusy(false);
    }
  }

  async function profilePerCell() {
    setBusy(true);
    setError(null);
    try {
      setPerCell(await runPerCellProfile(24, 25, 10, BENCHMARK_CONFIG.prewarmDecodes, setProgress));
      setSufficiency(await loadSufficiency());
    } catch (err) {
      const failure = describeRequestError(err, 'profile the per-cell transient');
      setError(`${failure.title} — ${failure.detail}`);
    } finally {
      setBusy(false);
    }
  }

  async function resetProfiles() {
    await clearWarmupProfiles();
    setWarmup(null);
    setLastLead(null);
    setPerCell(null);
    setSufficiency(await loadSufficiency());
  }

  async function start(
    resumeRunId?: string,
    overrideInsufficientWarmup = false,
    cooldownAcknowledged = false
  ) {
    setBusy(true);
    setError(null);
    setSummary(null);
    setStopRequested(false);
    let stop = false;
    const requestStop = () => stop;
    // Bridge the state flag into the closure the runner polls.
    const unsubscribe = { set: (v: boolean) => (stop = v) };
    stopBridge = unsubscribe;

    try {
      const outcome = await runBenchmark({
        resumeRunId,
        onProgress: setProgress,
        shouldStop: requestStop,
        overrideInsufficientWarmup,
        cooldownAcknowledged,
      });
      setSummary(outcome.aggregate);
      if (outcome.stoppedEarly) {
        setError('Stopped at a checkpoint. Resume picks up from the next unmeasured payload.');
      }
    } catch (err) {
      const failure = describeRequestError(err, 'run the benchmark');
      setError(`${failure.title} — ${failure.detail}${failure.hint ? ` ${failure.hint}` : ''}`);
    } finally {
      stopBridge = null;
      setBusy(false);
      await refresh();
    }
  }

  const releaseReady = environment.buildType === 'release';

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Benchmark runner</Text>
        <View style={{ width: 48 }} />
      </View>

      {/* ── Build gate ─────────────────────────────────────────────────────── */}
      <View style={[styles.card, releaseReady ? styles.cardOk : styles.cardWarn]}>
        <Text style={styles.cardTitle}>
          {releaseReady ? 'Release bundle — timings usable' : 'DEBUG bundle — timings NOT usable'}
        </Text>
        <Text style={styles.mono} selectable>
          {describeEnvironment(environment)}
        </Text>
        {!releaseReady && (
          <Text style={styles.note}>
            Restart Metro with{' '}
            <Text style={styles.code}>npx expo start --no-dev --minify</Text> and reload. The run
            still works in debug, but every decode time is inflated by development-only checks.
          </Text>
        )}
        {!environment.standalone && (
          <Text style={styles.note}>
            Not a standalone binary ({environment.executionEnvironment}) — Hermes compiles the
            bundle lazily here rather than loading precompiled bytecode. Fine for verification, not
            for the published numbers.
          </Text>
        )}
      </View>

      {/* ── Plan ───────────────────────────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>What will run</Text>
      <Text style={styles.body}>
        {PLANNED_PAYLOADS} payloads × {SERIALIZATION_FORMATS.length} formats × (
        {BENCHMARK_CONFIG.warmupIterations} warm-up + {BENCHMARK_CONFIG.measuredIterations} measured)
        = {plan.totalDecodes.toLocaleString()} decodes, {plan.measuredRows.toLocaleString()} measured
        rows, plus {plan.prewarmDecodes.toLocaleString()} discarded pre-warm decodes. Every payload is
        fetched first and decoded from memory, so no measured decode contains network time. Proxy:{' '}
        <Text style={styles.code}>{connection.url}</Text> ({connection.explanation}).
      </Text>

      {/* ── Warm-up profile ───────────────────────────────────── */}
      <Text style={styles.sectionTitle}>Warm-up profile</Text>
      <Text style={styles.note}>
        Measures, from cold, how many decodes each format needs before its timings settle. Run this
        FIRST, on a freshly launched app — anything done beforehand warms the engine and flatters the
        result. Only the LEADING format meets a cold engine; the other two inherit warm-up it paid
        for, so their figures come out too low. Run it once per leading format, force-stopping the
        app in between. Results are saved to disk and accumulate across launches. Current per-cell
        warm-up: {BENCHMARK_CONFIG.warmupIterations}, global pre-warm {BENCHMARK_CONFIG.prewarmDecodes}{' '}
        per format.
      </Text>
      <View style={styles.buttonRow}>
        {SERIALIZATION_FORMATS.map((format) => {
          const measured = warmup?.reports.some((r) => r.leadFormat === format) ?? false;
          return (
            <Pressable
              key={format}
              style={[
                styles.secondaryButton,
                measured && styles.buttonDone,
                busy && styles.buttonDisabled,
              ]}
              disabled={busy}
              onPress={() => profileWarmup(format)}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryButtonText}>
                {measured ? '✓ ' : ''}
                {format} first
              </Text>
            </Pressable>
          );
        })}
      </View>

      {warmup !== null && warmup.reports.length > 0 && (
        <View
          style={[
            styles.card,
            warmup.missingLeads.length === 0 ? styles.cardOk : styles.cardWarn,
          ]}
        >
          <Text style={styles.cardTitle}>
            Cold requirement: {warmup.coldRequirement ?? '—'} decodes (strict rule{' '}
            {warmup.coldRequirementStrict ?? '—'}) → prewarmDecodes{' '}
            {warmup.recommendedPrewarm ?? '—'} (currently {warmup.currentPrewarm})
          </Text>
          <Text style={styles.note}>
            This sets the once-per-run ENGINE pre-warm, at {warmup.prewarmHeadroom}× headroom — not
            warmupIterations, which is paid on all 750 cells with the engine already warm. Use the
            per-cell profile below for that.
          </Text>
          <Text style={styles.mono} selectable>
            {'robust/strict  cold      max      by ordering'}
          </Text>
          {warmup.perFormat.map((f) => (
            <Text key={f.format} style={styles.mono} selectable>
              {`${f.format.padEnd(9)}` +
                `${`${f.coldRecommended ?? '—'}/${f.coldStrict ?? '—'}`.padStart(9)}` +
                `${`${f.maxRecommended ?? '—'}/${f.maxStrict ?? '—'}`.padStart(9)}  ` +
                f.observations
                  .map(
                    (o) =>
                      `${o.leadFormat.slice(0, 4)}#${o.positionInOrder}:` +
                      `${o.robustWarmup ?? '—'}/${o.strictWarmup ?? '—'}`
                  )
                  .join(' ')}
            </Text>
          ))}
          {warmup.perFormat.flatMap((f) =>
            f.observations
              .filter((o) => o.outliers.length > 0)
              .map((o) => (
                <Text key={`${f.format}-${o.leadFormat}`} style={styles.note} selectable>
                  Outliers — {f.format} in the {o.leadFormat}-led session: windows{' '}
                  {o.outliers
                    .map((w) => `${w.fromIteration} (${w.meanMs.toFixed(2)} ms, ${pct(w.percentVsReference)})`)
                    .join(', ')}
                  . Tolerated by the robust rule; they set the strict figure.
                </Text>
              ))
          )}
          <Text style={styles.note}>{warmup.note}</Text>

          {warmup.reports.map((report) => (
            <View key={report.leadFormat}>
              <Text style={styles.cardTitle}>
                {report.order.join(' → ')} · payload {report.payloadId} ({report.tier}) ·{' '}
                {report.iterations} decodes, windows of {report.windowSize}
              </Text>
              {report.profiles.map((pf) => (
                <View key={pf.format}>
                  <Text style={styles.body}>
                    {pf.format} (position {pf.positionInOrder}) — settles after{' '}
                    {analyseSettling(pf.windows).robust ?? 'never'} robust,{' '}
                    {analyseSettling(pf.windows).strict ?? 'never'} strict
                    {pf.positionInOrder === 1 ? ' · COLD' : ''}
                  </Text>
                  <Text style={styles.mono} selectable>
                    {'from   mean ms     sd     %vs final'}
                  </Text>
                  {pf.windows.map((w) => (
                    <Text key={w.fromIteration} style={styles.mono} selectable>
                      {`${String(w.fromIteration).padStart(4)}${w.meanMs.toFixed(3).padStart(11)}` +
                        `${w.sdMs.toFixed(3).padStart(8)}` +
                        `${(w.percentVsFinal >= 0 ? '+' : '') + w.percentVsFinal.toFixed(1)}%`.padStart(
                          12
                        )}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          ))}

          {lastLead !== null && warmup.missingLeads.length > 0 && (
            <Text style={styles.note}>
              Next: force-stop the app, launch it again, and run “{warmup.missingLeads[0]} first”.
              Running it without relaunching would measure an already-warm engine.
            </Text>
          )}

          <View style={styles.buttonRow}>
            <Pressable
              style={styles.secondaryButton}
              disabled={busy}
              onPress={() => exportWarmupProfiles(warmup)}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryButtonText}>Export profiles</Text>
            </Pressable>
            <Pressable
              style={styles.secondaryButton}
              disabled={busy}
              onPress={resetProfiles}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryButtonText}>Clear profiles</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── Per-cell profile ──────────────────────────────────── */}
      <Text style={styles.sectionTitle}>Per-cell profile</Text>
      <Text style={styles.note}>
        A different experiment: it pre-warms the engine first, then measures what a PREVIOUSLY UNSEEN
        payload costs on its first few decodes. That transient — a new buffer, new object shapes — is
        all warmupIterations has to absorb, so this is the evidence for it. No fresh launch needed;
        run it right after a cold profile if you like. Each format gets its own fresh payloads,
        disjoint from the others and from anything the cold profiles touched. Current per-cell
        warm-up: {BENCHMARK_CONFIG.warmupIterations}.
      </Text>
      <View style={styles.buttonRow}>
        <Pressable
          style={[styles.secondaryButton, busy && styles.buttonDisabled]}
          disabled={busy}
          onPress={profilePerCell}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryButtonText}>Run per-cell profile</Text>
        </Pressable>
      </View>

      {perCell !== null && (
        <View
          style={[
            styles.card,
            perCell.recommendedWarmup === null ? styles.cardWarn : styles.cardOk,
          ]}
        >
          <Text style={styles.cardTitle}>
            warmupIterations: {perCell.recommendedWithFloor ?? 'no recommendation'} (currently{' '}
            {perCell.currentWarmup})
          </Text>
          <Text style={styles.note}>
            Measured {perCell.recommendedWarmup ?? '—'}, floor {perCell.chosenFloor} — the floor is a
            chosen margin, not a measurement. Profiled in {perCell.environment.buildType}/
            {perCell.environment.executionEnvironment}
            {perCell.environment.standalone ? ', bytecode precompiled' : ', bytecode compiled lazily'}.
          </Text>
          <Text style={styles.note}>
            {perCell.payloadsPerFormat} fresh payloads per format · {perCell.iterations} decodes each
            · steady state = last {perCell.tailWindow} · engine pre-warmed{' '}
            {perCell.prewarmDecodes} · bias limit {(perCell.biasTolerance * 100).toFixed(2)}%
          </Text>

          {perCell.profiles.map((pf) => (
            <View key={pf.format}>
              <Text style={styles.body}>
                {pf.format} — first decode {pf.firstIterationPercentVsTail >= 0 ? '+' : ''}
                {pf.firstIterationPercentVsTail.toFixed(1)}% vs steady state, settles at{' '}
                {pf.recommendedWarmup ?? 'never'}
              </Text>
              <Text style={styles.mono} selectable>
                {'iter   mean ms     sd    %vs tail'}
              </Text>
              {pf.perIteration.slice(0, 12).map((it) => (
                <Text key={it.iteration} style={styles.mono} selectable>
                  {`${String(it.iteration).padStart(4)}${it.meanMs.toFixed(3).padStart(11)}` +
                    `${it.sdMs.toFixed(3).padStart(8)}` +
                    `${(it.percentVsTail >= 0 ? '+' : '') + it.percentVsTail.toFixed(2)}%`.padStart(
                      12
                    )}
                </Text>
              ))}
              <Text style={styles.mono} selectable>
                {'warm-up  measured mean   residual bias'}
              </Text>
              {pf.bias.map((b) => (
                <Text key={b.warmupIterations} style={styles.mono} selectable>
                  {`${String(b.warmupIterations).padStart(7)}${b.meanMs.toFixed(3).padStart(15)}` +
                    `${(b.percentVsTail >= 0 ? '+' : '') + b.percentVsTail.toFixed(3)}%`.padStart(
                      16
                    ) +
                    (b.degenerate ? '  (window = tail)' : '')}
                </Text>
              ))}
            </View>
          ))}
          <Text style={styles.note}>{perCell.note}</Text>
        </View>
      )}

      {/* ── Warm-up gate ─────────────────────────────────────── */}
      {sufficiency !== null && (
        <View
          style={[
            styles.card,
            sufficiency.verdict === 'sufficient' ? styles.cardOk : styles.cardWarn,
          ]}
        >
          <Text style={styles.cardTitle}>
            Warm-up {sufficiency.verdict === 'sufficient' ? 'verified here' : sufficiency.verdict}
          </Text>
          <Text style={styles.mono} selectable>
            {`prewarmDecodes   ${String(sufficiency.configuredPrewarm).padStart(4)} vs measured ` +
              `${sufficiency.measuredColdRequirement ?? '—'}`}
          </Text>
          <Text style={styles.mono} selectable>
            {`warmupIterations ${String(sufficiency.configuredWarmup).padStart(4)} vs measured ` +
              `${sufficiency.measuredPerCellRequirement ?? '—'}`}
          </Text>
          <Text style={styles.note}>{sufficiency.note}</Text>
        </View>
      )}

      {/* ── Cooldown ──────────────────────────────────────────── */}
      <View style={[styles.card, cooldown.satisfied ? styles.cardOk : styles.cardWarn]}>
        <Text style={styles.cardTitle}>
          {cooldown.gapSeconds === null
            ? 'Cooldown: no earlier activity on record'
            : cooldown.satisfied
              ? `Cooled down — idle ${mmss(cooldown.gapSeconds * 1000)}`
              : `Still warm — wait ${mmss(secondsRemaining(cooldown) * 1000)}`}
        </Text>
        <Text style={styles.note}>
          {cooldown.gapSeconds === null
            ? 'Nothing on this device has loaded the CPU yet.'
            : `Last load: ${cooldown.previousActivity} ${cooldown.previousId}, ended ` +
              `${mmss(cooldown.gapSeconds * 1000)} ago. Minimum idle before a run: ` +
              `${cooldown.minimumSeconds / 60} min. The gap is recorded in the run either way; a run ` +
              'whose sentinel drift then exceeds the limit is refused by the comparison.'}
        </Text>
      </View>

      {/* ── Controls ───────────────────────────────────────────────────────── */}
      <View style={styles.buttonRow}>
        <Pressable
          style={[
            styles.primaryButton,
            (busy || sufficiency?.verdict === 'insufficient' || !cooldown.satisfied) &&
              styles.buttonDisabled,
          ]}
          disabled={busy || sufficiency?.verdict === 'insufficient' || !cooldown.satisfied}
          onPress={() => start()}
          accessibilityRole="button"
        >
          <Text style={styles.primaryButtonText}>{busy ? 'Running…' : 'Start new run'}</Text>
        </Pressable>
        {!busy && (sufficiency?.verdict === 'insufficient' || !cooldown.satisfied) && (
          <Pressable
            style={styles.secondaryButton}
            onPress={() =>
              start(undefined, sufficiency?.verdict === 'insufficient', !cooldown.satisfied)
            }
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>
              Start anyway —{' '}
              {[
                sufficiency?.verdict === 'insufficient' ? 'warm-up insufficient' : null,
                !cooldown.satisfied ? 'inside cooldown' : null,
              ]
                .filter((x) => x !== null)
                .join(', ')}{' '}
              (recorded)
            </Text>
          </Pressable>
        )}
        {busy && (
          <Pressable
            style={styles.secondaryButton}
            onPress={() => {
              setStopRequested(true);
              stopBridge?.set(true);
            }}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>
              {stopRequested ? 'Stopping…' : 'Stop at checkpoint'}
            </Text>
          </Pressable>
        )}
      </View>

      {busy && progress !== null && (
        <View style={styles.card}>
          <View style={styles.progressRow}>
            <ActivityIndicator color={palette.primary} />
            <Text style={styles.body}>
              {progress.phase} · {progress.done}/{progress.total} · {progress.label}
            </Text>
          </View>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                { width: `${progress.total === 0 ? 0 : (progress.done / progress.total) * 100}%` },
              ]}
            />
          </View>
          <Text style={styles.note}>ETA {mmss(progress.etaMs)}</Text>
        </View>
      )}

      {error !== null && (
        <Text style={[styles.body, styles.error]} selectable>
          {error}
        </Text>
      )}

      {/* ── Last summary ───────────────────────────────────────────────────── */}
      {summary !== null && <SummaryView summary={summary} />}

      {/* ── Stored runs ────────────────────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>Runs on this device</Text>
      {runs.length === 0 ? (
        <Text style={styles.note}>None yet.</Text>
      ) : (
        runs.map((run) => (
          <View key={run.runId} style={styles.card}>
            <Text style={styles.mono} selectable>
              {run.runId}
            </Text>
            <Text style={styles.note}>
              {run.finishedAt === null
                ? `incomplete — ${run.completedPayloadIds.length} payloads done`
                : `complete — ${run.rowCount.toLocaleString()} rows`}
              {' · '}
              {run.environment.buildType}
            </Text>
            {(() => {
              const t = cross?.thermal.find((x) => x.runId === run.runId);
              if (t === undefined) return null;
              return (
                <Text style={styles.mono} selectable>
                  {`gap ${t.gap.gapSeconds === null ? '—' : `${t.gap.gapSeconds} s`}` +
                    (t.gap.source === 'derived' ? ' (from run times)' : '') +
                    ` · drift ${
                      t.drift === null
                        ? 'unknown'
                        : t.drift
                            .map(
                              (d) =>
                                `${d.format.slice(0, 4)} ${pct(d.driftPercent)}` +
                                `±${d.standardErrorPercent.toFixed(1)}`
                            )
                            .join(' ')
                    }`}
                </Text>
              );
            })()}
            {exclusions[run.runId] !== undefined && (
              <Text style={[styles.note, { color: palette.danger }]} selectable>
                Excluded {exclusions[run.runId].excludedAt}: {exclusions[run.runId].reason}
              </Text>
            )}
            {editingExclusion?.runId === run.runId && (
              <View>
                <TextInput
                  style={styles.input}
                  value={editingExclusion.text}
                  onChangeText={(text) => setEditingExclusion({ runId: run.runId, text })}
                  placeholder="Why is this run excluded?"
                  multiline
                />
                <View style={styles.buttonRow}>
                  <Pressable
                    style={[
                      styles.secondaryButton,
                      editingExclusion.text.trim().length === 0 && styles.buttonDisabled,
                    ]}
                    disabled={editingExclusion.text.trim().length === 0}
                    onPress={async () => {
                      await writeExclusion(run.runId, editingExclusion.text.trim());
                      setEditingExclusion(null);
                      await refresh();
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={styles.secondaryButtonText}>Save exclusion</Text>
                  </Pressable>
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={() => setEditingExclusion(null)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.secondaryButtonText}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            )}
            <View style={styles.buttonRow}>
              {run.finishedAt === null && (
                <Pressable
                  style={styles.secondaryButton}
                  disabled={busy}
                  onPress={() => start(run.runId)}
                  accessibilityRole="button"
                >
                  <Text style={styles.secondaryButtonText}>Resume</Text>
                </Pressable>
              )}
              <Pressable
                style={styles.secondaryButton}
                onPress={() => exportCsv(run)}
                accessibilityRole="button"
              >
                <Text style={styles.secondaryButtonText}>Export CSV</Text>
              </Pressable>
              {run.finishedAt !== null && (
                <>
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={() => exportAggregate(run.runId)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.secondaryButtonText}>Export summary</Text>
                  </Pressable>
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={async () => setSummary(await readAggregate(run.runId))}
                    accessibilityRole="button"
                  >
                    <Text style={styles.secondaryButtonText}>View</Text>
                  </Pressable>
                  {exclusions[run.runId] === undefined ? (
                    <Pressable
                      style={styles.secondaryButton}
                      disabled={busy}
                      onPress={() =>
                        setEditingExclusion({
                          runId: run.runId,
                          text: suggestExclusionReason(
                            cross?.thermal.find((x) => x.runId === run.runId)
                          ),
                        })
                      }
                      accessibilityRole="button"
                    >
                      <Text style={styles.secondaryButtonText}>Exclude…</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      style={styles.secondaryButton}
                      disabled={busy}
                      onPress={async () => {
                        await clearExclusion(run.runId);
                        await refresh();
                      }}
                      accessibilityRole="button"
                    >
                      <Text style={styles.secondaryButtonText}>Restore to comparison</Text>
                    </Pressable>
                  )}
                </>
              )}
              <Pressable
                style={styles.secondaryButton}
                disabled={busy}
                onPress={async () => {
                  await deleteRun(run.runId);
                  await refresh();
                }}
                accessibilityRole="button"
              >
                <Text style={[styles.secondaryButtonText, { color: palette.danger }]}>Delete</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}

      {/* ── Between-run variation ──────────────────────────────────────────── */}
      {cross !== null && (cross.cells.length > 0 || cross.excluded.length > 0) && (
        <>
          <Text style={styles.sectionTitle}>Between-run variation</Text>
          <Text style={styles.note}>
            {cross.runIds.length} comparable run{cross.runIds.length === 1 ? '' : 's'}. Between-run
            sd is over run means; within-run sd is the mean of each run&apos;s own sd.
          </Text>
          <Text style={styles.mono} selectable>
            {'tier   format     mean ms   between-sd  within-sd    CV%'}
          </Text>
          {cross.cells.map((c) => (
            <Text key={`${c.tier}-${c.format}`} style={styles.mono} selectable>
              {`${c.tier.padEnd(6)} ${c.format.padEnd(9)}` +
                `${c.meanOfRunMeansMs.toFixed(3).padStart(10)}` +
                `${c.betweenRunSdMs.toFixed(3).padStart(12)}` +
                `${c.meanWithinRunSdMs.toFixed(3).padStart(11)}` +
                `${c.betweenRunCvPercent.toFixed(1).padStart(7)}`}
            </Text>
          ))}
          {cross.notes.map((n, i) => (
            <Text key={i} style={styles.note}>
              {n}
            </Text>
          ))}
        </>
      )}
    </ScrollView>
  );
}

/** Module-level bridge so the Stop button can reach the running closure. */
let stopBridge: { set: (v: boolean) => void } | null = null;

function SummaryView({ summary }: { summary: RunAggregate }) {
  return (
    <>
      <Text style={styles.sectionTitle}>Result — {summary.runId}</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Determinism</Text>
        <Text style={styles.body}>
          {summary.determinism.deterministic
            ? summary.determinism.exactlyIdentical
              ? 'Heap delta identical on every repeat, every format.'
              : 'Heap delta constant within tolerance (not bit-identical).'
            : 'Heap delta VARIED beyond tolerance — memory is not a constant on this build.'}
        </Text>
        <Text style={styles.mono} selectable>
          {'format     sd       mean B        CV%    range B  quanta'}
        </Text>
        {summary.determinism.perFormat.map((f) => (
          <Text key={f.format} style={styles.mono} selectable>
            {`${f.format.padEnd(9)}${(f.heap === null ? '—' : f.heap.sd.toFixed(2)).padStart(7)}` +
              `${(f.heap === null ? '—' : f.heap.mean.toFixed(0)).padStart(13)}` +
              `${(f.constancy === null ? '—' : (f.constancy.cv * 100).toFixed(4)).padStart(11)}` +
              `${(f.constancy === null ? '—' : String(f.constancy.rangeBytes)).padStart(11)}` +
              `${(f.constancy?.rangeQuanta === null || f.constancy === null
                ? '—'
                : f.constancy.rangeQuanta.toFixed(1)
              ).padStart(8)}`}
          </Text>
        ))}
        <Text style={styles.note}>
          Tolerance {(summary.determinism.cvTolerance * 100).toFixed(2)}% CV · inferred quantum{' '}
          {summary.determinism.quantumBytes ?? '—'} B
        </Text>

        <Text style={styles.cardTitle}>Bracket offset</Text>
        <Text style={styles.mono} selectable>
          {`${summary.calibration.offsetBytes ?? '—'} B · before ` +
            `${summary.calibration.before?.mean ?? '—'} → after ${summary.calibration.after?.mean ?? '—'} · ` +
            `drift ${summary.calibration.driftBytes ?? '—'} B (` +
            `${summary.calibration.driftQuanta === null ? '—' : summary.calibration.driftQuanta.toFixed(2)} quanta) · ` +
            `${summary.calibration.stable ? 'stable' : 'DRIFTED'}`}
        </Text>
        <Text style={styles.note}>{summary.calibration.explanation}</Text>
      </View>

      <Text style={styles.cardTitle}>Per format per tier</Text>
      <Text style={styles.mono} selectable>
        {'tier   format      ms      sd     %json    heap KB   %json   n(mem)'}
      </Text>
      {summary.cells.map((c) => (
        <Text key={`${c.tier}-${c.format}`} style={styles.mono} selectable>
          {`${c.tier.padEnd(6)} ${c.format.padEnd(9)}` +
            `${c.meanMs.toFixed(3).padStart(8)}` +
            `${c.sdMs.toFixed(3).padStart(8)}` +
            `${(c.msPercentVsJson === null ? '—' : c.msPercentVsJson.toFixed(1)).padStart(9)}` +
            `${(c.meanHeapBytesCorrected === null ? '—' : (c.meanHeapBytesCorrected / 1024).toFixed(1)).padStart(11)}` +
            `${(c.heapPercentVsJson === null ? '—' : c.heapPercentVsJson.toFixed(1)).padStart(8)}` +
            `${String(c.memoryN).padStart(9)}`}
        </Text>
      ))}

      <Text style={styles.cardTitle}>Thermal drift (sentinel payload)</Text>
      {summary.drift.map((d) => (
        <Text key={d.format} style={styles.mono} selectable>
          {`${d.format.padEnd(9)} ${d.startMeanMs.toFixed(3)} → ${d.middleMeanMs.toFixed(3)} → ` +
            `${d.endMeanMs.toFixed(3)} ms  (${d.driftPercent >= 0 ? '+' : ''}${d.driftPercent.toFixed(1)}%` +
              (typeof d.standardErrorPercent === 'number'
                ? ` \u00b1${d.standardErrorPercent.toFixed(2)}, limit ${d.limitInStandardErrors.toFixed(1)} SE)`
                : ')')}
        </Text>
      ))}

      {summary.notes.map((n, i) => (
        <Text key={i} style={styles.note}>
          • {n}
        </Text>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.surfaceAlt },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  back: { ...type.label, color: palette.primary },
  title: { ...type.section, color: palette.ink },
  sectionTitle: { ...type.section, fontSize: 15, color: palette.ink, marginTop: spacing.xl, marginBottom: spacing.sm },
  cardTitle: { ...type.cardTitle, color: palette.primary, marginTop: spacing.md, marginBottom: spacing.xs },
  body: { ...type.body, color: palette.body },
  note: { ...type.caption, color: palette.muted, marginTop: spacing.xs, lineHeight: 16 },
  code: { fontFamily: 'monospace', color: palette.primary },
  mono: { fontFamily: 'monospace', fontSize: 11, lineHeight: 16, color: palette.ink },
  error: { color: palette.danger, marginTop: spacing.md },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  cardOk: { borderColor: '#a9ddc4', backgroundColor: '#f2fbf6' },
  cardWarn: { borderColor: '#f0cfa0', backgroundColor: '#fdf6ec' },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  primaryButton: {
    backgroundColor: palette.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  primaryButtonText: { ...type.label, color: palette.surface },
  secondaryButton: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  secondaryButtonText: { ...type.label, color: palette.primary },
  buttonDisabled: { opacity: 0.5 },
  input: {
    backgroundColor: palette.surfaceTint,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
    color: palette.ink,
    ...type.body,
  },
  buttonDone: { borderColor: '#a9ddc4', backgroundColor: '#f2fbf6' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.surfaceTint,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  barFill: { height: 6, backgroundColor: palette.accentDeep },
});
