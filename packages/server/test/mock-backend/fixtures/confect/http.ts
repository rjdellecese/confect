import { HttpRouter as ConfectHttpRouter } from "@confect/server";
import { httpActionGeneric } from "convex/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import type * as HttpMiddleware from "effect/unstable/http/HttpMiddleware";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import * as HttpApi from "effect/unstable/httpapi/HttpApi";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";
import * as HttpApiEndpoint from "effect/unstable/httpapi/HttpApiEndpoint";
import * as HttpApiGroup from "effect/unstable/httpapi/HttpApiGroup";
import * as HttpApiScalar from "effect/unstable/httpapi/HttpApiScalar";
import refs from "./_generated/refs";
import { QueryRunner } from "./_generated/services";
import notes from "./_generated/tables/notes";

class NotesGroup extends HttpApiGroup.make("notes").add(
  HttpApiEndpoint.get("listNotes", "/notes", {
    success: Schema.Array(notes.Doc),
  }),
) {}

export class NotesApi extends HttpApi.make("NotesApi")
  .add(NotesGroup)
  .prefix("/api") {}

const NotesApiLive = HttpApiBuilder.group(NotesApi, "notes", (handlers) =>
  handlers.handle("listNotes", () =>
    Effect.gen(function* () {
      const runQuery = yield* QueryRunner;

      return yield* runQuery(refs.public.databaseReader.listNotes, {});
    }).pipe(Effect.orDie),
  ),
);

class MetaGroup extends HttpApiGroup.make("meta").add(
  HttpApiEndpoint.get("ping", "/ping", { success: Schema.String }),
) {}

class MetaApi extends HttpApi.make("MetaApi").add(MetaGroup).prefix("/meta") {}

const MetaApiLive = HttpApiBuilder.group(MetaApi, "meta", (handlers) =>
  handlers.handle("ping", () => Effect.succeed("pong")),
);

const withTestHeader: HttpMiddleware.HttpMiddleware = (httpApp) =>
  Effect.map(httpApp, (response) =>
    HttpServerResponse.setHeader(response, "x-confect-middleware", "applied"),
  );

const http = ConfectHttpRouter.make(
  Layer.mergeAll(
    HttpApiBuilder.layer(NotesApi).pipe(Layer.provide(NotesApiLive)),
    HttpApiBuilder.layer(MetaApi).pipe(Layer.provide(MetaApiLive)),
    HttpApiScalar.layer(NotesApi, { path: "/api/docs" }),
    HttpRouter.add("GET", "/health", HttpServerResponse.text("OK")),
    HttpRouter.middleware(withTestHeader, { global: true }),
  ),
);

// A plain Convex route on the same router: Convex matches exact paths before
// the catch-all path prefix, so this bypasses the Effect router entirely.
http.route({
  path: "/convex-native",
  method: "GET",
  handler: httpActionGeneric(() =>
    Promise.resolve(new Response("native", { status: 200 })),
  ),
});

export default http;
