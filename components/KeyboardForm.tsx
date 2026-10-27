/**
 * components/KeyboardForm.tsx
 *
 * Forms that stay usable with the keyboard open.
 *
 * Android 15 draws apps edge to edge, and then the system no longer resizes
 * the window for the keyboard: it simply covers the lower half of the screen.
 * KeyboardForm makes room itself (KeyboardAvoidingView, on Android as well as
 * iOS) and, once the keyboard is up, scrolls the focused FormField into view.
 * Tapping outside a field, or dragging the form, closes the keyboard.
 *
 * FormField is the app's one text input: no Android underline, the brand teal
 * for the cursor, selection and a focus ring, so the field being typed into is
 * obvious. It forwards its ref, so "Next" on one field can focus the next.
 */

import React, { createContext, forwardRef, useContext, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type TextInput as NativeTextInput,
  type ViewStyle,
} from 'react-native';
import { TextInput, type TextInputProps } from 'react-native-paper';

import { palette, radius } from '../constants/theme';

/** Space left above a focused field: enough to keep its label in view. */
const ABOVE_FIELD = 56;

type FieldBox = React.RefObject<View | null>;
const FormContext = createContext<{ focus: (box: FieldBox) => void } | null>(null);

export function KeyboardForm({
  children,
  style,
  contentContainerStyle,
  ...scrollProps
}: ScrollViewProps & { children: React.ReactNode }) {
  const scroll = useRef<ScrollView>(null);
  const content = useRef<View>(null);
  const focused = useRef<FieldBox | null>(null);
  const keyboardUp = useRef(false);

  const reveal = () => {
    const box = focused.current?.current;
    if (box == null || content.current === null) return;
    box.measureLayout(content.current, (_x, y) => {
      scroll.current?.scrollTo({ y: Math.max(0, y - ABOVE_FIELD), animated: true });
    });
  };

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => {
      keyboardUp.current = true;
      reveal();
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardUp.current = false;
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const focus = (box: FieldBox) => {
    focused.current = box;
    // Moving between fields with the keyboard already up: no keyboardDidShow.
    if (keyboardUp.current) reveal();
  };

  return (
    <KeyboardAvoidingView style={[styles.flex, style]} behavior="padding">
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={contentContainerStyle}
        {...scrollProps}
      >
        <FormContext.Provider value={{ focus }}>
          <View ref={content} collapsable={false} style={styles.grow}>
            {children}
          </View>
        </FormContext.Provider>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

type FormFieldProps = Omit<TextInputProps, 'mode' | 'style'> & {
  /** Style of the rounded field (background, margins, flex). */
  style?: StyleProp<ViewStyle>;
  /** Shown inside the field on the right, e.g. a show-password button. */
  trailing?: React.ReactNode;
  /**
   * tinted    light teal field (forms)
   * outlined  white with a hairline, and only the focus ring when focused
   *           (onboarding, Cook)
   */
  look?: 'tinted' | 'outlined';
};

/** What a FormField's ref exposes: enough for "Next" to move the focus. */
export type FormFieldHandle = { focus: () => void };

export const FormField = forwardRef<FormFieldHandle, FormFieldProps>(function FormField(
  { style, trailing, look = 'tinted', onFocus, onBlur, ...inputProps },
  ref
) {
  const form = useContext(FormContext);
  const box = useRef<View>(null);
  // Paper's TextInput takes a ref typed as both its own handle and React Native's.
  const input = useRef<React.ComponentRef<typeof TextInput> & NativeTextInput>(null);
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }), []);
  const [focused, setFocused] = useState(false);
  return (
    <View
      ref={box}
      collapsable={false}
      style={[
        styles.field,
        look === 'outlined' && styles.outlined,
        style,
        focused && (look === 'outlined' ? styles.outlinedFocused : styles.fieldFocused),
      ]}
    >
      <TextInput
        ref={input}
        mode="flat"
        dense
        style={styles.input}
        underlineColor="transparent"
        activeUnderlineColor="transparent"
        underlineColorAndroid="transparent"
        cursorColor={palette.primary}
        selectionColor="rgba(32, 81, 90, 0.3)"
        selectionHandleColor={palette.primary}
        placeholderTextColor={palette.muted}
        textColor={palette.ink}
        onFocus={(e) => {
          setFocused(true);
          form?.focus(box);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...inputProps}
      />
      {trailing}
    </View>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    backgroundColor: palette.accent,
    borderRadius: radius.lg + 4,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  fieldFocused: { borderColor: palette.primary, backgroundColor: '#c4ebee' },
  // Text 16 dp in from the edge; the border grows by half a unit when focused
  // and the padding shrinks by as much, so the text stays still.
  outlined: { backgroundColor: palette.surface, borderRadius: radius.md, borderWidth: 1.5, borderColor: palette.border, paddingHorizontal: 8.5 },
  outlinedFocused: { borderWidth: 2, borderColor: palette.primary, paddingHorizontal: 8 },
  input: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingHorizontal: 6,
    fontSize: 15,
  },
});
