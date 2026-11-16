import type { Auth as ConvexAuth } from "convex/server";
import * as Context from "effect/Context";
import { flow } from "effect/Function";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

const make = (auth: ConvexAuth) => ({
  /**
   * Read the invocation's authenticated Convex identity.
   *
   * This is an Effect property, not a function. It fails with
   * {@link NoUserIdentityFoundError} when no identity is present; unexpected
   * native failures are defects.
   */
  getUserIdentity: Effect.promise(() => auth.getUserIdentity()).pipe(
    Effect.andThen(
      flow(
        Option.fromNullishOr,
        Option.match({
          onNone: () => Effect.fail(NoUserIdentityFoundError.make()),
          onSome: Effect.succeed,
        }),
      ),
    ),
  ),
});

/**
 * Authentication service available in queries, mutations, actions and HTTP
 * handlers. Import the application's generated `Auth` tag and yield it to
 * obtain `getUserIdentity`; Confect supplies the invocation-local service.
 */
export class Auth extends Context.Service<Auth, ReturnType<typeof make>>()(
  "@confect/server/Auth",
) {}

/**
 * @internal
 */
export const layer = (auth: ConvexAuth) => Layer.succeed(Auth, make(auth));

/**
 * Typed failure of `Auth.getUserIdentity` when the invocation is
 * unauthenticated. Catch the `NoUserIdentityFoundError` tag; there is no
 * additional payload.
 */
export class NoUserIdentityFoundError extends Schema.TaggedError<
  NoUserIdentityFoundError,
  {}
>()("NoUserIdentityFoundError", {}) {
  /**
   * Describe the missing identity without exposing authentication data.
   */
  override get message(): string {
    return "No user identity found";
  }
}
