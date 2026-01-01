import { __export } from "../_virtual/rolldown_runtime.js";
import { layer } from "./ActionRunner.js";
import { ActionCtx } from "./ActionCtx.js";
import { layer as layer$1 } from "./Auth.js";
import { layer as layer$2 } from "./MutationRunner.js";
import { layer as layer$3 } from "./QueryRunner.js";
import { layer as layer$4 } from "./Scheduler.js";
import { StorageActionWriter as StorageActionWriter$1, StorageReader as StorageReader$1, StorageWriter as StorageWriter$1 } from "./Storage.js";
import { Array, Layer, Record, pipe } from "effect";
import { ROUTABLE_HTTP_METHODS, httpActionGeneric, httpRouter } from "convex/server";
import { HttpApiBuilder, HttpApiScalar, HttpServer } from "@effect/platform";

//#region src/server/HttpApi.ts
var HttpApi_exports = /* @__PURE__ */ __export({ make: () => make });
const makeHandler = ({ pathPrefix, apiLive, middleware, scalar }) => (ctx, request) => {
	const ApiLive = apiLive.pipe(Layer.provide(Layer.mergeAll(layer$3(ctx.runQuery), layer$2(ctx.runMutation), layer(ctx.runAction), layer$4(ctx.scheduler), layer$1(ctx.auth), StorageReader$1.layer(ctx.storage), StorageWriter$1.layer(ctx.storage), StorageActionWriter$1.layer(ctx.storage), Layer.succeed(ActionCtx(), ctx))));
	const ApiDocsLive = HttpApiScalar.layer({
		path: `${pathPrefix}docs`,
		scalar: {
			baseServerURL: `${process.env["CONVEX_SITE_URL"]}${pathPrefix}`,
			...scalar
		}
	}).pipe(Layer.provide(ApiLive));
	const EnvLive = Layer.mergeAll(ApiLive, ApiDocsLive, HttpServer.layerContext);
	const { handler } = HttpApiBuilder.toWebHandler(EnvLive, middleware ? { middleware } : {});
	return handler(request);
};
const makeHttpAction = ({ pathPrefix, apiLive, middleware, scalar }) => httpActionGeneric(makeHandler({
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
	Array.forEach(ROUTABLE_HTTP_METHODS, (method) => {
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
	return pipe(httpApis, Record.toEntries, Array.reduce(httpRouter(), (convexHttpRouter, [pathPrefix, { apiLive, middleware, scalar }]) => mountEffectHttpApi({
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
export { HttpApi_exports, make };
//# sourceMappingURL=HttpApi.js.map