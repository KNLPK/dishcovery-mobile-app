/**
 * src/api/codecs/protobuf.ts
 *
 * Protocol Buffers codec.
 *
 * The schema is NOT written here. It comes from ./generated/recipe, which is
 * produced by `npm run proto:generate` from shared/proto/recipe.proto — the
 * exact same file the proxy loads to encode. There is no hand-written schema in
 * this repository; the Stage-1 inline redeclaration has been deleted.
 *
 * `--target static-module` was chosen deliberately: static classes decode
 * without reflection. The reflection path (Root.fromJSON + reflected decode) is
 * materially slower, and since deserialization time is a dependent variable of
 * the study, using it would understate protobuf's performance.
 */

// Explicit .js extension: TypeScript resolves it to generated/recipe.d.ts,
// Metro resolves the real file, and Node (used by the equivalence check) can
// resolve it too. An extensionless specifier would break under Node's resolver.
import { Recipe as RecipeMessage } from './generated/recipe.js';

import type { Codec } from './types';

export const protobufCodec: Codec = {
  name: 'protobuf',
  implemented: true,
  decode(bytes: ArrayBuffer): unknown {
    // protobufjs' generated decode() takes a Uint8Array or a Reader. Wrapping
    // the ArrayBuffer in a view is O(1) and copies nothing; it is disclosed in
    // the equal-terms table as protobuf's only extra step.
    return RecipeMessage.decode(new Uint8Array(bytes));
  },

  /**
   * Scaffolding only — never called on a measured path.
   *
   * proto3 omits default-valued scalars from the wire entirely: an empty string
   * or a zero is simply not transmitted. That is part of why protobuf payloads
   * are smaller, and it loses no logical content, because the decoded Message
   * still reports the default on access (msg.name returns "").
   *
   * A plain JSON.stringify round trip would call Message#toJSON, which drops
   * those defaults and would make a structural comparison report fields as
   * missing when they are simply defaulted. toObject with `defaults: true`
   * materialises them, giving a genuine like-for-like object.
   */
  toPlainObject(decoded: unknown): unknown {
    return RecipeMessage.toObject(decoded as RecipeMessage, {
      defaults: true,
      arrays: true,
      objects: true,
      longs: Number,
    });
  },
};
