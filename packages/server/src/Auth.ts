import type { Auth as ConvexAuth } from "convex/server";
import * as Context from "effect/Context";
import { flow } from "effect/Function";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

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
  override get message(): string {
    return "No user identity found";
  }
}
