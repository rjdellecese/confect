import {
	FileSystem,
	type HttpApi,
	HttpApiBuilder,
	type HttpApiGroup,
	type HttpApp,
	OpenApi,
	Path,
} from "@effect/platform";
import * as Etag from "@effect/platform/Etag";
import * as HttpPlatform from "@effect/platform/HttpPlatform";
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
import { Array, Context, Layer, ManagedRuntime } from "effect";
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
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;

const makeHandler =
	<ConfectDataModel extends GenericConfectDataModel>(
		apiLive: Layer.Layer<
			HttpApi.HttpApi.Service,
			never,
			ConfectActionCtxService
		>,
		middleware?: Middleware,
	) =>
	(
		ctx: GenericActionCtx<DataModelFromConfectDataModel<ConfectDataModel>>,
		request: Request,
	): Promise<Response> => {
		const FsLive = FileSystem.layerNoop({});

		const ConfectActionCtxServiceLive = Layer.succeed(
			ConfectActionCtxService,
			makeConfectActionCtx(ctx),
		);

		const EnvLive = Layer.mergeAll(
			apiLive.pipe(Layer.provide(ConfectActionCtxServiceLive)),
			HttpApiBuilder.Router.Live,
			HttpPlatform.layer.pipe(Layer.provide(FsLive)),
			Etag.layerWeak,
			FsLive,
			Path.layer,
		);

		const runtime = ManagedRuntime.make(EnvLive);

		const webHandler = HttpApiBuilder.toWebHandler(runtime, middleware);

		return webHandler(request);
	};

const makeHttpAction = (
	apiLive: Layer.Layer<HttpApi.HttpApi.Service, never, ConfectActionCtxService>,
	middleware?: Middleware,
) => httpActionGeneric(makeHandler(apiLive, middleware));

const makeHttpRouter = <
	Groups extends HttpApiGroup.HttpApiGroup.Any,
	Error,
	ErrorR,
>({
	api,
	apiLive,
	serverUrl,
	openApiSpecPath = "/openapi",
	apiDocsTitle = "API Reference",
	apiDocsPath = "/docs",
	middleware,
}: {
	api: HttpApi.HttpApi<Groups, Error, ErrorR>;
	apiLive: Layer.Layer<HttpApi.HttpApi.Service, never, ConfectActionCtxService>;
	serverUrl?: string;
	openApiSpecPath?: string;
	apiDocsTitle?: string;
	apiDocsPath?: string;
	middleware?: Middleware;
}): HttpRouter => {
	const handler = makeHttpAction(apiLive, middleware);

	const routeSpecs: RouteSpec[] = [];

	Array.forEach(ROUTABLE_HTTP_METHODS, (method) => {
		const routeSpec: RouteSpecWithPathPrefix = {
			pathPrefix: "/",
			method,
			handler,
		};
		routeSpecs.push(routeSpec);
	});

	const generatedOpenApiSpec = OpenApi.fromApi(api);

	const openApiSpec = {
		...generatedOpenApiSpec,
		// biome-ignore lint/complexity/useLiteralKeys:
		servers: [{ url: serverUrl ?? process.env["CONVEX_SITE_URL"] }],
	};

	const openApiRouteSpec: RouteSpecWithPath = {
		path: openApiSpecPath,
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
		path: openApiSpecPath,
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
		path: apiDocsPath,
		method: "GET",
		handler: httpActionGeneric(() =>
			Promise.resolve(
				new Response(
					apiDocsHtml({
						pageTitle: apiDocsTitle,
						openApiSpecPath,
					}),
					{
						headers: { "Content-Type": "text/html" },
					},
				),
			),
		),
	};
	routeSpecs.push(apiDocsRouteSpec);

	const convexHttpRouter = httpRouter();

	Array.forEach(routeSpecs, (routeSpec) => {
		convexHttpRouter.route(routeSpec);
	});

	return convexHttpRouter;
};

export { makeHttpRouter };