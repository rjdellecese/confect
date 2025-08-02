import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
  OpenApi,
} from "@effect/platform";

import { Effect, Layer, Schema } from "effect";
import { makeConvexHttpRouter } from "../../src/server";

// root

const ApiGroup = HttpApiGroup.make("apiGroup").add(
  HttpApiEndpoint.get("get", "/get")
    .addSuccess(Schema.Literal("Hello, world!"))
    .annotate(OpenApi.Title, "Get"),
);

class Api extends HttpApi.make("Api").add(ApiGroup) {}

const ApiGroupLive = HttpApiBuilder.group(Api, "apiGroup", (handlers) =>
  handlers.handle("get", () => Effect.succeed("Hello, world!" as const)),
);

const ApiLive = HttpApiBuilder.api(Api).pipe(Layer.provide(ApiGroupLive));

// path-prefix

const ApiGroupPathPrefix = HttpApiGroup.make("apiGroupPathPrefix")
  .add(
    HttpApiEndpoint.get("get", "/get")
      .addSuccess(Schema.Literal("Hello, world!"))
      .annotate(OpenApi.Title, "Get"),
  )
  .prefix("/path-prefix");

class ApiPathPrefix extends HttpApi.make("ApiPathPrefix").add(
  ApiGroupPathPrefix,
) {}

const ApiGroupPathPrefixLive = HttpApiBuilder.group(
  ApiPathPrefix,
  "apiGroupPathPrefix",
  (handlers) =>
    handlers.handle("get", () => Effect.succeed("Hello, world!" as const)),
);

const ApiPathPrefixLive = HttpApiBuilder.api(ApiPathPrefix).pipe(
  Layer.provide(ApiGroupPathPrefixLive),
);

// router

export default makeConvexHttpRouter({
  "/": {
    apiLive: ApiLive,
  },
  "/path-prefix/": {
    apiLive: ApiPathPrefixLive,
  },
});
