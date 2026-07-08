import {
  type HttpRouter as ConvexHttpRouter,
  type GenericActionCtx,
  type GenericDataModel,
  httpActionGeneric,
  httpRouter,
  ROUTABLE_HTTP_METHODS,
  type RouteSpecWithPathPrefix,
} from "convex/server";
import { pipe } from "effect/Function";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Record from "effect/Record";
import type * as HttpMiddleware from "effect/unstable/http/HttpMiddleware";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServer from "effect/unstable/http/HttpServer";
import type * as HttpApi from "effect/unstable/httpapi/HttpApi";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";
import type * as HttpApiGroup from "effect/unstable/httpapi/HttpApiGroup";
import * as HttpApiScalar from "effect/unstable/httpapi/HttpApiScalar";
import type * as ActionRunner from "./ActionRunner";
import type * as Auth from "./Auth";
import * as ConvexConfigProvider from "./ConvexConfigProvider";
import type * as MutationRunner from "./MutationRunner";
import type * as QueryRunner from "./QueryRunner";
import * as RegisteredFunction from "./RegisteredFunction";
import type * as Scheduler from "./Scheduler";
import type { StorageActionWriter } from "./StorageActionWriter";
import type { StorageReader } from "./StorageReader";
import type { StorageWriter } from "./StorageWriter";

/**
 * Middleware applied to every route of a mounted API. Registered as global
 * route middleware, so returned response modifications take effect and the
 * middleware runs with Confect's services (including the Convex-aware
 * `ConfigProvider`) in context. See Effect's `HttpMiddleware` module for
 * built-in middleware such as `cors` and `logger`.
 */
export type Middleware = HttpMiddleware.HttpMiddleware;

/**
 * The Confect services available to `HttpApi` endpoint handlers.
 */
type ConfectHttpServices =
  | QueryRunner.QueryRunner
  | MutationRunner.MutationRunner
  | ActionRunner.ActionRunner
  | Scheduler.Scheduler
  | Auth.Auth
  | StorageReader
  | StorageWriter
  | StorageActionWriter;

/**
 * Options for {@link mount}: an Effect `HttpApi` definition paired with its
 * group handler layers.
 *
 * `api` is used to register routes and to derive the OpenAPI document for the
 * Scalar docs page. `apiLive` provides the group handler services built with
 * `HttpApiBuilder.group(api, ...)` — one per group in `api`, merged with
 * `Layer.mergeAll` when there are several. Handlers may require any
 * {@link ConfectHttpServices}, which Confect supplies per request; group
 * *construction* (an effectful `HttpApiBuilder.group` build) cannot use them,
 * since groups are built with the layer, before any request's services exist.
 */
export interface MountOptions<
  Id extends string,
  Groups extends HttpApiGroup.Any,
> {
  api: HttpApi.HttpApi<Id, Groups>;
  apiLive: Layer.Layer<
    HttpApiGroup.ToService<Id, Groups>,
    never,
    HttpRouter.Request<"Requires", ConfectHttpServices>
  >;
  middleware?: Middleware;
  scalar?: HttpApiScalar.ScalarConfig;
}

/**
 * An API entry accepted by {@link make}, with the `api`/`apiLive` pairing
 * erased. Build entries with {@link mount}, which checks that `apiLive`
 * provides a group handler layer for every group in `api` — a mismatch
 * otherwise only surfaces as a defect on the first request.
 */
export type HttpApi_ = {
  api: HttpApi.Any;
  apiLive: Layer.Layer<any, never, any>;
  middleware?: Middleware;
  scalar?: HttpApiScalar.ScalarConfig;
};

/**
 * Pair an `HttpApi` definition with its group handler layers, checking at
 * compile time that every group declared by `api` has a corresponding
 * `HttpApiBuilder.group` layer in `apiLive`.
 */
export const mount = <Id extends string, Groups extends HttpApiGroup.Any>(
  options: MountOptions<Id, Groups>,
): HttpApi_ => options as HttpApi_;

export type RoutePath = "/" | `/${string}/`;

const makeHandler = ({
  pathPrefix,
  api,
  apiLive,
  middleware,
  scalar,
}: HttpApi_ & { pathPrefix: RoutePath }) => {
  const apiDefinition = api as HttpApi.AnyWithProps;

  // Everything request-independent — route registration, OpenAPI/Scalar
  // derivation, platform services — lives in one layer that the web handler
  // builds lazily on its first call and reuses for the lifetime of the JS
  // environment. The Convex runtime evaluates modules in a fresh environment
  // for every HTTP action request, so there that lifetime is a single
  // request; the reuse materializes where an environment serves many requests
  // (e.g. convex-test). `Layer.suspend` defers the `process.env` read to that
  // first build.
  const AppLayer = Layer.suspend(() =>
    Layer.mergeAll(
      HttpApiBuilder.layer(apiDefinition),
      HttpApiScalar.layer(apiDefinition, {
        path: `${pathPrefix}docs`,
        scalar: {
          baseServerURL: `${process.env["CONVEX_SITE_URL"]}${pathPrefix}`,
          ...scalar,
        },
      }),
      ...Array.map(Array.fromNullishOr(middleware), (middleware_) =>
        HttpRouter.middleware(middleware_, { global: true }),
      ),
      // Merged (not just provided) so it is part of the built context that
      // request fibers — endpoint handlers and middleware alike — run in.
      ConvexConfigProvider.layer,
    ).pipe(Layer.provide(apiLive), Layer.provide(HttpServer.layerServices)),
  );

  // Handlers' Confect service requirements surface as request-level
  // `Requires` markers on the layer, which the web handler exposes as a
  // per-request context argument.
  const { handler } = HttpRouter.toWebHandler(
    AppLayer as Layer.Layer<
      never,
      never,
      HttpRouter.Request<"Requires", ConfectHttpServices>
    >,
    { disableLogger: true },
  );

  return (
    ctx: GenericActionCtx<GenericDataModel>,
    request: Request,
  ): Promise<Response> => {
    // The ctx-backed service layers are all synchronous and finalizer-free,
    // so the scope can close as soon as the context is built.
    const services = Effect.runSync(
      Effect.scoped(Layer.build(RegisteredFunction.baseActionLayer(ctx))),
    );
    return handler(request, services);
  };
};

const mountEffectHttpApi =
  (options: HttpApi_ & { pathPrefix: RoutePath }) =>
  (convexHttpRouter: ConvexHttpRouter): ConvexHttpRouter => {
    const handler = httpActionGeneric(makeHandler(options));

    Array.forEach(ROUTABLE_HTTP_METHODS, (method) => {
      const routeSpec: RouteSpecWithPathPrefix = {
        pathPrefix: options.pathPrefix,
        method,
        handler,
      };
      convexHttpRouter.route(routeSpec);
    });

    return convexHttpRouter;
  };

type HttpApis = Partial<Record<RoutePath, HttpApi_>>;

export const make = (httpApis: HttpApis): ConvexHttpRouter => {
  applyMonkeyPatches();

  return pipe(
    httpApis as Record<RoutePath, HttpApi_>,
    Record.toEntries,
    Array.reduce(httpRouter(), (convexHttpRouter, [pathPrefix, httpApi]) =>
      mountEffectHttpApi({
        ...httpApi,
        pathPrefix: pathPrefix as RoutePath,
      })(convexHttpRouter),
    ),
  );
};

const applyMonkeyPatches = () => {
  // These are necessary until the Convex runtime supports these APIs. See https://discord.com/channels/1019350475847499849/1281364098419785760

  // eslint-disable-next-line no-global-assign
  URL = class extends URL {
    override get username() {
      return "";
    }
    override get password() {
      return "";
    }
  };

  Object.defineProperty(Request.prototype, "signal", {
    get: () => new AbortSignal(),
  });
};
