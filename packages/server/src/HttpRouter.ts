import {
  type HttpRouter as ConvexHttpRouter,
  httpActionGeneric,
  httpRouter,
  ROUTABLE_HTTP_METHODS,
  type RouteSpecWithPathPrefix,
} from "convex/server";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import type * as Path from "effect/Path";
import type * as Etag from "effect/unstable/http/Etag";
import type * as HttpPlatform from "effect/unstable/http/HttpPlatform";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServer from "effect/unstable/http/HttpServer";
import type * as ActionRunner from "./ActionRunner";
import type * as Auth from "./Auth";
import * as ConvexConfigProvider from "./ConvexConfigProvider";
import { runSyncInIsolate } from "./internal/runSyncInIsolate";
import type * as MutationRunner from "./MutationRunner";
import type * as QueryRunner from "./QueryRunner";
import * as RegisteredFunction from "./RegisteredFunction";
import type * as Scheduler from "./Scheduler";
import type { StorageActionWriter } from "./StorageActionWriter";
import type { StorageReader } from "./StorageReader";
import type { StorageWriter } from "./StorageWriter";

/**
 * The Confect services available to HTTP route handlers and middleware,
 * supplied per request from the Convex action context.
 */
export type Services =
  | QueryRunner.QueryRunner
  | MutationRunner.MutationRunner
  | ActionRunner.ActionRunner
  | Scheduler.Scheduler
  | Auth.Auth
  | StorageReader
  | StorageWriter
  | StorageActionWriter;

/**
 * A layer that registers routes on the HTTP router — the input to
 * {@link make}.
 *
 * Compose it from Effect's `effect/unstable/http` and
 * `effect/unstable/httpapi` modules: `HttpApiBuilder.layer(api)` registers an
 * `HttpApi`'s endpoints (provide its group handler layers with
 * `Layer.provide`), `HttpApiScalar.layer(api, ...)` serves interactive API
 * docs, `HttpRouter.add` registers a plain route, and
 * `HttpRouter.middleware(fn, { global: true })` applies middleware to every
 * route. Merge any number of these with `Layer.mergeAll`.
 *
 * Route handlers and middleware may require any of the Confect
 * {@link Services}, which surface as request-level `Requires` markers and are
 * supplied per request. Anything else the layer requires is a type error —
 * notably, an `HttpApiBuilder.layer(api)` whose group handler layers are not
 * provided leaves an `HttpApiGroup.ToService` requirement behind, so a missing
 * handler group is caught at compile time.
 *
 * Layers are built with Confect's Convex-aware `ConfigProvider` in context, so
 * `Config` reads (e.g. in `Layer.unwrap`) resolve against Convex environment
 * variables.
 */
export type Routes = Layer.Layer<
  never,
  never,
  | HttpRouter.HttpRouter
  | Etag.Generator
  | FileSystem.FileSystem
  | HttpPlatform.HttpPlatform
  | Path.Path
  | HttpRouter.Request<"Requires", Services>
  | HttpRouter.Request<"GlobalRequires", Services>
  | HttpRouter.Request<"Error", any>
  | HttpRouter.Request<"GlobalError", any>
>;

/**
 * Create a Convex HTTP router serving the given routes.
 *
 * A single catch-all `httpAction` is registered for every routable method
 * under the path prefix `"/"`, making the Effect router the single source of
 * truth for paths: place an API with `HttpApi.prefix` or absolute route
 * paths. Requests that match no route receive the Effect router's 404
 * response.
 *
 * Plain Convex routes can still be added to the returned router — Convex
 * matches exact paths first and longer path prefixes before the catch-all, so
 * they take precedence.
 */
export const make = (routes: Routes): ConvexHttpRouter => {
  applyMonkeyPatches();

  // Provided (not just merged) so that route layers' own construction — e.g.
  // a `Layer.unwrap` reading `Config` — resolves configuration through the
  // Convex-aware provider; merged so that request fibers — endpoint handlers
  // and middleware — do too.
  const AppLayer = routes.pipe(
    Layer.provideMerge(ConvexConfigProvider.layer),
    Layer.provide(HttpServer.layerServices),
  );

  // The Confect service requirements of route handlers and middleware surface
  // as request-level `Requires` markers on the layer, which the web handler
  // exposes as a per-request context argument.
  const { handler } = HttpRouter.toWebHandler(AppLayer, {
    disableLogger: true,
  });

  const httpAction = httpActionGeneric((ctx, request): Promise<Response> => {
    // The ctx-backed service layers are all synchronous and finalizer-free,
    // so the scope can close as soon as the context is built.
    const services = runSyncInIsolate(
      Effect.scoped(Layer.build(RegisteredFunction.baseActionLayer(ctx))),
    );
    return handler(request, services);
  });

  const convexHttpRouter = httpRouter();

  Array.forEach(ROUTABLE_HTTP_METHODS, (method) => {
    const routeSpec: RouteSpecWithPathPrefix = {
      pathPrefix: "/",
      method,
      handler: httpAction,
    };
    convexHttpRouter.route(routeSpec);
  });

  return convexHttpRouter;
};

// These are necessary until the Convex runtime supports these APIs. See
// https://discord.com/channels/1019350475847499849/1281364098419785760
// Each patch is applied only where the API is actually broken, so runtimes
// with working implementations — Node under convex-test, notably, where
// `new AbortSignal()` is an illegal constructor — keep their native behavior.
const applyMonkeyPatches = () => {
  const urlCredentialsBroken = (() => {
    try {
      return new URL("https://confect.dev").username === undefined;
    } catch {
      return true;
    }
  })();
  if (urlCredentialsBroken) {
    URL = class extends URL {
      override get username() {
        return "";
      }
      override get password() {
        return "";
      }
    };
  }

  const requestSignalBroken = (() => {
    try {
      return new Request("https://confect.dev").signal === undefined;
    } catch {
      return true;
    }
  })();
  if (requestSignalBroken) {
    // `configurable` so repeated definition — e.g. module re-evaluation in a
    // long-lived environment — does not throw.
    Object.defineProperty(Request.prototype, "signal", {
      get: () => new AbortSignal(),
      configurable: true,
    });
  }
};
