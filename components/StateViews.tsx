/**
 * components/StateViews.tsx
 *
 * The three states every fetching screen has to render, in one place so they
 * look and behave the same everywhere: loading, error, and empty.
 *
 * The screens previously rendered a bare ActivityIndicator for loading and a
 * red one-liner for errors, with no empty state at all — a search that
 * legitimately matched nothing looked identical to a search that had not run.
 */

import { useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { palette, radius, spacing, touchTarget, type } from '../constants/theme';
import type { RequestFailure } from '../src/api/errors';
import type { ServerMode } from '../src/settings/settings';

/** Shown while the first health check is still waiting for the server. */
export const WAKING_LABEL = 'Connecting to the server…';

export function LoadingState({ label }: { label: string }) {
  return (
    <View style={styles.block} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={palette.primary} />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

/**
 * An error the user can act on: what failed, at which address, and the one
 * thing most likely to fix it. Retry is offered when the caller can retry.
 */
export function ErrorState({
  failure,
  onRetry,
}: {
  failure: RequestFailure;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.errorBlock} accessibilityRole="alert">
      <Text style={styles.errorTitle}>{failure.title}</Text>
      <Text style={styles.errorDetail}>{failure.detail}</Text>
      {failure.hint !== null && <Text style={styles.errorHint}>{failure.hint}</Text>}
      {onRetry !== undefined && (
        <Pressable onPress={onRetry} style={styles.retry} accessibilityRole="button">
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      )}
    </View>
  );
}

export interface StateAction {
  label: string;
  onPress: () => void;
}

export function EmptyState({
  title,
  detail,
  actions = [],
}: {
  title: string;
  detail?: string;
  actions?: StateAction[];
}) {
  return (
    <View style={styles.block}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {detail !== undefined && <Text style={styles.emptyDetail}>{detail}</Text>}
      {actions.length > 0 && (
        <View style={styles.actions}>
          {actions.map((a, i) => (
            <Pressable
              key={a.label}
              onPress={a.onPress}
              style={i === 0 ? styles.retry : styles.secondaryAction}
              accessibilityRole="button"
            >
              <Text style={i === 0 ? styles.retryText : styles.secondaryActionText}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * Browsing needs a server; this says so when there is none (offline mode, or
 * online mode in a build without an online URL) and points to what still works.
 */
export function NoServerState({ mode }: { mode: ServerMode }) {
  const router = useRouter();
  return (
    <EmptyState
      title={mode === 'offline' ? 'Browsing needs a server' : 'No online server in this build'}
      detail={
        mode === 'offline'
          ? 'The app is set to Offline. Recipes come from a server; the quick test and the paper results work without one.'
          : 'This build has no online server address yet. Choose Laptop in Server settings, or use the quick test, which works offline.'
      }
      actions={[
        { label: 'Server settings', onPress: () => router.push('/settings') },
        { label: 'Start quick test', onPress: () => router.push('/quick') },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  block: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  loadingText: {
    ...type.body,
    color: palette.muted,
  },
  emptyTitle: {
    ...type.cardTitle,
    color: palette.ink,
  },
  emptyDetail: {
    ...type.body,
    color: palette.muted,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  errorBlock: {
    backgroundColor: palette.dangerSurface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#f3c9c4',
    padding: spacing.lg,
    gap: spacing.xs,
  },
  errorTitle: {
    ...type.cardTitle,
    color: palette.danger,
  },
  errorDetail: {
    ...type.body,
    color: palette.body,
  },
  errorHint: {
    ...type.body,
    color: palette.muted,
    marginTop: spacing.xs,
  },
  retry: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    minHeight: touchTarget,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: palette.primary,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
  secondaryAction: {
    marginTop: spacing.sm,
    minHeight: touchTarget,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  secondaryActionText: {
    ...type.label,
    color: palette.primary,
  },
  retryText: {
    ...type.label,
    color: palette.surface,
  },
});
