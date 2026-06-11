import * as HttpApi from "@effect/platform/HttpApi";
import * as HttpApiBuilder from "@effect/platform/HttpApiBuilder";
import * as HttpApiEndpoint from "@effect/platform/HttpApiEndpoint";
import * as HttpApiGroup from "@effect/platform/HttpApiGroup";
import * as OpenApi from "@effect/platform/OpenApi";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import refs from "../_generated/refs";
import { QueryRunner } from "../_generated/services";
import notes from "../_generated/tables/notes";

class ApiGroup extends HttpApiGroup.make("notes")
  .add(
    HttpApiEndpoint.get("getFirst", "/get-first")
      .annotate(OpenApi.Description, "Get the first note, if there is one.")
      .addSuccess(Schema.Option(notes.Doc)),
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
      const runQuery = yield* QueryRunner;

      const firstNote = yield* runQuery(
        refs.public.notes_and_random.notes.getFirst,
        {},
      );

      return firstNote;
    }).pipe(Effect.orDie),
  ),
);

export const ApiLive = HttpApiBuilder.api(Api).pipe(
  Layer.provide(ApiGroupLive),
);
