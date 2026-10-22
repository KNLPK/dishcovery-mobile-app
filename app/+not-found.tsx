import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '../components/Buttons';
import { Screen, StackHeader } from '../components/Screen';
import { palette, spacing, type } from '../constants/theme';

export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <Screen background={palette.surfaceAlt}>
      <StackHeader title="Page not found" />
      <View style={styles.container}>
        <Text style={styles.body}>This page does not exist.</Text>
        <PrimaryButton label="Go to Home" onPress={() => router.replace('/HomePage')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
  },
  body: { ...type.body, color: palette.body },
});
