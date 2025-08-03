import type { Auth } from "convex/server";
import { Effect, flow, Layer, Option, Schema } from "effect";

const make = (auth: Auth) => ({
  getUserIdentity:
    // TODO: Which errors might occur?
    Effect.promise(() => auth.getUserIdentity()).pipe(
      Effect.andThen(
        flow(
          Option.fromNullable,
          Option.match({
            onNone: () => Effect.fail(new NoUserIdentityFoundError()),
            onSome: Effect.succeed,
          }),
        ),
      ),
    ),
});

export class ConfectAuth extends Effect.Tag("@rjdellecese/confect/ConfectAuth")<
  ConfectAuth,
  ReturnType<typeof make>
>() {
  static readonly layer = (auth: Auth) => Layer.succeed(this, make(auth));
}

export class NoUserIdentityFoundError extends Schema.TaggedError<NoUserIdentityFoundError>(
  "NoUserIdentityFoundError",
)("NoUserIdentityFoundError", {}) {
  override get message(): string {
    return "No user identity found";
  }
}
