import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/useColorScheme';
import { loadSettings } from '../src/settings/settings';

export default function RootLayout() {
  const colorScheme = useColorScheme();
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
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="HomePage" />
        <Stack.Screen name="SignUp" />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
