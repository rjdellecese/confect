import type { Auth as ConvexAuth } from "convex/server";
import { Context, Effect, flow, Layer, Option, Schema } from "effect";

const make = (auth: ConvexAuth) => ({
  getUserIdentity: Effect.promise(() => auth.getUserIdentity()).pipe(
    Effect.andThen(
      flow(
        Option.fromNullishOr,
        Option.match({
          onNone: () => Effect.fail(new NoUserIdentityFoundError()),
          onSome: Effect.succeed,
        }),
      ),
    ),
  ),
});

export class Auth extends Context.Service<Auth, ReturnType<typeof make>>()(
  "@confect/server/Auth",
) {}

export const layer = (auth: ConvexAuth) => Layer.succeed(Auth, make(auth));

export class NoUserIdentityFoundError extends Schema.TaggedErrorClass<NoUserIdentityFoundError>()(
  "NoUserIdentityFoundError",
  {},
) {
  get message(): string {
    return "No user identity found";
  }
}
