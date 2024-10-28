import {
	HttpApi,
	HttpApiBuilder,
	HttpApiEndpoint,
	HttpApiGroup,
	OpenApi,
} from "@effect/platform";

import { Effect, Layer, Schema } from "effect";
import { makeHttpRouter } from "~/src/server";

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

export default makeHttpRouter({
	"/": {
		api: Api,
		impl: ApiLive,
	},
	"/path-prefix": {
		api: Api,
		impl: ApiLive,
	},
});
