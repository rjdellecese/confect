import {
  type HttpRouter as ConvexHttpRouter,
  httpActionGeneric,
  httpRouter,
  ROUTABLE_HTTP_METHODS,
  type RouteSpecWithPathPrefix,
  type GenericActionCtx,
  type GenericDataModel,
} from "convex/server";
import * as Array from "effect/Array";
import * as Config from "effect/Config";
import * as Console from "effect/Console";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import type * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Str from "effect/String";
import type * as Etag from "effect/http/Etag";
import type * as HttpPlatform from "effect/http/HttpPlatform";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpServer from "effect/http/HttpServer";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import type * as ActionRunner from "./ActionRunner";
import type * as Auth from "./Auth";
import * as DatabaseSchema from "./DatabaseSchema";
import type * as DataModel from "./DataModel";
import type * as Handler from "./Handler";
import type { ExecutionMetadata } from "./ExecutionMetadata";
import type { RequestMetadata } from "./RequestMetadata";
import * as ConvexConfigProvider from "./ConvexConfigProvider";
import * as ConvexLogger from "./ConvexLogger";
import type * as MutationRunner from "./MutationRunner";
import type * as QueryRunner from "./QueryRunner";
import * as RegisteredFunction from "./RegisteredFunction";
import type * as Scheduler from "./Scheduler";
import type * as Storage from "./Storage";
import type * as StorageActionWriter from "./StorageActionWriter";
import type * as StorageReader from "./StorageReader";
import type * as StorageWriter from "./StorageWriter";
import type * as VectorSearch from "./VectorSearch";

/**
 * Services available to HTTP handlers and middleware from the request's action
 * context, excluding the raw context itself. The schema type adds vector search
 * and specializes the services: components use scoped IDs and do not receive
 * application authentication.
 *
 * @category Context
 */
export type Services<
  DatabaseSchema_ extends DatabaseSchema.AnyWithProps = never,
> =
  | QueryRunner.QueryRunner
  | MutationRunner.MutationRunner
  | ActionRunner.ActionRunner
  | Scheduler.ForScope<DatabaseSchema.Scope<DatabaseSchema_>>
  | Auth.ForTarget<DatabaseSchema_["target"]>
  | ExecutionMetadata
  | RequestMetadata
  | Storage.ForScope<DatabaseSchema.Scope<DatabaseSchema_>>
  | StorageReader.ForScope<DatabaseSchema.Scope<DatabaseSchema_>>
  | StorageWriter.ForScope<DatabaseSchema.Scope<DatabaseSchema_>>
  | StorageActionWriter.ForScope<DatabaseSchema.Scope<DatabaseSchema_>>
  | {
      [Key in keyof DatabaseSchema_]: VectorSearch.VectorSearch<
        DataModel.FromDatabaseSchema<DatabaseSchema_>
      >;
    }[DatabaseSchema.TypeId];

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
> = RoutesWithServices<Services<DatabaseSchema_>>;

type RoutesWithServices<Services_> = Layer.Layer<
  never,
  never,
  | HttpRouter.HttpRouter
  | Etag.Generator
  | FileSystem.FileSystem
  | HttpPlatform.HttpPlatform
  | Path.Path
  | HttpRouter.Request<"Requires", Services_>
  | HttpRouter.Request<"GlobalRequires", Services_>
  | HttpRouter.Request<"Error", any>
  | HttpRouter.Request<"GlobalError", any>
>;

/**
 * Creates a Convex HTTP router for an application's Effect routes. It registers
 * a catch-all HTTP action at `/` for every routable method; the Effect router
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
 * @see {@link forSchema} for routes mounted by a component.
 */
export const make = <DatabaseSchema_ extends DatabaseSchema.AnyApp = never>(
  routes: Routes<DatabaseSchema_>,
): ConvexHttpRouter =>
  forSchema<DatabaseSchema_>(DatabaseSchema.appTarget)(routes);

/**
 * Creates an HTTP router for an application or component with the action
 * services of its database schema, including the generated `ActionCtx` and
 * `VectorSearch` tags.
 *
 * **Details**
 *
 * In a component, import `schema` as a type from `./_generated/schema` and
 * `target` as a value from `./_generated/id`, then call `forSchema<typeof
 * schema>(target)(routes)`. This does not load the table registry. Component
 * handlers use scoped IDs and do not receive `Auth`.
 *
 * **Gotchas**
 *
 * Mount the component router through Convex in the parent. Declare the
 * component's routes relative to that mount: a route at `/health` mounted under
 * `/counter` serves `/counter/health`.
 *
 * @category Constructors
 *
 * @see {@link make} for application routes that do not need the raw action context.
 */
export const forSchema =
  <DatabaseSchema_ extends DatabaseSchema.AnyWithProps>(
    target: DatabaseSchema_["target"],
  ) =>
  (
    routes: RoutesWithServices<Handler.ActionServices<DatabaseSchema_>>,
  ): ConvexHttpRouter =>
    makeWithLayer<
      Handler.ActionServices<DatabaseSchema_>,
      DataModel.ToConvexDataModel<DataModel.FromDatabaseSchema<DatabaseSchema_>>
    >(
      Match.value(DatabaseSchema.checkedTarget(target).kind).pipe(
        Match.when("app", () => routes),
        Match.when("component", () =>
          routes.pipe(Layer.provide(componentMount)),
        ),
        Match.exhaustive,
      ),
      (ctx) => RegisteredFunction.actionLayer<DatabaseSchema_>(ctx, target),
    );

// Convex uses a component-relative path to select its HTTP action but passes
// the original request URL to that action. Its CONVEX_SITE_URL includes the
// installation's full, literal mount path (including parent mounts).
const componentMount = HttpRouter.middleware(
  Config.schema(Schema.URLFromString, "CONVEX_SITE_URL").pipe(
    Effect.orDie,
    Effect.map((siteUrl) => {
      const prefix = Str.replace(/\/$/, "")(siteUrl.pathname);
      return (handler) =>
        Effect.updateService(
          handler,
          HttpServerRequest.HttpServerRequest,
          (request) => {
            const relative = Str.slice(prefix.length)(request.url);
            return request.modify({
              url: Str.startsWith("/")(relative) ? relative : "/" + relative,
            });
          },
        );
    }),
  ),
  { global: true },
);

const makeWithLayer = <Services_, DataModel_ extends GenericDataModel>(
  routes: RoutesWithServices<Services_>,
  layer: (ctx: GenericActionCtx<DataModel_>) => Layer.Layer<Services_>,
): ConvexHttpRouter => {
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
    // Convex's HTTP registration erases the data model. The generated schema type
    // restores it; this does not change the runtime context or services.
    const services = layer(ctx as unknown as GenericActionCtx<DataModel_>).pipe(
      Layer.build,
      Effect.scoped,
      Effect.runSync,
    );
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
