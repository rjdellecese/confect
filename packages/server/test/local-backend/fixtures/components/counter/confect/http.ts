import { HttpRouter as ConfectHttpRouter } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Predicate from "effect/Predicate";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import schema from "./_generated/schema";
import { ActionCtx } from "./_generated/services";

export default ConfectHttpRouter.forSchema(schema)(
  Layer.mergeAll(
    HttpRouter.add(
      "GET",
      "/health",
      Effect.map(ActionCtx, (ctx) =>
        HttpServerResponse.text(
          Predicate.hasProperty(ctx, "auth")
            ? "unexpected-auth"
            : "component-ready",
        ),
      ),
    ),
    HttpRouter.add(
      "POST",
      "/echo",
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        return HttpServerResponse.text(yield* request.text);
      }),
    ),
  ),
);
