const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
const require_internal_utils = require('../internal/utils.js');
const require_server_ActionRunner = require('./ActionRunner.js');
const require_server_Registry = require('./Registry.js');
const require_server_RegistryItem = require('./RegistryItem.js');
const require_server_ActionCtx = require('./ActionCtx.js');
const require_server_Auth = require('./Auth.js');
const require_server_SchemaToValidator = require('./SchemaToValidator.js');
const require_server_DatabaseReader = require('./DatabaseReader.js');
const require_server_DatabaseWriter = require('./DatabaseWriter.js');
const require_server_MutationCtx = require('./MutationCtx.js');
const require_server_MutationRunner = require('./MutationRunner.js');
const require_server_QueryCtx = require('./QueryCtx.js');
const require_server_QueryRunner = require('./QueryRunner.js');
const require_server_Scheduler = require('./Scheduler.js');
const require_server_Storage = require('./Storage.js');
const require_server_VectorSearch = require('./VectorSearch.js');
let effect = require("effect");
let convex_server = require("convex/server");

//#region src/server/Server.ts
var Server_exports = /* @__PURE__ */ require_rolldown_runtime.__export({
	TypeId: () => TypeId,
	isRegisteredFunction: () => isRegisteredFunction,
	isServer: () => isServer,
	make: () => make
});
const isRegisteredQuery = (u) => effect.Predicate.hasProperty(u, "isQuery") && u.isQuery === true;
const isRegisteredMutation = (u) => effect.Predicate.hasProperty(u, "isMutation") && u.isMutation === true;
const isRegisteredAction = (u) => effect.Predicate.hasProperty(u, "isAction") && u.isAction === true;
const isRegisteredFunction = (u) => isRegisteredQuery(u) || isRegisteredMutation(u) || isRegisteredAction(u);
const TypeId = "@rjdellecese/confect/server/Server";
const isServer = (u) => effect.Predicate.hasProperty(u, TypeId);
const Proto = { [TypeId]: TypeId };
const makeProto = ({ registeredFunctions }) => Object.assign(Object.create(Proto), { registeredFunctions });
const make = (api) => effect.Effect.gen(function* () {
	const registry = yield* require_server_Registry.Registry;
	return makeProto({ registeredFunctions: require_internal_utils.mapLeaves(yield* effect.Ref.get(registry), require_server_RegistryItem.isRegistryItem, (registryItem) => makeRegisteredFunction(api, registryItem)) });
});
const makeRegisteredFunction = (api, { function_, handler }) => effect.Match.value(function_.functionType).pipe(effect.Match.when("Query", () => {
	return effect.Match.value(function_.functionVisibility).pipe(effect.Match.when("Public", () => convex_server.queryGeneric), effect.Match.when("Internal", () => convex_server.internalQueryGeneric), effect.Match.exhaustive)(queryFunction(api.schema, {
		args: function_.args,
		returns: function_.returns,
		handler
	}));
}), effect.Match.when("Mutation", () => {
	return effect.Match.value(function_.functionVisibility).pipe(effect.Match.when("Public", () => convex_server.mutationGeneric), effect.Match.when("Internal", () => convex_server.internalMutationGeneric), effect.Match.exhaustive)(mutationFunction(api.schema, {
		args: function_.args,
		returns: function_.returns,
		handler
	}));
}), effect.Match.when("Action", () => {
	return effect.Match.value(function_.functionVisibility).pipe(effect.Match.when("Public", () => convex_server.actionGeneric), effect.Match.when("Internal", () => convex_server.internalActionGeneric), effect.Match.exhaustive)(actionFunction({
		args: function_.args,
		returns: function_.returns,
		handler
	}));
}), effect.Match.exhaustive);
const queryFunction = (schema, { args, returns, handler }) => ({
	args: require_server_SchemaToValidator.compileArgsSchema(args),
	returns: require_server_SchemaToValidator.compileReturnsSchema(returns),
	handler: (ctx, actualArgs) => (0, effect.pipe)(actualArgs, effect.Schema.decode(args), effect.Effect.orDie, effect.Effect.andThen((decodedArgs) => (0, effect.pipe)(handler(decodedArgs), effect.Effect.provide(effect.Layer.mergeAll(require_server_DatabaseReader.layer(schema, ctx.db), require_server_Auth.layer(ctx.auth), require_server_Storage.StorageReader.layer(ctx.storage), require_server_QueryRunner.layer(ctx.runQuery), effect.Layer.succeed(require_server_QueryCtx.QueryCtx(), ctx))))), effect.Effect.andThen((convexReturns) => effect.Schema.encodeUnknown(returns)(convexReturns)), effect.Effect.runPromise)
});
const mutationFunction = (schema, { args, returns, handler }) => ({
	args: require_server_SchemaToValidator.compileArgsSchema(args),
	returns: require_server_SchemaToValidator.compileReturnsSchema(returns),
	handler: (ctx, actualArgs) => (0, effect.pipe)(actualArgs, effect.Schema.decode(args), effect.Effect.orDie, effect.Effect.andThen((decodedArgs) => (0, effect.pipe)(handler(decodedArgs), effect.Effect.provide(effect.Layer.mergeAll(require_server_DatabaseReader.layer(schema, ctx.db), require_server_DatabaseWriter.layer(schema, ctx.db), require_server_Auth.layer(ctx.auth), require_server_Scheduler.layer(ctx.scheduler), require_server_Storage.StorageReader.layer(ctx.storage), require_server_Storage.StorageWriter.layer(ctx.storage), require_server_QueryRunner.layer(ctx.runQuery), require_server_MutationRunner.layer(ctx.runMutation), effect.Layer.succeed(require_server_MutationCtx.MutationCtx(), ctx))))), effect.Effect.andThen((convexReturns) => effect.Schema.encodeUnknown(returns)(convexReturns)), effect.Effect.runPromise)
});
const actionFunction = ({ args, returns, handler }) => ({
	args: require_server_SchemaToValidator.compileArgsSchema(args),
	returns: require_server_SchemaToValidator.compileReturnsSchema(returns),
	handler: (ctx, actualArgs) => (0, effect.pipe)(actualArgs, effect.Schema.decode(args), effect.Effect.orDie, effect.Effect.andThen((decodedArgs) => (0, effect.pipe)(handler(decodedArgs), effect.Effect.provide(effect.Layer.mergeAll(require_server_Scheduler.layer(ctx.scheduler), require_server_Auth.layer(ctx.auth), require_server_Storage.StorageReader.layer(ctx.storage), require_server_Storage.StorageWriter.layer(ctx.storage), require_server_Storage.StorageActionWriter.layer(ctx.storage), require_server_QueryRunner.layer(ctx.runQuery), require_server_MutationRunner.layer(ctx.runMutation), require_server_ActionRunner.layer(ctx.runAction), require_server_VectorSearch.layer(ctx.vectorSearch), effect.Layer.succeed(require_server_ActionCtx.ActionCtx(), ctx))))), effect.Effect.andThen((convexReturns) => effect.Schema.encodeUnknown(returns)(convexReturns)), effect.Effect.runPromise)
});

//#endregion
Object.defineProperty(exports, 'Server_exports', {
  enumerable: true,
  get: function () {
    return Server_exports;
  }
});
exports.TypeId = TypeId;
exports.isRegisteredFunction = isRegisteredFunction;
exports.isServer = isServer;
exports.make = make;
//# sourceMappingURL=Server.cjs.map