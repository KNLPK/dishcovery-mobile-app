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
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { palette, radius, spacing, touchTarget, type } from '../constants/theme';
import BrandLoader from './BrandLoader';
import { Skeleton } from './motion';
import type { RequestFailure } from '../src/api/errors';
import type { ServerMode } from '../src/settings/settings';

/** Shown while the first health check is still waiting for the server. */
export const WAKING_LABEL = 'Connecting to the server…';

/** Waits shorter than this show skeletons; longer ones switch to the brand loader. */
export const LONG_WAIT_MS = 600;

/** True once `active` has stayed true for `ms`; false again as soon as it ends. */
export function useLongWait(active: boolean, ms: number = LONG_WAIT_MS): boolean {
  const [long, setLong] = useState(false);
  useEffect(() => {
    setLong(false);
    if (!active) return;
    const timer = setTimeout(() => setLong(true), ms);
    return () => clearTimeout(timer);
  }, [active, ms]);
  return active && long;
}

/** The brand loader over its label, 8 dp apart (the design's card and full-screen waits). */
export function LoadingState({ label, size = 48 }: { label: string; size?: 48 | 96 }) {
  return (
    <View style={styles.block}>
      <BrandLoader size={size} label={label} />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

/**
 * A list or card wait: skeletons shaped like the coming content first, and
 * the brand loader (48) once the wait passes LONG_WAIT_MS, so a slow request
 * reads as working rather than as a frozen layout.
 */
export function WaitState({
  variant,
  count,
  label,
}: {
  variant: 'list' | 'cards';
  count?: number;
  label: string;
}) {
  const long = useLongWait(true);
  return long ? <LoadingState label={label} /> : <Skeleton variant={variant} count={count} label={label} />;
}

/**
 * The first connection to the server, once it takes longer than a few seconds
 * (serverStatus.ts calls onWaking): the whole screen, with the 96 loader, so it
 * is clear the app is waiting on the server and not stuck. The tab bar, drawn
 * after it, stays usable.
 */
export function ConnectingState() {
  return (
    <View style={styles.connecting} accessibilityLiveRegion="polite">
      <LoadingState size={96} label={WAKING_LABEL} />
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
  connecting: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
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
