import type {
  MutationAuth as ConvexMutationAuth,
  SignJwtOptions,
} from "convex/server";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import type * as DatabaseSchema from "./DatabaseSchema";

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

export type ForTarget<Target extends DatabaseSchema.Target> =
  Target["kind"] extends "component" ? never : MutationAuth;

export const layerForTarget = <Target extends DatabaseSchema.Target>(
  target: Target,
  auth: Pick<ConvexMutationAuth, "signJwt">,
): Layer.Layer<ForTarget<Target>> =>
  Match.value(target.kind).pipe(
    Match.when("app", () => layer(auth)),
    Match.when("component", () => Layer.empty),
    Match.exhaustive,
  ) as Layer.Layer<ForTarget<Target>>;
