/**
 * components/RecipeImage.tsx
 *
 * A recipe's photo, or a plain placeholder when there is none to show.
 *
 * The Gemini-generated recipes the online server browses have no photos: their
 * `image` field is a reference such as generated://dishcovery/9000001.jpg, not
 * a web address, and the payload bytes must stay as they are. Anything that is
 * not an http(s) URL, and any photo that fails to load, gets the placeholder
 * instead of a broken image.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Image, StyleSheet, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';

import { palette } from '../constants/theme';

export function hasPhoto(uri: string | null | undefined): uri is string {
  return typeof uri === 'string' && /^https?:\/\//i.test(uri);
}

export default function RecipeImage({
  uri,
  style,
  iconSize = 28,
}: {
  uri: string | null | undefined;
  style: StyleProp<ImageStyle>;
  iconSize?: number;
}) {
  const [failed, setFailed] = useState(false);
  if (hasPhoto(uri) && !failed) {
    return <Image source={{ uri }} style={style} resizeMode="cover" onError={() => setFailed(true)} />;
  }
  return (
    <View style={[style as StyleProp<ViewStyle>, styles.placeholder]} accessibilityLabel="No photo">
      <MaterialCommunityIcons name="silverware-fork-knife" size={iconSize} color={palette.muted} />
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: palette.surfaceCool,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
