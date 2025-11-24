import {
  type HttpApi,
  HttpApiBuilder,
  HttpApiScalar,
  type HttpApp,
  type HttpRouter,
  HttpServer,
} from "@effect/platform";
import {
  type HttpRouter as ConvexHttpRouter,
  type GenericActionCtx,
  type GenericDataModel,
  httpActionGeneric,
  httpRouter,
  ROUTABLE_HTTP_METHODS,
  type RouteSpecWithPathPrefix,
} from "convex/server";
import { Array, Layer, pipe, Record } from "effect";
import * as ConfectActionRunner from "./ConfectActionRunner";
import * as ConfectAuth from "./ConfectAuth";
import * as ConfectMutationRunner from "./ConfectMutationRunner";
import * as ConfectQueryRunner from "./ConfectQueryRunner";
import * as ConfectScheduler from "./ConfectScheduler";
import {
  ConfectStorageActionWriter,
  ConfectStorageReader,
  ConfectStorageWriter,
} from "./ConfectStorage";
import * as ConvexActionCtx from "./ConvexActionCtx";

type Middleware = (
  httpApp: HttpApp.Default,
) => HttpApp.Default<
  never,
  HttpApi.Api | HttpApiBuilder.Router | HttpRouter.HttpRouter.DefaultServices
>;

const makeHandler =
  <DataModel extends GenericDataModel>({
    pathPrefix,
    apiLive,
    middleware,
    scalar,
  }: {
    pathPrefix: RoutePath;
    apiLive: Layer.Layer<
      HttpApi.Api,
      never,
      | ConfectQueryRunner.ConfectQueryRunner
      | ConfectMutationRunner.ConfectMutationRunner
      | ConfectActionRunner.ConfectActionRunner
      | ConfectScheduler.ConfectScheduler
      | ConfectAuth.ConfectAuth
      | ConfectStorageReader
      | ConfectStorageWriter
      | ConfectStorageActionWriter
      | GenericActionCtx<DataModel>
    >;
    middleware?: Middleware;
    scalar?: HttpApiScalar.ScalarConfig;
  }) =>
  (ctx: GenericActionCtx<DataModel>, request: Request): Promise<Response> => {
    const ApiLive = apiLive.pipe(
      Layer.provide(
        Layer.mergeAll(
          ConfectQueryRunner.layer(ctx.runQuery),
          ConfectMutationRunner.layer(ctx.runMutation),
          ConfectActionRunner.layer(ctx.runAction),
          ConfectScheduler.layer(ctx.scheduler),
          ConfectAuth.layer(ctx.auth),
          ConfectStorageReader.layer(ctx.storage),
          ConfectStorageWriter.layer(ctx.storage),
          ConfectStorageActionWriter.layer(ctx.storage),
          Layer.succeed(ConvexActionCtx.ConvexActionCtx<DataModel>(), ctx),
        ),
      ),
    );

    const ApiDocsLive = HttpApiScalar.layer({
      path: `${pathPrefix}docs`,
      scalar: {
        baseServerURL: `${process.env["CONVEX_SITE_URL"]}${pathPrefix}`,
        ...scalar,
      },
    }).pipe(Layer.provide(ApiLive));

    const EnvLive = Layer.mergeAll(
      ApiLive,
      ApiDocsLive,
      HttpServer.layerContext,
    );

    const { handler } = HttpApiBuilder.toWebHandler(
      EnvLive,
      middleware ? { middleware } : {},
    );

    return handler(request);
  };

const makeHttpAction = <DataModel extends GenericDataModel>({
  pathPrefix,
  apiLive,
  middleware,
  scalar,
}: {
  pathPrefix: RoutePath;
  apiLive: Layer.Layer<
    HttpApi.Api,
    never,
    | ConfectQueryRunner.ConfectQueryRunner
    | ConfectMutationRunner.ConfectMutationRunner
    | ConfectActionRunner.ConfectActionRunner
    | ConfectScheduler.ConfectScheduler
    | ConfectAuth.ConfectAuth
    | ConfectStorageReader
    | ConfectStorageWriter
    | ConfectStorageActionWriter
    | GenericActionCtx<DataModel>
  >;
  middleware?: Middleware;
  scalar?: HttpApiScalar.ScalarConfig;
}) =>
  httpActionGeneric(
    makeHandler<DataModel>({
      pathPrefix,
      apiLive,
      ...(middleware ? { middleware } : {}),
      ...(scalar ? { scalar } : {}),
    }) as unknown as (
      ctx: GenericActionCtx<GenericDataModel>,
      request: Request,
    ) => Promise<Response>,
  );

export type ConfectHttpApi = {
  apiLive: Layer.Layer<
    HttpApi.Api,
    never,
    | ConfectQueryRunner.ConfectQueryRunner
    | ConfectMutationRunner.ConfectMutationRunner
    | ConfectActionRunner.ConfectActionRunner
    | ConfectScheduler.ConfectScheduler
    | ConfectAuth.ConfectAuth
    | ConfectStorageReader
    | ConfectStorageWriter
    | ConfectStorageActionWriter
  >;
  middleware?: Middleware;
  scalar?: HttpApiScalar.ScalarConfig;
};

export type RoutePath = "/" | `/${string}/`;

const mountEffectHttpApi =
  <DataModel extends GenericDataModel>({
    pathPrefix,
    apiLive,
    middleware,
    scalar,
  }: {
    pathPrefix: RoutePath;
    apiLive: Layer.Layer<
      HttpApi.Api,
      never,
      | ConfectQueryRunner.ConfectQueryRunner
      | ConfectMutationRunner.ConfectMutationRunner
      | ConfectActionRunner.ConfectActionRunner
      | ConfectScheduler.ConfectScheduler
      | ConfectAuth.ConfectAuth
      | ConfectStorageReader
      | ConfectStorageWriter
      | ConfectStorageActionWriter
      | GenericActionCtx<DataModel>
    >;
    middleware?: Middleware;
    scalar?: HttpApiScalar.ScalarConfig;
  }) =>
  (convexHttpRouter: ConvexHttpRouter): ConvexHttpRouter => {
    const handler = makeHttpAction<DataModel>({
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

type ConfectHttpApis = Partial<Record<RoutePath, ConfectHttpApi>>;

export const makeConvexHttpRouter = (
  confectHttpApis: ConfectHttpApis,
): ConvexHttpRouter => {
  applyMonkeyPatches();

  return pipe(
    confectHttpApis as Record<RoutePath, ConfectHttpApi>,
    Record.toEntries,
    Array.reduce(
      httpRouter(),
      (convexHttpRouter, [pathPrefix, { apiLive, middleware, scalar }]) =>
        mountEffectHttpApi({
          pathPrefix: pathPrefix as RoutePath,
          apiLive,
          ...(middleware ? { middleware } : {}),
          ...(scalar ? { scalar } : {}),
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
