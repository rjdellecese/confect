/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import type {
	DataModelFromSchemaDefinition,
	FunctionReference,
	FunctionReturnType,
	GenericMutationCtx,
	OptionalRestArgs,
	StorageActionWriter,
} from "convex/server";
import { Context, Effect, Layer, pipe } from "effect";

import schema from "~/test/convex/schema";

export interface TestConvexService {
	query: <Query extends FunctionReference<"query", any>>(
		query: Query,
		...args: OptionalRestArgs<Query>
	) => Effect.Effect<FunctionReturnType<Query>>;
	mutation: <Mutation extends FunctionReference<"mutation", any>>(
		mutation: Mutation,
		...args: OptionalRestArgs<Mutation>
	) => Effect.Effect<FunctionReturnType<Mutation>>;
	action: <Action extends FunctionReference<"action", any>>(
		action: Action,
		...args: OptionalRestArgs<Action>
	) => Effect.Effect<FunctionReturnType<Action>>;
	run: <Output>(
		func: (
			ctx: GenericMutationCtx<DataModelFromSchemaDefinition<typeof schema>> & {
				storage: StorageActionWriter;
			},
		) => Promise<Output>,
	) => Effect.Effect<Output>;
	fetch: (
		pathQueryFragment: string,
		init?: RequestInit,
	) => Effect.Effect<Response>;
	finishInProgressScheduledFunctions: () => Effect.Effect<void>;
	finishAllScheduledFunctions: (
		advanceTimers: () => void,
	) => Effect.Effect<void>;
}

export const TestConvexService = Context.GenericTag<TestConvexService>(
	"@services/ConvexService",
);

// In theory it might be possible to also have a version of this which runs the tests on the local or cloud backends
export const layer = Effect.sync(() =>
	pipe(
		convexTest(schema, import.meta.glob("./**/!(*.*.*)*.*s")),
		(testConvex): TestConvexService => ({
			query: (query, ...args) =>
				Effect.promise(() => testConvex.query(query, ...args)),
			mutation: (mutation, ...args) =>
				Effect.promise(() => testConvex.mutation(mutation, ...args)),
			action: (action, ...args) =>
				Effect.promise(() => testConvex.action(action, ...args)),
			run: (func) => Effect.promise(() => testConvex.run(func)),
			fetch: (...args) => Effect.promise(() => testConvex.fetch(...args)),
			finishInProgressScheduledFunctions: () =>
				Effect.promise(() => testConvex.finishInProgressScheduledFunctions()),
			finishAllScheduledFunctions: (...args) =>
				Effect.promise(() => testConvex.finishAllScheduledFunctions(...args)),
		}),
	),
).pipe(Layer.effect(TestConvexService));
