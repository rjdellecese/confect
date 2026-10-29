import * as Effect from "effect/Effect";

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
  const suffix = Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  )
    .join("")
    .slice(0, 24);
  return `confect-${kind}-${suffix}`;
});
