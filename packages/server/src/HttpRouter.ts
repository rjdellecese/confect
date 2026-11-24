import {
  httpActionGeneric,
  httpRouter,
  ROUTABLE_HTTP_METHODS,
} from "convex/server";
import type {
  GenericActionCtx,
  HttpRouter as HttpRouter_,
  RouteSpecWithPathPrefix,
} from "convex/server";
import * as Array from "effect/Array";
import * as Console from "effect/Console";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import type * as Path from "effect/Path";
import type * as Etag from "effect/http/Etag";
import type * as HttpPlatform from "effect/http/HttpPlatform";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpServer from "effect/http/HttpServer";
import type * as ActionRunner from "./ActionRunner";
import type * as Auth from "./Auth";
import type * as DatabaseSchema from "./DatabaseSchema";
import type * as DataModel from "./DataModel";
import type { ExecutionMetadata } from "./ExecutionMetadata";
import type { RequestMetadata } from "./RequestMetadata";
import * as ConvexConfigProvider from "./ConvexConfigProvider";
import * as ConvexLogger from "./ConvexLogger";
import type * as MutationRunner from "./MutationRunner";
import type * as QueryRunner from "./QueryRunner";
import * as RegisteredFunction from "./RegisteredFunction";
import type * as Scheduler from "./Scheduler";
import type { Storage } from "./Storage";
import type { StorageActionWriter } from "./StorageActionWriter";
import type { StorageReader } from "./StorageReader";
import type { StorageWriter } from "./StorageWriter";
import type * as VectorSearch from "./VectorSearch";

type WithSchema<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps,
  Service,
> = {
  [Key in keyof DatabaseSchema_]: Service;
}[DatabaseSchema.TypeId];

/**
 * Confect service requirements that an HTTP route handler or its middleware can
 * leave to the router. The services come from the current request's Convex
 * action context; supplying the application schema type includes its vector
 * search service.
 *
 * @category Context
 */
export type Services<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps = never,
> =
  | QueryRunner.QueryRunner
  | MutationRunner.MutationRunner
  | ActionRunner.ActionRunner
  | Scheduler.Scheduler
  | Auth.Auth
  | ExecutionMetadata
  | RequestMetadata
  | Storage
  | StorageReader
  | StorageWriter
  | StorageActionWriter
  | WithSchema<
      DatabaseSchema_,
      VectorSearch.VectorSearch<DataModel.FromDatabaseSchema<DatabaseSchema_>>
    >;

/**
 * Route registration layer accepted by {@link make}. Handlers and middleware
 * can require the Confect {@link Services} that the router supplies per
 * request.
 *
 * **Details**
 *
 * Compose route layers from `effect/http` and `effect/http-api` with
 * `Layer.mergeAll`. Use `HttpApiBuilder.layer(api)` for an API,
 * `HttpRouter.add` for plain routes, `HttpApiScalar.layer` for interactive
 * documentation, and `HttpRouter.middleware(fn, { global: true })` for
 * middleware shared by all routes. Convex environment configuration is
 * available while these layers are built and while handlers run.
 *
 * **Gotchas**
 *
 * Supply each API group's handler layer with `Layer.provide` before mounting
 * the API. A missing group leaves an unsatisfied requirement and the route
 * layer fails to typecheck.
 *
 * @category Layers
 */
export type Routes<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps = never,
> = Layer.Layer<
  never,
  never,
  | HttpRouter.HttpRouter
  | Etag.Generator
  | FileSystem.FileSystem
  | HttpPlatform.HttpPlatform
  | Path.Path
  | HttpRouter.Request<"Requires", Services<DatabaseSchema_>>
  | HttpRouter.Request<"GlobalRequires", Services<DatabaseSchema_>>
  | HttpRouter.Request<"Error", unknown>
  | HttpRouter.Request<"GlobalError", unknown>
>;

/**
 * Creates a Convex HTTP router that serves Effect routes. It registers a
 * catch-all HTTP action at `/` for every routable method; the Effect router
 * matches the path and returns a 404 if no route matches.
 *
 * **Details**
 *
 * Use absolute route paths or `HttpApi.prefix` to mount an API under a prefix.
 * Native Convex routes added to the returned router take precedence when they
 * match an exact path or a longer prefix.
 *
 * @category Constructors
 *
 * @param routes - Layer that registers routes and supplies group handlers. Use
 *   `make<typeof schema>(routes)` with a type-only schema import when a handler
 *   or middleware requires schema-typed vector search.
 *
 * @returns A native Convex router for the default export of `confect/http.ts`.
 *
 * @see {@link Routes} for the layer requirements.
 */
export const make = <DatabaseSchema_ extends DatabaseSchema.AnyWithProps>(
  routes: Routes<DatabaseSchema_>,
): HttpRouter_ => {
  applyMonkeyPatches();

  // Provided (not just merged) so that route layers' own construction—e.g.
  // a `Layer.unwrap` reading `Config`—resolves configuration through the
  // Convex-aware provider; merged so that request fibers—endpoint handlers
  // and middleware—do too.
  const AppLayer = routes.pipe(
    Layer.provideMerge(ConvexLogger.layer),
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
    const services = RegisteredFunction.actionLayer<DatabaseSchema_>(
      ctx as unknown as GenericActionCtx<
        DataModel.ToConvexDataModel<
          DataModel.FromDatabaseSchema<DatabaseSchema_>
        >
      >,
    ).pipe(Layer.build, Effect.scoped, Effect.runSync);
    return handler(
      request,
      Context.add(services, Console.Console, globalThis.console),
    );
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
// with working implementations—Node under convex-test, notably, where
// `new AbortSignal()` is an illegal constructor—keep their native behavior.
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
    // `configurable` so repeated definition—e.g. module re-evaluation in a
    // long-lived environment—does not throw.
    Object.defineProperty(Request.prototype, "signal", {
      get: () => new AbortSignal(),
      configurable: true,
    });
  }
};
