import type { Auth as ConvexAuth } from "convex/server";
import { flow } from "effect";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

const make = (auth: ConvexAuth) => ({
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

export class Auth extends Effect.Tag("@confect/server/Auth")<
  Auth,
  ReturnType<typeof make>
>() {}

export const layer = (auth: ConvexAuth) => Layer.succeed(Auth, make(auth));

export class NoUserIdentityFoundError extends Schema.TaggedError<NoUserIdentityFoundError>()(
  "NoUserIdentityFoundError",
  {},
) {
  override get message(): string {
    return "No user identity found";
  }
}
