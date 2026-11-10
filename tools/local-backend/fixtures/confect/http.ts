import { HttpRouter as ConfectHttpRouter } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as HttpApi from "effect/http-api/HttpApi";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint";
import * as HttpApiGroup from "effect/http-api/HttpApiGroup";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import {
  ExecutionMetadata,
  RequestMetadata,
  VectorSearch,
} from "./_generated/services";
import databaseSchema from "./_generated/schema";
import { Id } from "./_generated/id";

const search = Effect.fn("http.vectorSearch")(function* (caseId: string) {
  const vectorSearch = yield* VectorSearch;
  return yield* vectorSearch("httpVectors", "embedding", {
    vector: [1, 0, 0],
    limit: 10,
    filter: (q) => q.eq("caseId", caseId),
  });
});

const searchQuery = Schema.Struct({ caseId: Schema.String });

class VectorApi extends HttpApi.make("VectorApi").add(
  HttpApiGroup.make("vectors").add(
    HttpApiEndpoint.get("search", "/api/vector-search", {
      query: searchQuery,
      success: Schema.Array(
        Schema.Struct({ _id: Id("httpVectors"), _score: Schema.Finite }),
      ),
    }),
  ),
) {}

const VectorApiLive = HttpApiBuilder.group(VectorApi, "vectors", (handlers) =>
  handlers.handle("search", ({ query }) => search(query.caseId)),
);

export default ConfectHttpRouter.make(
  databaseSchema,
  Layer.mergeAll(
    HttpApiBuilder.layer(VectorApi).pipe(Layer.provide(VectorApiLive)),
    HttpRouter.add(
      "GET",
      "/vector-search",
      Effect.gen(function* () {
        const { caseId } =
          yield* HttpServerRequest.schemaSearchParams(searchQuery);
        const matches = yield* search(caseId);
        return yield* HttpServerResponse.json(matches);
      }),
    ),
    HttpRouter.add(
      "GET",
      "/large-stream",
      HttpServerResponse.stream(
        Stream.range(0, 99, 1).pipe(
          Stream.map(() => new Uint8Array(1024 * 1024).fill(120)),
        ),
        { contentType: "application/octet-stream" },
      ),
    ),
    HttpRouter.add(
      "GET",
      "/context-metadata",
      Effect.gen(function* () {
        const execution = yield* ExecutionMetadata;
        const request = yield* RequestMetadata;
        const fn = yield* execution.getFunction();
        const deployment = yield* execution.getDeployment();
        const metadata = yield* request.get();
        return yield* HttpServerResponse.json({
          functionName: fn.name,
          deploymentName: deployment.name,
          requestId: metadata.requestId,
        });
      }),
    ),
  ),
);
