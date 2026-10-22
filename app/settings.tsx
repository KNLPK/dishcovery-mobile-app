/**
 * app/settings.tsx
 *
 * Server settings: where recipes come from.
 *
 *   Online   the hosted demo server (ONLINE_BASE_URL)
 *   Laptop   dishcovery-proxy on the developer's machine; the address follows
 *            the Metro dev server unless a manual URL is set
 *   Offline  no server; browsing is off, the quick test uses bundled payloads
 *
 * "Test connection" calls /health with the long wake-up timeout, so a sleeping
 * online server gets the time it needs, and says so while it waits.
 */

import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { buttonLook } from '../components/Buttons';
import { FormField, KeyboardForm } from '../components/KeyboardForm';
import { Screen, StackHeader } from '../components/Screen';

import { ONLINE_BASE_URL, API_BASE_URL } from '../constants/api';
import { palette, radius, spacing, touchTarget, type } from '../constants/theme';
import { effectiveServerMode, serverBaseUrl } from '../src/api/baseUrl';
import { describeRequestError } from '../src/api/errors';
import { checkHealth, WAKE_TIMEOUT_MS, type HealthInfo } from '../src/api/serverStatus';
import {
  normaliseBaseUrl,
  setBaseUrlOverride,
  setServerMode,
  useSettings,
  type ServerMode,
} from '../src/settings/settings';
import { showToast } from '../src/ui/toast';

const MODES: { mode: ServerMode; label: string; detail: string }[] = [
  {
    mode: 'online',
    label: 'Online',
    detail:
      ONLINE_BASE_URL === null
        ? 'The hosted demo server. Not set up in this build yet.'
        : 'The hosted demo server: browse 150 AI-generated recipes. Needs internet.',
  },
  {
    mode: 'laptop',
    label: 'Laptop',
    detail: 'dishcovery-proxy running on a computer on the same Wi-Fi. For development.',
  },
  {
    mode: 'offline',
    label: 'Offline',
    detail: 'No server. Recipe browsing is off; the quick test and paper results still work.',
  },
];

type TestState =
  | { kind: 'idle' }
  | { kind: 'testing'; waking: boolean }
  | { kind: 'ok'; health: HealthInfo; ms: number }
  | { kind: 'failed'; title: string; detail: string };

export default function ServerSettingsScreen() {
  const settings = useSettings();
  const mode = effectiveServerMode();
  const url = serverBaseUrl();
  const [draftUrl, setDraftUrl] = useState(settings.baseUrlOverride ?? '');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [test, setTest] = useState<TestState>({ kind: 'idle' });

  function choose(next: ServerMode) {
    setServerMode(next);
    setTest({ kind: 'idle' });
  }

  function saveOverride() {
    const trimmed = draftUrl.trim();
    if (trimmed.length === 0) {
      setBaseUrlOverride(null);
      setUrlError(null);
      return;
    }
    const normalised = normaliseBaseUrl(trimmed);
    if (normalised === null) {
      setUrlError('Needs to look like http://192.168.1.20:3001 — scheme, host, port, no path.');
      return;
    }
    setBaseUrlOverride(normalised);
    setDraftUrl(normalised);
    setUrlError(null);
    setTest({ kind: 'idle' });
  }

  async function runTest() {
    if (url === null) return;
    setTest({ kind: 'testing', waking: false });
    const notice = setTimeout(() => setTest({ kind: 'testing', waking: true }), 3000);
    const started = Date.now();
    try {
      const health = await checkHealth(url, WAKE_TIMEOUT_MS);
      const ms = Date.now() - started;
      setTest({ kind: 'ok', health, ms });
      showToast({ kind: 'success', message: `Server reachable (${(ms / 1000).toFixed(1)} s)` });
    } catch (err) {
      const failure = describeRequestError(err, 'reach the server');
      setTest({ kind: 'failed', title: failure.title, detail: failure.hint ?? failure.detail });
      showToast({ kind: 'error', message: failure.title, action: { label: 'Retry', onPress: runTest } });
    } finally {
      clearTimeout(notice);
    }
  }

  return (
    <Screen background={palette.surfaceAlt}>
      <StackHeader title="Server settings" />
      <KeyboardForm style={styles.page} contentContainerStyle={styles.content}>

      <Text style={styles.section}>Get recipes from</Text>
      <View style={styles.choices} accessibilityRole="radiogroup">
        {MODES.map((m) => {
          const active = mode === m.mode;
          return (
            <Pressable
              key={m.mode}
              onPress={() => choose(m.mode)}
              style={[styles.choice, active && styles.choiceActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
            >
              <View style={styles.choiceTop}>
                <Text style={[styles.choiceLabel, active && styles.choiceLabelActive]}>{m.label}</Text>
                {active && <Text style={styles.selected}>Selected</Text>}
              </View>
              <Text style={styles.choiceDetail}>{m.detail}</Text>
            </Pressable>
          );
        })}
      </View>
      {settings.serverMode === null && (
        <Text style={styles.note}>Not chosen yet; this build defaults to {mode === 'laptop' ? 'Laptop' : 'Online'}.</Text>
      )}

      {mode === 'laptop' && (
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Laptop proxy URL (optional)</Text>
          <FormField
            style={styles.input}
            value={draftUrl}
            onChangeText={setDraftUrl}
            placeholder={`empty = follow the dev server (${API_BASE_URL})`}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="done"
            onSubmitEditing={saveOverride}
            accessibilityLabel="Laptop proxy URL"
          />
          {urlError !== null && <Text style={styles.inputError}>{urlError}</Text>}
          <View style={styles.buttonRow}>
            <Pressable onPress={saveOverride} style={styles.primaryButton} accessibilityRole="button">
              <Text style={styles.primaryButtonText}>Save</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setDraftUrl('');
                setBaseUrlOverride(null);
                setUrlError(null);
              }}
              style={styles.secondaryButton}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryButtonText}>Follow dev server</Text>
            </Pressable>
          </View>
        </View>
      )}

      <Text style={styles.section}>Connection</Text>
      <View style={styles.card}>
        <Text style={styles.url} selectable>
          {url ?? (mode === 'offline' ? 'No server (offline)' : 'No online server in this build')}
        </Text>
        {url !== null && (
          <Pressable
            onPress={runTest}
            disabled={test.kind === 'testing'}
            style={[styles.primaryButton, styles.testButton, test.kind === 'testing' && styles.disabled]}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>Test connection</Text>
          </Pressable>
        )}
        {test.kind === 'testing' && (
          <View style={styles.status} accessibilityLiveRegion="polite">
            <ActivityIndicator color={palette.primary} />
            <Text style={styles.body}>
              {test.waking ? 'Connecting to the server…' : 'Checking…'}
            </Text>
          </View>
        )}
        {test.kind === 'ok' && (
          <View accessibilityLiveRegion="polite">
            <Text style={styles.ok}>✓ Reachable ({(test.ms / 1000).toFixed(1)} s)</Text>
            <Text style={styles.note}>
              {test.health.mode === 'hosted' ? 'Hosted demo server' : 'Local proxy'}
              {test.health.datasetTotal !== null ? ` · ${test.health.datasetTotal} benchmark payloads` : ''}
              {test.health.source !== null ? ` · recipes from ${test.health.source}` : ''}
            </Text>
          </View>
        )}
        {test.kind === 'failed' && (
          <View accessibilityRole="alert">
            <Text style={styles.failed}>✕ {test.title}</Text>
            <Text style={styles.note}>{test.detail}</Text>
          </View>
        )}
      </View>
      </KeyboardForm>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.surfaceAlt },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  section: { ...type.cardTitle, color: palette.ink, marginTop: spacing.lg, marginBottom: spacing.sm },
  choices: { gap: spacing.sm },
  choice: {
    minHeight: touchTarget,
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
  },
  choiceActive: { borderColor: palette.primary, borderWidth: 2 },
  choiceTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  choiceLabel: { ...type.cardTitle, color: palette.body },
  choiceLabelActive: { color: palette.primary, fontWeight: '700' },
  selected: { ...type.caption, color: palette.primary, fontWeight: '700' },
  choiceDetail: { ...type.caption, color: palette.muted, marginTop: 2, lineHeight: 16 },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  fieldLabel: { ...type.caption, color: palette.muted },
  input: {
    minHeight: touchTarget,
    backgroundColor: palette.surfaceTint,
    borderRadius: radius.sm,
    borderColor: palette.border,
    marginTop: spacing.xs,
  },
  inputError: { ...type.caption, color: palette.danger, marginTop: spacing.xs },
  url: { ...type.cardTitle, color: palette.ink },
  body: { ...type.body, color: palette.body },
  note: { ...type.caption, color: palette.muted, marginTop: spacing.xs, lineHeight: 16 },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  ok: { ...type.cardTitle, color: palette.success, marginTop: spacing.md },
  failed: { ...type.cardTitle, color: palette.danger, marginTop: spacing.md },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  primaryButton: buttonLook.primary,
  testButton: { alignSelf: 'flex-start', marginTop: spacing.md },
  primaryButtonText: buttonLook.primaryText,
  secondaryButton: buttonLook.secondary,
  secondaryButtonText: buttonLook.secondaryText,
  disabled: { opacity: 0.5 },
});
