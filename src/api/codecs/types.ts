/**
 * src/api/codecs/types.ts
 *
 * The codec seam. Every decode in the repository — production screen or
 * benchmark run — goes through a Codec from the registry below, so the code
 * measured by the benchmark is the same code the app runs.
 */

import type { SerializationFormat } from '../../../shared/contract';
import { SERIALIZATION_FORMATS } from '../../../shared/contract';
import { jsonCodec } from './json';
import { msgpackCodec } from './msgpack';
import { protobufCodec } from './protobuf';

export interface Codec {
  name: SerializationFormat;
  /**
   * Decode a response body into its reconstructed object.
   *
   * Implementations must do decoding work and nothing else — no fetching, no
   * measurement, no logging, no validation beyond what decoding requires.
   * Anything extra would be charged to this format's deserialization time.
   */
  decode(bytes: ArrayBuffer): unknown;
  /**
   * True for placeholder codecs awaiting implementation. Lets callers check
   * availability without invoking decode() for its side effects.
   */
  readonly implemented: boolean;
  /**
   * OPTIONAL, and never called on a measured path.
   *
   * Converts whatever decode() returned into a plain JSON-comparable object,
   * for test scaffolding such as the cross-format equivalence check. A codec
   * that already returns plain objects does not implement this.
   *
   * This exists so knowledge of a codec's output representation stays with the
   * codec instead of leaking into every consumer.
   */
  toPlainObject?(decoded: unknown): unknown;
}

export type CodecRegistry = Record<SerializationFormat, Codec>;

/**
 * Thrown by a format that has no implementation yet, so an unimplemented format
 * fails loudly and identifiably instead of silently returning nothing.
 */
export class NotImplementedCodecError extends Error {
  readonly format: SerializationFormat;

  constructor(format: SerializationFormat, stage: string) {
    super(
      `Codec '${format}' is not implemented yet — it arrives in ${stage}. ` +
        `Implemented formats: ${implementedFormats().join(', ')}.`
    );
    this.name = 'NotImplementedCodecError';
    this.format = format;
  }
}

function notImplementedCodec(format: SerializationFormat, stage: string): Codec {
  return {
    name: format,
    implemented: false,
    decode(): never {
      throw new NotImplementedCodecError(format, stage);
    },
  };
}

/**
 * The registry. Exactly one entry per SerializationFormat — the Record type
 * makes a missing format a compile error rather than a runtime surprise.
 */
export const CODECS: CodecRegistry = {
  json: jsonCodec,
  msgpack: msgpackCodec,
  protobuf: protobufCodec,
};

export function getCodec(format: SerializationFormat): Codec {
  return CODECS[format];
}

/** Formats that currently have a working decoder. */
export function implementedFormats(): SerializationFormat[] {
  return SERIALIZATION_FORMATS.filter((format) => CODECS[format].implemented);
}
