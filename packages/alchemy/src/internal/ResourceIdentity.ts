import * as Effect from "effect/Effect";
import * as Arr from "effect/Array";
import * as Str from "effect/String";
import { pipe } from "effect/Function";

export const resourceName = Effect.fn("ResourceIdentity.name")(function* (
  kind: string,
  fqn: string,
  instanceId: string,
) {
  const hash = yield* Effect.promise(() =>
    crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${fqn}:${instanceId}`),
    ),
  );
  const suffix = pipe(
    Arr.fromIterable(new Uint8Array(hash)),
    Arr.map((byte) => pipe(byte.toString(16), Str.padStart(2, "0"))),
    Arr.join(""),
    Str.slice(0, 24),
  );
  return `confect-${kind}-${suffix}`;
});
