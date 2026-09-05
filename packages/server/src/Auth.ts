import type { Auth as ConvexAuth } from "convex/server";
import * as Context from "effect/Context";
import { flow } from "effect/Function";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type * as DatabaseSchema from "./DatabaseSchema";

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

export type ForTarget<Target extends DatabaseSchema.Target> =
  Target["kind"] extends "component" ? never : Auth;

export const layerForTarget = <Target extends DatabaseSchema.Target>(
  target: Target,
  auth: ConvexAuth,
): Layer.Layer<ForTarget<Target>> =>
  (target.kind === "component" ? Layer.empty : layer(auth)) as Layer.Layer<
    ForTarget<Target>
  >;

export class NoUserIdentityFoundError extends Schema.TaggedError<NoUserIdentityFoundError>()(
  "NoUserIdentityFoundError",
  {},
) {
  override get message(): string {
    return "No user identity found";
  }
}
