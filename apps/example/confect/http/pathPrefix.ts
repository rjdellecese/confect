import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as HttpApi from "effect/unstable/httpapi/HttpApi";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";
import * as HttpApiEndpoint from "effect/unstable/httpapi/HttpApiEndpoint";
import * as HttpApiGroup from "effect/unstable/httpapi/HttpApiGroup";
import * as OpenApi from "effect/unstable/httpapi/OpenApi";
import refs from "../_generated/refs";
import { QueryRunner } from "../_generated/services";
import notes from "../_generated/tables/notes";

class ApiGroup extends HttpApiGroup.make("notes")
  .add(
    HttpApiEndpoint.get("getFirst", "/get-first", {
      success: Schema.OptionFromNullOr(notes.Doc),
    }).annotate(OpenApi.Description, "Get the first note, if there is one."),
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

/**
 * The group handler layers for {@link Api}, exported directly — Confect
 * registers the routes itself from the `api` definition.
 */
export const ApiLive = HttpApiBuilder.group(Api, "notes", (handlers) =>
  handlers.handle("getFirst", () =>
    Effect.gen(function* () {
      const runQuery = yield* QueryRunner;

      const firstNote = yield* runQuery(
        refs.public.notes_and_random.notes.getFirst,
        {},
      );

      return firstNote;
    }).pipe(Effect.orDie),
  ),
);
