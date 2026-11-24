import type {
  MutationAuth as ConvexMutationAuth,
  SignJwtOptions,
} from "convex/server";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import type * as DatabaseSchema from "./DatabaseSchema";

/**
 * Native Convex JWT claims and signing options accepted by `signJwt`.
 *
 * @category Models
 */
export type { SignJwtClaims, SignJwtOptions } from "convex/server";

const make = (auth: Pick<ConvexMutationAuth, "signJwt">) => ({
  /**
   * Signs a JWT with the deployment's signing key when the returned Effect
   * runs.
   *
   * @category Authentication
   *
   * @param options - Convex signing options, including the token claims.
   *
   * @returns An Effect producing the signed token. A Convex rejection is a
   *   defect.
   */
  signJwt: Effect.fn("MutationAuth.signJwt")((options: SignJwtOptions) =>
    Effect.promise(() => auth.signJwt(options)),
  ),
});

/**
 * Tag for the deployment's JWT signing service. Yield the generated
 * `MutationAuth` tag in an application mutation or its mutation-only middleware
 * to sign a token. Component mutations cannot sign JWTs.
 *
 * @category Tags
 */
export class MutationAuth extends Context.Service<
  MutationAuth,
  ReturnType<typeof make>
>()("@confect/server/MutationAuth") {}

/**
 * @internal
 */
export const layer = (auth: Pick<ConvexMutationAuth, "signJwt">) =>
  Layer.succeed(MutationAuth, make(auth));

/**
 * Selects the generated `MutationAuth` requirement for application mutations
 * only.
 *
 * @internal
 */
export type ForTarget<Target extends DatabaseSchema.Target> =
  Target["kind"] extends "app" ? MutationAuth : never;

/**
 * Provides the generated `MutationAuth` tag only for application mutations.
 *
 * @internal
 */
export const layerForTarget = <Target extends DatabaseSchema.Target>(
  target: Target,
  auth: Pick<ConvexMutationAuth, "signJwt">,
): Layer.Layer<ForTarget<Target>> =>
  Match.value(target.kind).pipe(
    Match.when("app", () => layer(auth)),
    Match.when("component", () => Layer.empty),
    Match.exhaustive,
  ) as Layer.Layer<ForTarget<Target>>;
