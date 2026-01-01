import { __export } from "../_virtual/rolldown_runtime.js";
import { mapLeaves } from "../internal/utils.js";
import { layer } from "./ActionRunner.js";
import { Registry } from "./Registry.js";
import { isRegistryItem } from "./RegistryItem.js";
import { ActionCtx } from "./ActionCtx.js";
import { layer as layer$1 } from "./Auth.js";
import { compileArgsSchema, compileReturnsSchema } from "./SchemaToValidator.js";
import { layer as layer$2 } from "./DatabaseReader.js";
import { layer as layer$3 } from "./DatabaseWriter.js";
import { MutationCtx } from "./MutationCtx.js";
import { layer as layer$4 } from "./MutationRunner.js";
import { QueryCtx } from "./QueryCtx.js";
import { layer as layer$5 } from "./QueryRunner.js";
import { layer as layer$6 } from "./Scheduler.js";
import { StorageActionWriter as StorageActionWriter$1, StorageReader as StorageReader$1, StorageWriter as StorageWriter$1 } from "./Storage.js";
import { layer as layer$7 } from "./VectorSearch.js";
import { Effect, Layer, Match, Predicate, Ref, Schema, pipe } from "effect";
import { actionGeneric, internalActionGeneric, internalMutationGeneric, internalQueryGeneric, mutationGeneric, queryGeneric } from "convex/server";

//#region src/server/Server.ts
var Server_exports = /* @__PURE__ */ __export({
	TypeId: () => TypeId,
	isRegisteredFunction: () => isRegisteredFunction,
	isServer: () => isServer,
	make: () => make
});
const isRegisteredQuery = (u) => Predicate.hasProperty(u, "isQuery") && u.isQuery === true;
const isRegisteredMutation = (u) => Predicate.hasProperty(u, "isMutation") && u.isMutation === true;
const isRegisteredAction = (u) => Predicate.hasProperty(u, "isAction") && u.isAction === true;
const isRegisteredFunction = (u) => isRegisteredQuery(u) || isRegisteredMutation(u) || isRegisteredAction(u);
const TypeId = "@rjdellecese/confect/server/Server";
const isServer = (u) => Predicate.hasProperty(u, TypeId);
const Proto = { [TypeId]: TypeId };
const makeProto = ({ registeredFunctions }) => Object.assign(Object.create(Proto), { registeredFunctions });
const make = (api) => Effect.gen(function* () {
	const registry = yield* Registry;
	return makeProto({ registeredFunctions: mapLeaves(yield* Ref.get(registry), isRegistryItem, (registryItem) => makeRegisteredFunction(api, registryItem)) });
});
const makeRegisteredFunction = (api, { function_, handler }) => Match.value(function_.functionType).pipe(Match.when("Query", () => {
	return Match.value(function_.functionVisibility).pipe(Match.when("Public", () => queryGeneric), Match.when("Internal", () => internalQueryGeneric), Match.exhaustive)(queryFunction(api.schema, {
		args: function_.args,
		returns: function_.returns,
		handler
	}));
}), Match.when("Mutation", () => {
	return Match.value(function_.functionVisibility).pipe(Match.when("Public", () => mutationGeneric), Match.when("Internal", () => internalMutationGeneric), Match.exhaustive)(mutationFunction(api.schema, {
		args: function_.args,
		returns: function_.returns,
		handler
	}));
}), Match.when("Action", () => {
	return Match.value(function_.functionVisibility).pipe(Match.when("Public", () => actionGeneric), Match.when("Internal", () => internalActionGeneric), Match.exhaustive)(actionFunction({
		args: function_.args,
		returns: function_.returns,
		handler
	}));
}), Match.exhaustive);
const queryFunction = (schema, { args, returns, handler }) => ({
	args: compileArgsSchema(args),
	returns: compileReturnsSchema(returns),
	handler: (ctx, actualArgs) => pipe(actualArgs, Schema.decode(args), Effect.orDie, Effect.andThen((decodedArgs) => pipe(handler(decodedArgs), Effect.provide(Layer.mergeAll(layer$2(schema, ctx.db), layer$1(ctx.auth), StorageReader$1.layer(ctx.storage), layer$5(ctx.runQuery), Layer.succeed(QueryCtx(), ctx))))), Effect.andThen((convexReturns) => Schema.encodeUnknown(returns)(convexReturns)), Effect.runPromise)
});
const mutationFunction = (schema, { args, returns, handler }) => ({
	args: compileArgsSchema(args),
	returns: compileReturnsSchema(returns),
	handler: (ctx, actualArgs) => pipe(actualArgs, Schema.decode(args), Effect.orDie, Effect.andThen((decodedArgs) => pipe(handler(decodedArgs), Effect.provide(Layer.mergeAll(layer$2(schema, ctx.db), layer$3(schema, ctx.db), layer$1(ctx.auth), layer$6(ctx.scheduler), StorageReader$1.layer(ctx.storage), StorageWriter$1.layer(ctx.storage), layer$5(ctx.runQuery), layer$4(ctx.runMutation), Layer.succeed(MutationCtx(), ctx))))), Effect.andThen((convexReturns) => Schema.encodeUnknown(returns)(convexReturns)), Effect.runPromise)
});
const actionFunction = ({ args, returns, handler }) => ({
	args: compileArgsSchema(args),
	returns: compileReturnsSchema(returns),
	handler: (ctx, actualArgs) => pipe(actualArgs, Schema.decode(args), Effect.orDie, Effect.andThen((decodedArgs) => pipe(handler(decodedArgs), Effect.provide(Layer.mergeAll(layer$6(ctx.scheduler), layer$1(ctx.auth), StorageReader$1.layer(ctx.storage), StorageWriter$1.layer(ctx.storage), StorageActionWriter$1.layer(ctx.storage), layer$5(ctx.runQuery), layer$4(ctx.runMutation), layer(ctx.runAction), layer$7(ctx.vectorSearch), Layer.succeed(ActionCtx(), ctx))))), Effect.andThen((convexReturns) => Schema.encodeUnknown(returns)(convexReturns)), Effect.runPromise)
});

//#endregion
export { Server_exports, TypeId, isRegisteredFunction, isServer, make };
//# sourceMappingURL=Server.js.map