/**
 * src/bench/environment.ts
 *
 * What the numbers are numbers about. Without this block the run is not
 * citable: a decode time means nothing without the device, the engine and the
 * decoder versions that produced it.
 *
 * Everything here is read from the RUNNING BINARY, not from package.json,
 * because under Expo Go the Hermes doing the work is the one compiled into the
 * Expo Go app rather than the one implied by the dependency tree. The declared
 * versions are captured too, and the two are reported side by side.
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { describeHeapInstrumentation } from '../api/measure';

export interface RunEnvironment {
  /** 'release' when __DEV__ is false — the only builds whose timings are usable. */
  buildType: 'debug' | 'release';
  /** How the bundle is being hosted: Expo Go, a dev client, or a standalone app. */
  executionEnvironment: string;
  /**
   * True for a standalone binary, where Hermes bytecode is precompiled. Under
   * Expo Go it is false: the bundle is compiled lazily at runtime, which
   * affects decode timings and must be stated in the methodology.
   */
  standalone: boolean;

  device: {
    brand: string | null;
    model: string | null;
    /** Android release string, e.g. "14". */
    osRelease: string | null;
    /** Android API level. */
    apiLevel: string | number;
    os: string;
  };

  runtime: {
    isHermes: boolean;
    reactNativeVersion: string | null;
    /** Hermes' own release string from getRuntimeProperties(). */
    hermesVersion: string | null;
    /** Every property Hermes reports, verbatim. */
    hermesProperties: Record<string, unknown> | null;
    expoSdkVersion: string | null;
    heapStatKey: string | null;
  };

  /** Resolved decoder versions, read from the packages themselves. */
  libraries: {
    protobufjs: string | null;
    msgpack: string | null;
    /** Declared in package.json — pinned exactly, so these should agree. */
    declared: Record<string, string> | null;
  };

  dataset: {
    total: number;
    thresholds: unknown;
    bySource: unknown;
  } | null;
}

/** Read a package's own version without exploding if its exports map blocks it. */
function packageVersion(loader: () => { version?: string }): string | null {
  try {
    return loader().version ?? null;
  } catch {
    return null;
  }
}

function androidConstants(): Record<string, unknown> {
  return (Platform.constants ?? {}) as Record<string, unknown>;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function captureEnvironment(dataset: RunEnvironment['dataset']): RunEnvironment {
  const constants = androidConstants();
  const instrumentation = describeHeapInstrumentation();
  const properties = instrumentation.runtimeProperties;

  const rnv = constants.reactNativeVersion as
    | Record<string, number | string | null>
    | undefined;
  const reactNativeVersion =
    rnv === undefined
      ? null
      : `${rnv.major}.${rnv.minor}.${rnv.patch}${rnv.prerelease ? `-${rnv.prerelease}` : ''}`;

  let hermesVersion: string | null = null;
  if (properties !== null) {
    for (const key of ['OSS Release Version', 'Release Version', 'Version']) {
      const value = properties[key];
      if (typeof value === 'string' || typeof value === 'number') {
        hermesVersion = String(value);
        break;
      }
    }
  }

  const executionEnvironment = String(Constants.executionEnvironment ?? 'unknown');

  let declared: Record<string, string> | null = null;
  try {
    declared = require('../../package.json').dependencies as Record<string, string>;
  } catch {
    declared = null;
  }

  return {
    buildType: __DEV__ ? 'debug' : 'release',
    executionEnvironment,
    standalone: executionEnvironment === 'standalone',

    device: {
      brand: stringOrNull(constants.Brand),
      model: stringOrNull(constants.Model),
      osRelease: stringOrNull(constants.Release),
      apiLevel: Platform.Version,
      os: Platform.OS,
    },

    runtime: {
      isHermes: typeof (globalThis as { HermesInternal?: unknown }).HermesInternal === 'object',
      reactNativeVersion,
      hermesVersion,
      hermesProperties: properties,
      expoSdkVersion: Constants.expoConfig?.sdkVersion ?? null,
      heapStatKey: instrumentation.selectedKey,
    },

    libraries: {
      protobufjs: packageVersion(() => require('protobufjs/package.json')),
      msgpack: packageVersion(() => require('@msgpack/msgpack/package.json')),
      declared,
    },

    dataset,
  };
}

/** One-line summary for the runner's header row and the screen. */
export function describeEnvironment(env: RunEnvironment): string {
  return (
    `${env.device.brand ?? '?'} ${env.device.model ?? '?'} · Android ${env.device.osRelease ?? '?'} · ` +
    `${env.buildType}/${env.executionEnvironment} · RN ${env.runtime.reactNativeVersion ?? '?'} · ` +
    `Hermes ${env.runtime.hermesVersion ?? '?'} · pbjs ${env.libraries.protobufjs ?? '?'} · ` +
    `msgpack ${env.libraries.msgpack ?? '?'}`
  );
}
