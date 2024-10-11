import {
	HttpApi,
	HttpApiBuilder,
	HttpApiEndpoint,
	HttpApiGroup,
	OpenApi,
} from "@effect/platform";
import { Schema } from "@effect/schema";

import { Effect, Layer } from "effect";
import { makeHttpRouter } from "~/src/server";

class Api extends HttpApi.empty.pipe(
	HttpApi.addGroup(
		HttpApiGroup.make("api").pipe(
			OpenApi.annotate({
				title: "Convex API",
			}),
			HttpApiGroup.add(
				HttpApiEndpoint.get("get", "/get").pipe(
					HttpApiEndpoint.setSuccess(Schema.Literal("Hello, world!")),
				),
			),
		),
	),
) {}

const ApiGroupLive = HttpApiBuilder.group(Api, "api", (handlers) =>
	handlers.pipe(
		HttpApiBuilder.handle("get", () =>
			Effect.succeed("Hello, world!" as const),
		),
	),
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
