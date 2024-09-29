import {
	HttpApi,
	HttpApiBuilder,
	HttpApiEndpoint,
	HttpApiGroup,
	OpenApi,
} from "@effect/platform";
import { Schema } from "@effect/schema";
import { makeHttpRouter } from "@rjdellecese/confect/server";
import { Effect, Layer } from "effect";

class Api extends HttpApi.empty.pipe(
	HttpApi.addGroup(
		HttpApiGroup.make("api").pipe(
			OpenApi.annotate({
				title: "Convex API",
			}),
			HttpApiGroup.add(
				HttpApiEndpoint.get("get", "/api/get").pipe(
					HttpApiEndpoint.setSuccess(
						Schema.Struct({
							text: Schema.String,
						}),
					),
				),
			),
			OpenApi.annotate({
				description: "Retrieve unfulfilled orders.",
			}),
		),
	),
) {}

const ApiGroupLive = HttpApiBuilder.group(Api, "api", (handlers) =>
	handlers.pipe(
		HttpApiBuilder.handle("get", () =>
			Effect.succeed({
				text: "Hello, world!",
			}),
		),
	),
);

const ApiLive = HttpApiBuilder.api(Api).pipe(Layer.provide(ApiGroupLive));

export default makeHttpRouter({
	api: Api,
	apiLive: ApiLive,
	openApiSpecRoutePath: "/openapi.json",
});
