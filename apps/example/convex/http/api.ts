import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
  OpenApi,
} from "@effect/platform";
import type { HttpApiDecodeError } from "@effect/platform/HttpApiError";
import { Effect, Layer, Schema } from "effect";
import { Note } from "../../confect/schema/note";
import { ConfectQueryRunner } from "../confect/services";

class ApiGroup extends HttpApiGroup.make("notes")
  .add(
    HttpApiEndpoint.get("getFirst", "/get-first")
      .annotate(OpenApi.Description, "Get the first note, if there is one.")
      .addSuccess(Schema.NullOr(Note.Doc)),
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
      (typeof Note.Doc)["Type"] | null,
      HttpApiDecodeError,
      ConfectQueryRunner
    > => Effect.succeed(null),
    // Effect.gen(function* () {
    //   const runQuery = yield* ConfectQueryRunner;

    //   const firstNote = yield* runQuery(api.functions.getFirst, {}).pipe(
    //     Effect.andThen(Schema.decode(GetFirstResult)),
    //     Effect.map(Option.getOrNull),
    //     Effect.orDie,
    //   );

    //   return firstNote;
    // }),
  ),
);

export const ApiLive = HttpApiBuilder.api(Api).pipe(
  Layer.provide(ApiGroupLive),
);
