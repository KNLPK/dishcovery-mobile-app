import { Redirect } from 'expo-router';
import React from 'react';

import { getSettings } from '../src/settings/settings';

/**
 * The app has no accounts, so there is no login. The first launch shows the
 * welcome cards and an optional name (app/welcome.tsx); every launch after
 * that opens Home.
 */
export default function Index() {
  return <Redirect href={getSettings().welcomeSeen ? '/HomePage' : '/welcome'} />;
}
