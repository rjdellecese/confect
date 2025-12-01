import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
  OpenApi,
} from "@effect/platform";
import { Effect, Layer, Schema } from "effect";
import { Note } from "../../confect/schema/note";
import { api } from "../../convex/confect/refs";
import { ConfectQueryRunner } from "../../convex/confect/services";

class ApiGroup extends HttpApiGroup.make("notes")
  .add(
    HttpApiEndpoint.get("getFirst", "/get-first")
      .annotate(OpenApi.Description, "Get the first note, if there is one.")
      .addSuccess(Schema.Option(Note.Doc)),
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
  handlers.handle("getFirst", () =>
    Effect.gen(function* () {
      const runQuery = yield* ConfectQueryRunner;

      const firstNote = yield* runQuery(api.groups.notes.getFirst, {});

      return firstNote;
    }).pipe(Effect.orDie),
  ),
);

export const ApiLive = HttpApiBuilder.api(Api).pipe(
  Layer.provide(ApiGroupLive),
);
