import {
	HttpApi,
	HttpApiBuilder,
	HttpApiEndpoint,
	HttpApiGroup,
	OpenApi,
} from "@effect/platform";
import { Schema } from "@effect/schema";
import { ConfectActionCtxService } from "@rjdellecese/confect/server";
import { Effect, Layer } from "effect";
import { api } from "../_generated/api";
import { GetFirstResult } from "../functions.schemas";
import { confectSchema } from "../schema";

class ApiGroup extends HttpApiGroup.make("group").pipe(
	HttpApiGroup.add(
		HttpApiEndpoint.get("getFirst", "/get-first").pipe(
			HttpApiEndpoint.setSuccess(
				Schema.Option(confectSchema.tableSchemas.notes.withSystemFields),
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
				(typeof GetFirstResult)["Type"],
				never,
				ConfectActionCtxService<any>
			> =>
				Effect.gen(function* () {
					const { runQuery } = yield* ConfectActionCtxService;

					const encodedGetFirstResult = yield* runQuery(
						api.functions.getFirst,
						{},
					);

					const getFirstResult = yield* Schema.decode(GetFirstResult)(
						encodedGetFirstResult,
					).pipe(Effect.orDie);

					return getFirstResult;
				}),
		),
	),
);

export const ApiLive = HttpApiBuilder.api(Api).pipe(
	Layer.provide(ApiGroupLive),
);
