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
import * as ConfigProvider from "effect/ConfigProvider";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import * as Record from "effect/Record";
import type * as HttpMiddleware from "effect/unstable/http/HttpMiddleware";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServer from "effect/unstable/http/HttpServer";
import type * as HttpApi from "effect/unstable/httpapi/HttpApi";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";
import * as HttpApiScalar from "effect/unstable/httpapi/HttpApiScalar";
import * as ActionCtx from "./ActionCtx";
import * as ActionRunner from "./ActionRunner";
import * as Auth from "./Auth";
import * as ConvexConfigProvider from "./ConvexConfigProvider";
import * as MutationRunner from "./MutationRunner";
import * as QueryRunner from "./QueryRunner";
import * as Scheduler from "./Scheduler";
import { StorageActionWriter } from "./StorageActionWriter";
import { StorageReader } from "./StorageReader";
import { StorageWriter } from "./StorageWriter";

/**
 * Request-level middleware applied to the handler effect (Effect v4's
 * `HttpMiddleware` shape). Replaces the v3 `HttpApp`-wrapping middleware.
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
 * An Effect `HttpApi` mounted at a path prefix.
 *
 * Effect v4 has no `HttpApi.Api` service, so the API definition can no longer
 * be tunneled through a layer: `api` carries the `HttpApi` definition (used to
 * register routes and to derive the OpenAPI document for the Scalar docs
 * page), and `apiLive` provides the group handler services built with
 * `HttpApiBuilder.group(api, ...)`. Handlers may use any
 * {@link ConfectHttpServices}, whether required directly by the group layer or
 * surfaced as request-level `Requires` markers.
 */
export type HttpApi_ = {
  api: HttpApi.Any;
  apiLive: Layer.Layer<
    any,
    never,
    ConfectHttpServices | HttpRouter.Request<"Requires", ConfectHttpServices>
  >;
  middleware?: Middleware;
  scalar?: HttpApiScalar.ScalarConfig;
};

export type RoutePath = "/" | `/${string}/`;

const makeHandler =
  <DataModel extends GenericDataModel>({
    pathPrefix,
    api,
    apiLive,
    middleware,
    scalar,
  }: HttpApi_ & { pathPrefix: RoutePath }) =>
  (ctx: GenericActionCtx<DataModel>, request: Request): Promise<Response> => {
    const ConfectServicesLive = Layer.mergeAll(
      QueryRunner.layer(ctx.runQuery),
      MutationRunner.layer(ctx.runMutation),
      ActionRunner.layer(ctx.runAction),
      Scheduler.layer(ctx.scheduler),
      Auth.layer(ctx.auth),
      StorageReader.layer(ctx.storage),
      StorageWriter.layer(ctx.storage),
      StorageActionWriter.layer(ctx.storage),
      Layer.succeed(ActionCtx.ActionCtx<DataModel>(), ctx),
      Layer.succeed(ConfigProvider.ConfigProvider, ConvexConfigProvider.make()),
    );

    const apiDefinition = api as HttpApi.AnyWithProps;

    const AppLayer = Layer.mergeAll(
      HttpApiBuilder.layer(apiDefinition),
      HttpApiScalar.layer(apiDefinition, {
        path: `${pathPrefix}docs`,
        scalar: {
          baseServerURL: `${process.env["CONVEX_SITE_URL"]}${pathPrefix}`,
          ...scalar,
        },
      }),
    ).pipe(
      Layer.provide(apiLive),
      Layer.provide(ConfectServicesLive),
      Layer.provide(HttpServer.layerServices),
    );

    // Endpoint-handler requirements are baked into the routes when the group
    // layer builds (`HttpApiBuilder.group` captures its build context and
    // provides it to every handler), so any request-level `Requires` markers
    // left in the layer type are already satisfied at runtime — drop them so
    // the web handler doesn't demand a per-request context.
    const { handler } = HttpRouter.toWebHandler(
      AppLayer as Layer.Layer<never, never, never>,
      {
        disableLogger: true,
        ...(middleware ? { middleware } : {}),
      },
    );

    return handler(request, Context.empty() as Context.Context<any>);
  };

const makeHttpAction = <DataModel extends GenericDataModel>(
  options: HttpApi_ & { pathPrefix: RoutePath },
) =>
  httpActionGeneric(
    makeHandler<DataModel>(options) as unknown as (
      ctx: GenericActionCtx<GenericDataModel>,
      request: Request,
    ) => Promise<Response>,
  );

const mountEffectHttpApi =
  <DataModel extends GenericDataModel>(
    options: HttpApi_ & { pathPrefix: RoutePath },
  ) =>
  (convexHttpRouter: ConvexHttpRouter): ConvexHttpRouter => {
    const handler = makeHttpAction<DataModel>(options);

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
