import {
	HttpApi,
	HttpApiBuilder,
	HttpApiEndpoint,
	HttpApiGroup,
	OpenApi,
} from "@effect/platform";
import { Schema } from "@effect/schema";
import { ConfectActionCtxService } from "@rjdellecese/confect/server";
import { Effect, Layer, Option } from "effect";
import { api } from "../_generated/api";
import { GetFirstResult } from "../functions.schemas";
import { confectSchema } from "../schema";

class ApiGroup extends HttpApiGroup.make("group").pipe(
	HttpApiGroup.add(
		HttpApiEndpoint.get("getFirst", "/get-first").pipe(
			OpenApi.annotate({
				description: "Get the first note, if there is one.",
			}),
			HttpApiEndpoint.setSuccess(
				Schema.NullOr(confectSchema.tableSchemas.notes.withSystemFields),
			),
		),
	),
) {}

export class Api extends HttpApi.empty.pipe(HttpApi.addGroup(ApiGroup)) {}

const ApiGroupLive = HttpApiBuilder.group(Api, "group", (handlers) =>
	handlers.pipe(
		HttpApiBuilder.handle(
			"getFirst",
			(): Effect.Effect<
				| (typeof confectSchema.tableSchemas.notes.withSystemFields)["Type"]
				| null,
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
	),
);

export const ApiLive = HttpApiBuilder.api(Api).pipe(
	Layer.provide(ApiGroupLive),
);
