import type {
  MutationAuth as ConvexMutationAuth,
  SignJwtOptions,
} from "convex/server";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export type { SignJwtClaims, SignJwtOptions } from "convex/server";

const make = (auth: Pick<ConvexMutationAuth, "signJwt">) => ({
  signJwt: Effect.fn("MutationAuth.signJwt")((options: SignJwtOptions) =>
    Effect.promise(() => auth.signJwt(options)),
  ),
});

export class MutationAuth extends Context.Service<
  MutationAuth,
  ReturnType<typeof make>
>()("@confect/server/MutationAuth") {}

export const layer = (auth: Pick<ConvexMutationAuth, "signJwt">) =>
  Layer.succeed(MutationAuth, make(auth));
