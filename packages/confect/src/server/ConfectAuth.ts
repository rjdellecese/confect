import type { Auth } from "convex/server";
import { Effect, flow, Layer, Option, Schema } from "effect";

const make = (auth: Auth) => ({
  getUserIdentity: Effect.promise(() => auth.getUserIdentity()).pipe(
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

export class ConfectAuth extends Effect.Tag(
  "@rjdellecese/confect/server/ConfectAuth",
)<ConfectAuth, ReturnType<typeof make>>() {}

export const layer = (auth: Auth) => Layer.succeed(ConfectAuth, make(auth));

export class NoUserIdentityFoundError extends Schema.TaggedError<NoUserIdentityFoundError>(
  "NoUserIdentityFoundError",
)("NoUserIdentityFoundError", {}) {
  override get message(): string {
    return "No user identity found";
  }
}
