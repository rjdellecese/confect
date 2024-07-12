import { effect } from "@effect/vitest";
import { Effect, type TestServices } from "effect";

import * as TestConvexService from "~/test/test-convex-service";

type Name<A, E> = Parameters<typeof effect<E, A>>[0];
type Self<A, E> = (
	ctx: Parameters<Parameters<typeof effect<E, A>>[1]>[0],
) => Effect.Effect<
	E,
	A,
	TestServices.TestServices | TestConvexService.TestConvexService
>;
type Timeout<A, E> = Parameters<typeof effect<E, A>>[2];

export const test = <A, E>(
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

	effect(name, self_, timeout);
};
