import {
	HttpApi,
	HttpApiBuilder,
	HttpApiEndpoint,
	HttpApiGroup,
	OpenApi,
} from "@effect/platform";
import { ConfectActionCtxService } from "@rjdellecese/confect/server";
import { Effect, Layer, Option, Schema } from "effect";
import { api } from "../_generated/api";
import { GetFirstResult } from "../functions.schemas";
import { confectSchema } from "../schema";

class ApiGroup extends HttpApiGroup.make("notes")
	.add(
		HttpApiEndpoint.get("getFirst", "/get-first")
			.annotate(OpenApi.Description, "Get the first note, if there is one.")
			.addSuccess(
				Schema.NullOr(confectSchema.tableSchemas.notes.withSystemFields),
			),
	)
	.annotate(OpenApi.Title, "Notes")
	.annotate(OpenApi.Description, "Operations on notes.") {}

export class Api extends HttpApi.make("Api")
	.annotate(OpenApi.Title, "Confect Example")
	.annotate(
		OpenApi.Description,
		`
An example API built with Confect and powered by [Scalar](https://github.com/scalar/scalar). 

# Learn More

See Scalar's documentation on [markdown support](https://github.com/scalar/scalar/blob/main/documentation/markdown.md) and [OpenAPI spec extensions](https://github.com/scalar/scalar/blob/main/documentation/openapi.md).
	`,
	)
	.add(ApiGroup)
	.prefix("/path-prefix") {}

const ApiGroupLive = HttpApiBuilder.group(Api, "notes", (handlers) =>
	handlers.handle(
		"getFirst",
		(): Effect.Effect<
			(typeof confectSchema.tableSchemas.notes.withSystemFields)["Type"] | null,
			never,
			ConfectActionCtxService
		> =>
			Effect.gen(function* () {
				const { runQuery } = yield* ConfectActionCtxService;

				const firstNote = yield* runQuery(api.functions.getFirst, {})
					.pipe(
						Effect.andThen(Schema.decode(GetFirstResult)),
						Effect.map(Option.getOrNull),
					)
					.pipe(Effect.orDie);

				return firstNote;
			}),
	),
);

export const ApiLive = HttpApiBuilder.api(Api).pipe(
	Layer.provide(ApiGroupLive),
);
