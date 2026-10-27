// app.json holds the config. This file only changes it for the `demo` EAS
// profile (eas.json sets APP_VARIANT=demo there and nowhere else), so the demo
// installs next to the measurement build: its own Android package and name,
// and the draft brand artwork (docs/BRAND.md). Without APP_VARIANT the config
// is app.json unchanged.
const { execSync } = require('child_process');

const BRAND = './assets/brand';
const BRAND_TEAL = '#20515a';

// The commit the build was made from, for the About screen. EAS sets
// EAS_BUILD_GIT_COMMIT_HASH on its build machines; locally it is read from git.
function buildCommit() {
  if (process.env.EAS_BUILD_GIT_COMMIT_HASH) return process.env.EAS_BUILD_GIT_COMMIT_HASH;
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
}

module.exports = ({ config }) => {
  if (process.env.APP_VARIANT !== 'demo') return config;
  return {
    ...config,
    name: 'Dishcovery Demo',
    icon: `${BRAND}/icon.png`,
    android: {
      ...config.android,
      package: `${config.android.package}.demo`,
      adaptiveIcon: {
        foregroundImage: `${BRAND}/adaptive-foreground.png`,
        monochromeImage: `${BRAND}/monochrome.png`,
        backgroundColor: BRAND_TEAL,
      },
    },
    plugins: config.plugins.map((plugin) =>
      Array.isArray(plugin) && plugin[0] === 'expo-splash-screen'
        ? [
            'expo-splash-screen',
            {
              image: `${BRAND}/splash-icon.png`,
              imageWidth: 200,
              resizeMode: 'contain',
              backgroundColor: BRAND_TEAL,
            },
          ]
        : plugin
    ),
    // brandIntro: the native splash above is the launch intro's first frame,
    // so components/LaunchIntro.tsx plays on from it.
    extra: { ...config.extra, buildCommit: buildCommit(), brandIntro: true },
  };
};
