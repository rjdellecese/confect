import type {
  MutationAuth as ConvexMutationAuth,
  SignJwtOptions,
} from "convex/server";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

/**
 * Convex's signing claims and options accepted by `signJwt`.
 *
 * @category Models
 */
export type { SignJwtClaims, SignJwtOptions } from "convex/server";

const make = (auth: Pick<ConvexMutationAuth, "signJwt">) => ({
  /**
   * Sign a JWT with the deployment's signing key when the Effect runs.
   *
   * @category Authentication
   *
   * @param options - Native Convex claims and signing options.
   *
   * @returns An Effect producing the signed token. Native rejection is a
   *   defect, not a modeled typed failure. Available only in a mutation
   *   context.
   */
  signJwt: Effect.fn("MutationAuth.signJwt")((options: SignJwtOptions) =>
    Effect.promise(() => auth.signJwt(options)),
  ),
});

/**
 * Mutation-only JWT signing service. Acquire the application's generated
 * `MutationAuth` tag in a mutation or mutation-only middleware.
 *
 * @category Services
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
