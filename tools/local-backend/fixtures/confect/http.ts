import { HttpRouter as ConfectHttpRouter } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import { ExecutionMetadata, RequestMetadata } from "./_generated/services";

export default ConfectHttpRouter.make(
  Layer.mergeAll(
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
