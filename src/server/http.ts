import {
	FileSystem,
	HttpApi,
	HttpApiBuilder,
	type HttpApiGroup,
	type HttpMethod,
	OpenApi,
	Path,
} from "@effect/platform";
import * as Etag from "@effect/platform/Etag";
import * as HttpPlatform from "@effect/platform/HttpPlatform";
import {
	httpActionGeneric,
	httpRouter,
	type HttpRouter,
	type RoutableMethod,
	type RouteSpecWithPath,
} from "convex/server";
import { Array, Layer, ManagedRuntime } from "effect";

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

const unsafeRoutableMethodFromHttpMethod = (
	method: HttpMethod.HttpMethod,
): RoutableMethod => {
	if (method === "HEAD") {
		throw new Error("HEAD is not supported");
	}
	return method;
};

const makeHttpRouter = <
	Groups extends HttpApiGroup.HttpApiGroup.Any,
	Error,
	ErrorR,
>({
	openApiSpecRoutePath,
	api,
	apiLive,
}: {
	openApiSpecRoutePath: string;
	api: HttpApi.HttpApi<Groups, Error, ErrorR>;
	apiLive: Layer.Layer<HttpApi.HttpApi.Service, never, never>;
}): HttpRouter => {
	const FsLive = FileSystem.layerNoop({});

	const EnvLive = Layer.mergeAll(
		apiLive,
		HttpApiBuilder.Router.Live,
		HttpPlatform.layer.pipe(Layer.provide(FsLive)),
		Etag.layerWeak,
		FsLive,
		Path.layer,
	);

	const runtime = ManagedRuntime.make(EnvLive);

	const handler = HttpApiBuilder.toWebHandler(runtime);

	const routeSpecs: RouteSpecWithPath[] = [];

	HttpApi.reflect(api, {
		onGroup: () => {},
		onEndpoint: ({ endpoint }) => {
			const method: RoutableMethod = unsafeRoutableMethodFromHttpMethod(
				endpoint.method,
			);

			const routeSpec: RouteSpecWithPath = {
				path: endpoint.path,
				method,
				handler: httpActionGeneric((_ctx, request) => handler(request)),
			};

			routeSpecs.push(routeSpec);
		},
	});

	const generatedOpenApiSpec = OpenApi.fromApi(api);

	const openApiSpec = {
		...generatedOpenApiSpec,
		// biome-ignore lint/complexity/useLiteralKeys:
		servers: [{ url: process.env["CONVEX_SITE_URL"] }],
	};

	const openApiSpecRouteSpec: RouteSpecWithPath = {
		path: openApiSpecRoutePath,
		method: "GET",
		handler: httpActionGeneric(() =>
			Promise.resolve(
				new Response(JSON.stringify(openApiSpec), {
					headers: { "Content-Type": "application/json" },
				}),
			),
		),
	};

	routeSpecs.push(openApiSpecRouteSpec);

	const convexHttpRouter = httpRouter();

	Array.forEach(routeSpecs, (routeSpec) => {
		convexHttpRouter.route(routeSpec);
	});

	return convexHttpRouter;
};

export { makeHttpRouter };
