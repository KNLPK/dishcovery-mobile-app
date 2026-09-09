/**
 * src/api/codecs/msgpack.ts
 *
 * MessagePack codec, backed by @msgpack/msgpack — the same library the proxy
 * uses to encode, so encode and decode cannot drift apart.
 *
 * MessagePack is self-describing: the wire format carries field names, so
 * decoding yields a plain object whose keys are already the canonical camelCase
 * names. No renaming and no post-processing happen inside the measured window.
 */

import { decode as decodeMsgPack } from '@msgpack/msgpack';

import type { Codec } from './types';

export const msgpackCodec: Codec = {
  name: 'msgpack',
  implemented: true,
  decode(bytes: ArrayBuffer): unknown {
    // decode() accepts an ArrayBuffer directly — no view wrapping needed.
    return decodeMsgPack(bytes);
  },
};
