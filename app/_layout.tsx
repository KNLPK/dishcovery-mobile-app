import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { MD3LightTheme, PaperProvider } from 'react-native-paper';
import 'react-native-reanimated';

import ToastHost from '../components/ToastHost';
import { palette } from '../constants/theme';
import { loadSettings } from '../src/settings/settings';

/**
 * Paper's components in the brand teal instead of Material's default purple
 * (text field underlines and cursors, ripples, icon buttons).
 */
const paperTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: palette.primary,
    onSurfaceVariant: palette.muted,
    surfaceVariant: palette.accent,
  },
};

/**
 * The app has one, light, appearance (app.json: userInterfaceStyle "light"),
 * so the navigation theme is always the light one and the status bar always
 * has dark icons: on a phone in dark mode they used to turn white on the
 * app's white screens and disappear.
 */
export default function RootLayout() {
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Read the persisted serialization format and proxy override once, before the
  // first screen renders. Without this the first fetch of a session would use
  // the default instead of the user's saved choice.
  const [settingsReady, setSettingsReady] = useState(false);
  useEffect(() => {
    loadSettings().finally(() => setSettingsReady(true));
  }, []);

  if (!loaded || !settingsReady) {
    // Async font loading only occurs in development.
    return null;
  }

  return (
    <PaperProvider theme={paperTheme}>
      <ThemeProvider value={DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="HomePage" />
          <Stack.Screen name="SignUp" />
        </Stack>
        <ToastHost />
        <StatusBar style="dark" />
      </ThemeProvider>
    </PaperProvider>
  );
}
