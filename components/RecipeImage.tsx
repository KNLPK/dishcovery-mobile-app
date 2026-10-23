/**
 * components/RecipeImage.tsx
 *
 * A recipe's photo, or a bundled illustrative photo when there is none.
 *
 * The Gemini-generated recipes the online server browses have no photos: their
 * `image` field is a reference such as generated://dishcovery/9000001.jpg, not
 * a web address, and the payload bytes must stay as they are. Anything that is
 * not an http(s) URL, and any photo that fails to load, gets one of the
 * bundled food photos instead, picked from the recipe title and id
 * (constants/illustrativePhotos.ts). Detail screens label it "Illustrative
 * photo"; hasPhoto() tells them when to.
 */

import React, { useState } from 'react';
import { Image, type ImageStyle, type StyleProp } from 'react-native';

import { illustrativePhoto } from '../constants/illustrativePhotos';

export function hasPhoto(uri: string | null | undefined): uri is string {
  return typeof uri === 'string' && /^https?:\/\//i.test(uri);
}

export default function RecipeImage({
  uri,
  id,
  title,
  style,
}: {
  uri: string | null | undefined;
  /** With the title, picks the illustrative photo when there is no real one. */
  id: number | string | null | undefined;
  title: string | null | undefined;
  style: StyleProp<ImageStyle>;
}) {
  const [failed, setFailed] = useState(false);
  if (hasPhoto(uri) && !failed) {
    return <Image source={{ uri }} style={style} resizeMode="cover" onError={() => setFailed(true)} />;
  }
  return (
    <Image
      source={illustrativePhoto(title, id)}
      style={style}
      resizeMode="cover"
      accessibilityLabel="Illustrative photo"
    />
  );
}
