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

import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { palette, radius, spacing, type } from '../constants/theme';
import type { RequestFailure } from '../src/api/errors';

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

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={styles.block}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {detail !== undefined && <Text style={styles.emptyDetail}>{detail}</Text>}
    </View>
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: palette.primary,
  },
  retryText: {
    ...type.label,
    color: palette.surface,
  },
});
