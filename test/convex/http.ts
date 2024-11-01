import {
	HttpApi,
	HttpApiBuilder,
	HttpApiEndpoint,
	HttpApiGroup,
	OpenApi,
} from "@effect/platform";

import { Effect, Layer, Schema } from "effect";
import { makeHttpRouter } from "~/src/server";

// root

const ApiGroup = HttpApiGroup.make("api").add(
	HttpApiEndpoint.get("get", "/get")
		.addSuccess(Schema.Literal("Hello, world!"))
		.annotate(OpenApi.Title, "Get"),
);

class Api extends HttpApi.empty.add(ApiGroup) {}

const ApiGroupLive = HttpApiBuilder.group(Api, "api", (handlers) =>
	handlers.handle("get", () => Effect.succeed("Hello, world!" as const)),
);

const ApiLive = HttpApiBuilder.api(Api).pipe(Layer.provide(ApiGroupLive));

// path-prefix

const ApiGroupPathPrefix = ApiGroup.prefix("/path-prefix");

class ApiPathPrefix extends HttpApi.empty.add(ApiGroupPathPrefix) {}

const ApiGroupPathPrefixLive = HttpApiBuilder.group(
	ApiPathPrefix,
	"api",
	(handlers) =>
		handlers.handle("get", () => Effect.succeed("Hello, world!" as const)),
);

const ApiPathPrefixLive = HttpApiBuilder.api(ApiPathPrefix).pipe(
	Layer.provide(ApiGroupPathPrefixLive),
);

export default makeHttpRouter({
	"/": {
		apiLive: ApiLive,
	},
	"/path-prefix/": {
		apiLive: ApiPathPrefixLive,
	},
});
