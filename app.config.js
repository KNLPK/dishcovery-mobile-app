// app.json holds the config. This file only changes it for the `demo` EAS
// profile (eas.json sets APP_VARIANT=demo there and nowhere else), so the demo
// installs next to the measurement build: its own Android package and name.
// Without APP_VARIANT the config is app.json unchanged.
module.exports = ({ config }) => {
  if (process.env.APP_VARIANT !== 'demo') return config;
  return {
    ...config,
    name: 'Dishcovery Demo',
    android: { ...config.android, package: `${config.android.package}.demo` },
  };
};
