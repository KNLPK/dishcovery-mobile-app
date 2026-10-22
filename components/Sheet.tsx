/**
 * components/Sheet.tsx
 *
 * A bottom sheet for short explanations (the Σ sheet under the format bar,
 * "How to read this" on Results). A plain React Native Modal: its slide is the
 * platform's own, not a JS animation, and tapping outside or Back closes it.
 * Long content scrolls inside the sheet.
 */

import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette, radius, spacing, type } from '../constants/theme';

export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.layer}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg, maxHeight: '85%' }]} accessibilityViewIsModal>
          <View style={styles.grabber} />
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** A term and its explanation, one paragraph. */
export function SheetLine({ term, children }: { term?: string; children: React.ReactNode }) {
  return (
    <Text style={styles.line}>
      {term !== undefined && <Text style={styles.term}>{term}: </Text>}
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  layer: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11, 43, 51, 0.4)' },
  sheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: palette.border, marginBottom: spacing.md },
  title: { ...type.section, color: palette.ink, marginBottom: spacing.sm },
  body: { gap: spacing.sm },
  line: { ...type.body, color: palette.body },
  term: { fontWeight: '700', color: palette.ink },
});
