/**
 * src/api/codecs/json.ts
 *
 * The JSON codec — the study's baseline format.
 *
 * Behavioural note: this reproduces exactly what axios did on the production
 * path before the migration (decode the UTF-8 body, then JSON.parse it). The
 * only difference is that the byte->string step is now explicit and inside the
 * measured region, where it belongs: converting the octets on the wire into a
 * reconstructed object IS this format's deserialization work.
 */

import type { Codec } from './types';

/**
 * Constructed once at module load, deliberately.
 *
 * Building a TextDecoder is per-process setup, not per-payload work. Charging
 * it to every decode would inflate JSON's measurement relative to msgpack and
 * protobuf, which read the byte buffer directly and have no equivalent
 * per-call construction cost.
 *
 * Provided as a global by Expo SDK 53's "winter" runtime
 * (node_modules/expo/src/winter/runtime.native.ts), UTF-8 only.
 */
const utf8Decoder: TextDecoder = createUtf8Decoder();

function createUtf8Decoder(): TextDecoder {
  if (typeof TextDecoder === 'undefined') {
    throw new Error(
      'TextDecoder is not available in this runtime. The JSON codec needs it to ' +
        'convert the response body into text. On React Native it is installed by ' +
        'the Expo winter runtime; verify the expo package is loaded before this module.'
    );
  }
  return new TextDecoder('utf-8');
}

export const jsonCodec: Codec = {
  name: 'json',
  implemented: true,
  decode(bytes: ArrayBuffer): unknown {
    return JSON.parse(utf8Decoder.decode(bytes));
  },
};
