import { effect as effect_ } from "@effect/vitest";
import { Effect, type TestServices } from "effect";

import * as TestConvexService from "./TestConvexService";

type Name<A, E> = Parameters<typeof effect_<E, A>>[0];
type Self<A, E> = (
  ctx: Parameters<Parameters<typeof effect_<E, A>>[1]>[0],
) => Effect.Effect<
  E,
  A,
  TestServices.TestServices | TestConvexService.TestConvexService
>;
type Timeout<A, E> = Parameters<typeof effect_<E, A>>[2];

export const effect = <A, E>(
  name: Name<A, E>,
  self: Self<A, E>,
  timeout: Timeout<A, E> = undefined,
) => {
  type Ctx = Parameters<Self<A, E>>[0];
  type Eff = ReturnType<Self<A, E>>;

  const self_ = (
    ctx_: Ctx,
  ): Effect.Effect<
    Effect.Effect.Success<Eff>,
    Effect.Effect.Error<Eff>,
    TestServices.TestServices
  > => self(ctx_).pipe(Effect.provide(TestConvexService.layer));

  effect_(name, self_, timeout);
};
