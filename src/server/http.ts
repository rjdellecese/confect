import {
	type HttpApi as EffectHttpApi,
	HttpApiBuilder,
	type HttpApiGroup,
	type HttpApp,
	HttpServer,
	OpenApi,
} from "@effect/platform";
import {
	type GenericActionCtx,
	type HttpRouter,
	ROUTABLE_HTTP_METHODS,
	type RouteSpec,
	type RouteSpecWithPath,
	type RouteSpecWithPathPrefix,
	httpActionGeneric,
	httpRouter,
} from "convex/server";
import { Array, Context, Layer, Record, String, pipe } from "effect";
import { type ConfectActionCtx, makeConfectActionCtx } from "./ctx";
import type {
	DataModelFromConfectDataModel,
	GenericConfectDataModel,
} from "./data-model";

// START MONKEY PATCH
// These are necessary until the Convex runtime supports these APIs. See https://discord.com/channels/1019350475847499849/1281364098419785760

// biome-ignore lint/suspicious/noGlobalAssign:
URL = class extends URL {
	override get username() {
		return "";
	}
	override get password() {
		return "";
	}
};

Object.defineProperty(Request.prototype, "signal", {
	get: () => new AbortSignal(),
});

// END MONKEY PATCH

export class ConfectActionCtxService extends Context.Tag("ConfectActionCtx")<
	ConfectActionCtxService,
	ConfectActionCtx<any>
>() {}

type Middleware = (httpApp: HttpApp.Default) => HttpApp.Default<never, any>;

const scalarApiReferenceVersion = "1.25.48";

const apiDocsHtml = ({
	pageTitle,
	openApiSpecPath,
}: { pageTitle: string; openApiSpecPath: string }) => `<!doctype html>
<html>
  <head>
    <title>${pageTitle}</title>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1" />
		<style>
			.darklight {
				padding: 18px 24px !important;
			}
			.darklight-reference-promo {
				display: none !important;
			}
		</style>
  </head>
  <body>
    <script id="api-reference" data-url="${openApiSpecPath}"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@${scalarApiReferenceVersion}"></script>
  </body>
</html>`;

const makeHandler =
	<ConfectDataModel extends GenericConfectDataModel>(
		apiLive: Layer.Layer<EffectHttpApi.Api, never, ConfectActionCtxService>,
		middleware?: Middleware,
	) =>
	(
		ctx: GenericActionCtx<DataModelFromConfectDataModel<ConfectDataModel>>,
		request: Request,
	): Promise<Response> => {
		const ConfectActionCtxServiceLive = Layer.succeed(
			ConfectActionCtxService,
			makeConfectActionCtx(ctx),
		);

		const EnvLive = Layer.mergeAll(
			apiLive.pipe(Layer.provide(ConfectActionCtxServiceLive)),
			HttpServer.layerContext,
		);

		const { handler } = HttpApiBuilder.toWebHandler(EnvLive, { middleware });

		return handler(request);
	};

const makeHttpAction = (
	apiLive: Layer.Layer<EffectHttpApi.Api, never, ConfectActionCtxService>,
	middleware?: Middleware,
) => httpActionGeneric(makeHandler(apiLive, middleware));

export type HttpApi<
	Groups extends HttpApiGroup.HttpApiGroup.Any,
	Error,
	ErrorR,
> = {
	api: EffectHttpApi.HttpApi<Groups, Error, ErrorR>;
	impl: Layer.Layer<EffectHttpApi.Api, never, ConfectActionCtxService>;
	serverUrl?: string;
	openApiSpecPath?: RoutePath;
	apiDocsTitle?: string;
	apiDocsPath?: RoutePath;
	middleware?: Middleware;
};

export type RoutePath = `/${string}`;

const mountEffectHttpApi =
	<Groups extends HttpApiGroup.HttpApiGroup.Any, Error, ErrorR>({
		pathPrefix,
		api,
		impl,
		serverUrl,
		openApiSpecPath = "/openapi",
		apiDocsTitle = "API Reference",
		apiDocsPath = "/docs",
		middleware,
	}: {
		pathPrefix: RoutePath;
		api: EffectHttpApi.HttpApi<Groups, Error, ErrorR>;
		impl: Layer.Layer<EffectHttpApi.Api, never, ConfectActionCtxService>;
		serverUrl?: string;
		openApiSpecPath?: RoutePath;
		apiDocsTitle?: string;
		apiDocsPath?: RoutePath;
		middleware?: Middleware;
	}) =>
	(convexHttpRouter: HttpRouter): HttpRouter => {
		const prependPathPrefix = (path: RoutePath) =>
			pathPrefix === "/" ? path : `${pathPrefix}${path}`;

		// biome-ignore lint/complexity/useLiteralKeys:
		const url = `${serverUrl ?? process.env["CONVEX_SITE_URL"]}${pathPrefix}`;

		const handler = makeHttpAction(impl, middleware);

		const routeSpecs: RouteSpec[] = [];

		Array.forEach(ROUTABLE_HTTP_METHODS, (method) => {
			const routeSpec: RouteSpecWithPathPrefix = {
				pathPrefix: pathPrefix === "/" ? pathPrefix : `${pathPrefix}/`,
				method,
				handler,
			};
			routeSpecs.push(routeSpec);
		});

		const generatedOpenApiSpec = OpenApi.fromApi(api);

		const openApiSpec = {
			...generatedOpenApiSpec,
			paths: Record.mapKeys(generatedOpenApiSpec.paths, (path) =>
				String.replace(pathPrefix, "")(path),
			),
			servers: [{ url }],
		};

		const openApiRouteSpec: RouteSpecWithPath = {
			path: prependPathPrefix(openApiSpecPath),
			method: "GET",
			handler: httpActionGeneric(() =>
				Promise.resolve(
					new Response(JSON.stringify(openApiSpec), {
						headers: { "Content-Type": "application/json" },
					}),
				),
			),
		};
		routeSpecs.push(openApiRouteSpec);

		const openApiCorsRouteSpec: RouteSpecWithPath = {
			path: prependPathPrefix(openApiSpecPath),
			method: "OPTIONS",
			handler: httpActionGeneric(() =>
				Promise.resolve(
					new Response(null, {
						status: 200,
						headers: {
							"Access-Control-Allow-Origin": "*",
							"Access-Control-Allow-Methods": "GET, OPTIONS",
							"Access-Control-Allow-Headers": "Content-Type",
						},
					}),
				),
			),
		};
		routeSpecs.push(openApiCorsRouteSpec);

		const apiDocsRouteSpec: RouteSpecWithPath = {
			path: prependPathPrefix(apiDocsPath),
			method: "GET",
			handler: httpActionGeneric(() =>
				Promise.resolve(
					new Response(
						apiDocsHtml({
							pageTitle: apiDocsTitle,
							openApiSpecPath: prependPathPrefix(openApiSpecPath),
						}),
						{
							headers: { "Content-Type": "text/html" },
						},
					),
				),
			),
		};
		routeSpecs.push(apiDocsRouteSpec);

		Array.forEach(routeSpecs, (routeSpec) => {
			convexHttpRouter.route(routeSpec);
		});

		return convexHttpRouter;
	};

const makeHttpRouter = <
	Groups extends HttpApiGroup.HttpApiGroup.Any,
	Error,
	ErrorR,
>(
	httpApis: Record<RoutePath, HttpApi<Groups, Error, ErrorR>>,
): HttpRouter =>
	pipe(
		httpApis,
		Record.toEntries,
		Array.reduce(httpRouter(), (convexHttpRouter, [pathPrefix, httpApi]) =>
			mountEffectHttpApi({ pathPrefix, ...httpApi })(convexHttpRouter),
		),
	);

export { makeHttpRouter };
