import { HttpRouter as ConfectHttpRouter } from "@confect/server";
import * as Effect from "effect/Effect";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { ExecutionMetadata, RequestMetadata } from "./_generated/services";

export default ConfectHttpRouter.make(
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
);
