/**
 * plugins/withCleartextTraffic.js
 *
 * Lets a release Android build talk plain HTTP to dishcovery-proxy on the LAN.
 *
 * Expo's Android template sets android:usesCleartextTraffic="true" only in the
 * DEBUG manifest (app/src/debug/AndroidManifest.xml). A release APK targets an
 * API level where cleartext is refused by default, so every fetch to
 * http://<laptop-ip>:3001 would fail before the benchmark could fetch a payload.
 * Expo Go allows cleartext, so this also keeps the transport the same as in the
 * profiles taken there: no TLS in either environment.
 *
 * Network time is never inside a measured decode (payloads are fetched first and
 * decoded from memory); this affects whether the fetch works, not the timings.
 *
 * Uses expo/config-plugins, which ships with expo, so no dependency is added.
 */

const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

module.exports = function withCleartextTraffic(config) {
  return withAndroidManifest(config, (cfg) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    application.$['android:usesCleartextTraffic'] = 'true';
    return cfg;
  });
};
