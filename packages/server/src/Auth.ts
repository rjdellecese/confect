import type { Auth as ConvexAuth } from "convex/server";
import * as Context from "effect/Context";
import { flow } from "effect/Function";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

const make = (auth: ConvexAuth) => ({
  /**
   * Effect that reads the caller's Convex identity. Yield
   * `auth.getUserIdentity` without calling it.
   *
   * **Gotchas**
   *
   * An unauthenticated invocation fails with {@link NoUserIdentityFoundError}
   * rather than returning `null`. An unexpected Convex failure is a defect.
   *
   * @category Authentication
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
 * Tag for the current invocation's authentication service. Yield the
 * application's generated `Auth` tag in a query, mutation, action, or HTTP
 * handler to access `getUserIdentity`.
 *
 * @category Tags
 */
export class Auth extends Context.Service<Auth, ReturnType<typeof make>>()(
  "@confect/server/Auth",
) {}

/**
 * @internal
 */
export const layer = (auth: ConvexAuth) => Layer.succeed(Auth, make(auth));

/**
 * Tagged failure of `getUserIdentity` when the caller is unauthenticated. Match
 * `NoUserIdentityFoundError` to handle a missing identity; the error carries no
 * additional payload.
 *
 * @category Errors
 */
export class NoUserIdentityFoundError extends Schema.TaggedError<
  NoUserIdentityFoundError,
  {}
>()("NoUserIdentityFoundError", {}) {
  /**
   * Returns a message describing the missing identity without exposing
   * authentication data.
   *
   * @category Getters
   */
  override get message(): string {
    return "No user identity found";
  }
}
