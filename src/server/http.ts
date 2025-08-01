import {
  type HttpRouter,
  type HttpApi,
  HttpApiBuilder,
  HttpApiScalar,
  type HttpApp,
  HttpServer,
} from "@effect/platform";
import {
  type GenericActionCtx,
  type HttpRouter as ConvexHttpRouter,
  httpActionGeneric,
  httpRouter,
  ROUTABLE_HTTP_METHODS,
  type RouteSpecWithPathPrefix,
} from "convex/server";
import { Array, Layer, pipe, Record } from "effect";
import { ConfectAuth } from "./auth";
import type {
  DataModelFromConfectDataModel,
  GenericConfectDataModel,
} from "./data-model";
import { ConfectScheduler } from "./scheduler";
import {
  ConfectStorageActionWriter,
  ConfectStorageReader,
  ConfectStorageWriter,
} from "./storage";

type Middleware = (
  httpApp: HttpApp.Default,
) => HttpApp.Default<
  never,
  HttpApi.Api | HttpApiBuilder.Router | HttpRouter.HttpRouter.DefaultServices
>;

const makeHandler =
  <ConfectDataModel extends GenericConfectDataModel>({
    pathPrefix,
    apiLive,
    middleware,
    scalar,
  }: {
    pathPrefix: RoutePath;
    apiLive: Layer.Layer<
      HttpApi.Api,
      never,
      | ConfectScheduler
      | ConfectAuth
      | ConfectStorageReader
      | ConfectStorageWriter
      | ConfectStorageActionWriter
    >;
    middleware?: Middleware;
    scalar?: HttpApiScalar.ScalarConfig;
  }) =>
  (
    ctx: GenericActionCtx<DataModelFromConfectDataModel<ConfectDataModel>>,
    request: Request,
  ): Promise<Response> => {
    const confectSchedularLayer = ConfectScheduler.layer(ctx.scheduler);
    const confectAuthLayer = ConfectAuth.layer(ctx.auth);
    const confectStorageReaderLayer = ConfectStorageReader.layer(ctx.storage);
    const confectStorageWriterLayer = ConfectStorageWriter.layer(ctx.storage);
    const confectStorageActionWriterLayer = ConfectStorageActionWriter.layer(
      ctx.storage,
    );

    const ApiLive = apiLive.pipe(
      Layer.provide(
        Layer.mergeAll(
          confectSchedularLayer,
          confectAuthLayer,
          confectStorageReaderLayer,
          confectStorageWriterLayer,
          confectStorageActionWriterLayer,
        ),
      ),
    );

    const ApiDocsLive = HttpApiScalar.layer({
      path: `${pathPrefix}docs`,
      scalar: {
        baseServerURL: `${
          // biome-ignore lint/complexity/useLiteralKeys: TS says this must be accessed with a string literal
          process.env["CONVEX_SITE_URL"]
        }${pathPrefix}`,
        ...scalar,
      },
    }).pipe(Layer.provide(ApiLive));

    const EnvLive = Layer.mergeAll(
      ApiLive,
      ApiDocsLive,
      HttpServer.layerContext,
    );

    const { handler } = HttpApiBuilder.toWebHandler(EnvLive, { middleware });

    return handler(request);
  };

const makeHttpAction = ({
  pathPrefix,
  apiLive,
  middleware,
  scalar,
}: {
  pathPrefix: RoutePath;
  apiLive: Layer.Layer<
    HttpApi.Api,
    never,
    | ConfectScheduler
    | ConfectAuth
    | ConfectStorageReader
    | ConfectStorageWriter
    | ConfectStorageActionWriter
  >;
  middleware?: Middleware;
  scalar?: HttpApiScalar.ScalarConfig;
}) =>
  httpActionGeneric(makeHandler({ pathPrefix, apiLive, middleware, scalar }));

export type ConfectHttpApi = {
  apiLive: Layer.Layer<
    HttpApi.Api,
    never,
    | ConfectScheduler
    | ConfectAuth
    | ConfectStorageReader
    | ConfectStorageWriter
    | ConfectStorageActionWriter
  >;
  middleware?: Middleware;
  scalar?: HttpApiScalar.ScalarConfig;
};

export type RoutePath = "/" | `/${string}/`;

const mountEffectHttpApi =
  ({
    pathPrefix,
    apiLive,
    middleware,
    scalar,
  }: {
    pathPrefix: RoutePath;
    apiLive: Layer.Layer<
      HttpApi.Api,
      never,
      | ConfectScheduler
      | ConfectAuth
      | ConfectStorageReader
      | ConfectStorageWriter
      | ConfectStorageActionWriter
    >;
    middleware?: Middleware;
    scalar?: HttpApiScalar.ScalarConfig;
  }) =>
  (convexHttpRouter: ConvexHttpRouter): ConvexHttpRouter => {
    const handler = makeHttpAction({ pathPrefix, apiLive, middleware, scalar });

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
      (convexHttpRouter, [pathPrefix, { apiLive, middleware }]) =>
        mountEffectHttpApi({
          pathPrefix: pathPrefix as RoutePath,
          apiLive,
          middleware,
        })(convexHttpRouter),
    ),
  );
};

const applyMonkeyPatches = () => {
  // These are necessary until the Convex runtime supports these APIs. See https://discord.com/channels/1019350475847499849/1281364098419785760

  // biome-ignore lint/suspicious/noGlobalAssign: See above note.
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
