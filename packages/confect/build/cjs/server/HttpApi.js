const require_rolldown_runtime = require('../_virtual/rolldown_runtime.js');
const require_server_ActionRunner = require('./ActionRunner.js');
const require_server_ActionCtx = require('./ActionCtx.js');
const require_server_Auth = require('./Auth.js');
const require_server_MutationRunner = require('./MutationRunner.js');
const require_server_QueryRunner = require('./QueryRunner.js');
const require_server_Scheduler = require('./Scheduler.js');
const require_server_Storage = require('./Storage.js');
let effect = require("effect");
let convex_server = require("convex/server");
let __effect_platform = require("@effect/platform");

//#region src/server/HttpApi.ts
var HttpApi_exports = /* @__PURE__ */ require_rolldown_runtime.__export({ make: () => make });
const makeHandler = ({ pathPrefix, apiLive, middleware, scalar }) => (ctx, request) => {
	const ApiLive = apiLive.pipe(effect.Layer.provide(effect.Layer.mergeAll(require_server_QueryRunner.layer(ctx.runQuery), require_server_MutationRunner.layer(ctx.runMutation), require_server_ActionRunner.layer(ctx.runAction), require_server_Scheduler.layer(ctx.scheduler), require_server_Auth.layer(ctx.auth), require_server_Storage.StorageReader.layer(ctx.storage), require_server_Storage.StorageWriter.layer(ctx.storage), require_server_Storage.StorageActionWriter.layer(ctx.storage), effect.Layer.succeed(require_server_ActionCtx.ActionCtx(), ctx))));
	const ApiDocsLive = __effect_platform.HttpApiScalar.layer({
		path: `${pathPrefix}docs`,
		scalar: {
			baseServerURL: `${process.env["CONVEX_SITE_URL"]}${pathPrefix}`,
			...scalar
		}
	}).pipe(effect.Layer.provide(ApiLive));
	const EnvLive = effect.Layer.mergeAll(ApiLive, ApiDocsLive, __effect_platform.HttpServer.layerContext);
	const { handler } = __effect_platform.HttpApiBuilder.toWebHandler(EnvLive, middleware ? { middleware } : {});
	return handler(request);
};
const makeHttpAction = ({ pathPrefix, apiLive, middleware, scalar }) => (0, convex_server.httpActionGeneric)(makeHandler({
	pathPrefix,
	apiLive,
	...middleware ? { middleware } : {},
	...scalar ? { scalar } : {}
}));
const mountEffectHttpApi = ({ pathPrefix, apiLive, middleware, scalar }) => (convexHttpRouter) => {
	const handler = makeHttpAction({
		pathPrefix,
		apiLive,
		...middleware ? { middleware } : {},
		...scalar ? { scalar } : {}
	});
	effect.Array.forEach(convex_server.ROUTABLE_HTTP_METHODS, (method) => {
		const routeSpec = {
			pathPrefix,
			method,
			handler
		};
		convexHttpRouter.route(routeSpec);
	});
	return convexHttpRouter;
};
const make = (httpApis) => {
	applyMonkeyPatches();
	return (0, effect.pipe)(httpApis, effect.Record.toEntries, effect.Array.reduce((0, convex_server.httpRouter)(), (convexHttpRouter, [pathPrefix, { apiLive, middleware, scalar }]) => mountEffectHttpApi({
		pathPrefix,
		apiLive,
		...middleware ? { middleware } : {},
		...scalar ? { scalar } : {}
	})(convexHttpRouter)));
};
const applyMonkeyPatches = () => {
	URL = class extends URL {
		get username() {
			return "";
		}
		get password() {
			return "";
		}
	};
	Object.defineProperty(Request.prototype, "signal", { get: () => new AbortSignal() });
};

//#endregion
Object.defineProperty(exports, 'HttpApi_exports', {
  enumerable: true,
  get: function () {
    return HttpApi_exports;
  }
});
exports.make = make;
//# sourceMappingURL=HttpApi.cjs.map