import type { Auth } from "convex/server";
import { Effect, Layer, Option } from "effect";

const make = (auth: Auth) => ({
  getUserIdentity:
    // TODO: Which errors might occur?
    Effect.promise(() => auth.getUserIdentity()).pipe(
      Effect.map(Option.fromNullable),
    ),
});

// @effect-diagnostics-next-line leakingRequirements:off
export class ConfectAuth extends Effect.Tag("@rjdellecese/confect/ConfectAuth")<
  ConfectAuth,
  ReturnType<typeof make>
>() {
  static readonly layer = (auth: Auth) => Layer.succeed(this, make(auth));
}
