import { HttpRouter as ConfectHttpRouter } from "@confect/server";
import { flow } from "effect/Function";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpMiddleware from "effect/unstable/http/HttpMiddleware";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";
import * as HttpApiScalar from "effect/unstable/httpapi/HttpApiScalar";
import { Api, ApiLive } from "./http/pathPrefix";

const ApiRoutes = HttpApiBuilder.layer(Api).pipe(Layer.provide(ApiLive));

const DocsRoutes = Layer.unwrap(
  Effect.gen(function* () {
    const siteUrl = yield* Effect.orDie(Config.string("CONVEX_SITE_URL"));

    return HttpApiScalar.layer(Api, {
      path: "/path-prefix/docs",
      scalar: { baseServerURL: siteUrl },
    });
  }),
);

export default ConfectHttpRouter.make(
  Layer.mergeAll(
    ApiRoutes,
    DocsRoutes,
    HttpRouter.add("GET", "/health", HttpServerResponse.text("OK")),
    HttpRouter.middleware(flow(HttpMiddleware.cors(), HttpMiddleware.logger), {
      global: true,
    }),
  ),
);
