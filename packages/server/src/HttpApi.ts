import { HttpApiScalar } from "effect/unstable/httpapi";
import type * as EffectHttpApi from "effect/unstable/httpapi/HttpApi";
import {
  HttpRouter as EffectHttpRouter,
  HttpServer,
  type Etag,
  type HttpPlatform,
  type HttpServerRequest,
  type HttpServerResponse,
} from "effect/unstable/http";
import {
  type HttpRouter as ConvexHttpRouter,
  type GenericActionCtx,
  type GenericDataModel,
  httpActionGeneric,
  httpRouter,
  ROUTABLE_HTTP_METHODS,
  type RouteSpecWithPathPrefix,
} from "convex/server";
import {
  Array,
  ConfigProvider,
  Context,
  type Effect,
  type FileSystem,
  Layer,
  type Path,
  pipe,
  Record,
} from "effect";
import * as ActionCtx from "./ActionCtx";
import * as ActionRunner from "./ActionRunner";
import * as Auth from "./Auth";
import * as ConvexConfigProvider from "./ConvexConfigProvider";
import * as Meta from "./Meta";
import * as MutationRunner from "./MutationRunner";
import * as QueryRunner from "./QueryRunner";
import * as Scheduler from "./Scheduler";
import { StorageActionWriter } from "./StorageActionWriter";
import { StorageReader } from "./StorageReader";
import { StorageWriter } from "./StorageWriter";

type Middleware = <E, R>(
  httpApp: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>,
) => Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  E,
  R | HttpServerRequest.HttpServerRequest
>;

type ConvexActionServices =
  | QueryRunner.QueryRunner
  | MutationRunner.MutationRunner
  | ActionRunner.ActionRunner
  | Scheduler.Scheduler
  | Auth.Auth
  | Meta.ActionMeta
  | StorageReader
  | StorageWriter
  | StorageActionWriter
  | GenericActionCtx<GenericDataModel>;

type EffectHttpServices =
  | EffectHttpRouter.HttpRouter
  | HttpPlatform.HttpPlatform
  | FileSystem.FileSystem
  | Path.Path
  | Etag.Generator;

type RequestScopedConvexActionServices =
  | EffectHttpRouter.Request<"Requires", QueryRunner.QueryRunner>
  | EffectHttpRouter.Request<"Requires", MutationRunner.MutationRunner>
  | EffectHttpRouter.Request<"Requires", ActionRunner.ActionRunner>
  | EffectHttpRouter.Request<"Requires", Scheduler.Scheduler>
  | EffectHttpRouter.Request<"Requires", Auth.Auth>
  | EffectHttpRouter.Request<"Requires", Meta.ActionMeta>
  | EffectHttpRouter.Request<"Requires", StorageReader>
  | EffectHttpRouter.Request<"Requires", StorageWriter>
  | EffectHttpRouter.Request<"Requires", StorageActionWriter>
  | EffectHttpRouter.Request<"Requires", GenericActionCtx<GenericDataModel>>;

type HttpApiLive = Layer.Layer<
  never,
  never,
  ConvexActionServices | EffectHttpServices | RequestScopedConvexActionServices
>;

const makeHandler =
  ({
    api,
    pathPrefix,
    apiLive,
    middleware,
    scalar,
  }: {
    api: EffectHttpApi.AnyWithProps;
    pathPrefix: RoutePath;
    apiLive: HttpApiLive;
    middleware?: Middleware;
    scalar?: HttpApiScalar.ScalarConfig;
  }) =>
  (
    ctx: GenericActionCtx<GenericDataModel>,
    request: Request,
  ): Promise<Response> => {
    const ActionServicesLive = Layer.mergeAll(
      QueryRunner.layer(ctx.runQuery),
      MutationRunner.layer(ctx.runMutation),
      ActionRunner.layer(ctx.runAction),
      Scheduler.layer(ctx.scheduler),
      Auth.layer(ctx.auth),
      Meta.ActionMeta.layer(ctx.meta),
      StorageReader.layer(ctx.storage),
      StorageWriter.layer(ctx.storage),
      StorageActionWriter.layer(ctx.storage),
      Layer.succeed(ActionCtx.ActionCtx<GenericDataModel>(), ctx),
    );

    const ApiLive = apiLive.pipe(
      Layer.provide(ActionServicesLive),
      EffectHttpRouter.provideRequest(ActionServicesLive),
    );

    const ApiDocsLive = HttpApiScalar.layer(api, {
      path: `${pathPrefix}docs`,
      scalar: {
        baseServerURL: `${process.env["CONVEX_SITE_URL"]}${pathPrefix}`,
        ...scalar,
      },
    }).pipe(Layer.provide(ApiLive));

    const EnvLive = Layer.mergeAll(ApiLive, ApiDocsLive).pipe(
      Layer.provideMerge(EffectHttpRouter.layer),
      Layer.provideMerge(HttpServer.layerServices),
      Layer.provideMerge(
        Layer.succeed(
          ConfigProvider.ConfigProvider,
          ConvexConfigProvider.make(),
        ),
      ),
    );

    const { handler } = EffectHttpRouter.toWebHandler(
      EnvLive,
      middleware ? { middleware } : {},
    );

    return handler(request, Context.empty() as Context.Context<unknown>);
  };

const makeHttpAction = ({
  api,
  pathPrefix,
  apiLive,
  middleware,
  scalar,
}: {
  api: EffectHttpApi.AnyWithProps;
  pathPrefix: RoutePath;
  apiLive: HttpApiLive;
  middleware?: Middleware;
  scalar?: HttpApiScalar.ScalarConfig;
}) =>
  httpActionGeneric(
    makeHandler({
      api,
      pathPrefix,
      apiLive,
      ...(middleware ? { middleware } : {}),
      ...(scalar ? { scalar } : {}),
    }),
  );

export type HttpApi_ = {
  api: EffectHttpApi.AnyWithProps;
  apiLive: HttpApiLive;
  middleware?: Middleware;
  scalar?: HttpApiScalar.ScalarConfig;
};

export type RoutePath = "/" | `/${string}/`;

const mountEffectHttpApi =
  ({
    api,
    pathPrefix,
    apiLive,
    middleware,
    scalar,
  }: {
    api: EffectHttpApi.AnyWithProps;
    pathPrefix: RoutePath;
    apiLive: HttpApiLive;
    middleware?: Middleware;
    scalar?: HttpApiScalar.ScalarConfig;
  }) =>
  (convexHttpRouter: ConvexHttpRouter): ConvexHttpRouter => {
    const handler = makeHttpAction({
      api,
      pathPrefix,
      apiLive,
      ...(middleware ? { middleware } : {}),
      ...(scalar ? { scalar } : {}),
    });

    Array.forEach(ROUTABLE_HTTP_METHODS, (method) => {
      const routeSpec: RouteSpecWithPathPrefix = {
        pathPrefix,
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
    Array.reduce(
      httpRouter(),
      (convexHttpRouter, [pathPrefix, { api, apiLive, middleware, scalar }]) =>
        mountEffectHttpApi({
          api,
          pathPrefix: pathPrefix as RoutePath,
          apiLive,
          ...(middleware ? { middleware } : {}),
          ...(scalar ? { scalar } : {}),
        })(convexHttpRouter),
    ),
  );
};

let monkeyPatchesApplied = false;

const applyMonkeyPatches = () => {
  if (monkeyPatchesApplied) {
    return;
  }
  monkeyPatchesApplied = true;

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
    configurable: true,
    get: () => new AbortSignal(),
  });
};
