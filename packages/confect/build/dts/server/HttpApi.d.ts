import { ActionRunner } from "./ActionRunner.js";
import { Auth as Auth$1 } from "./Auth.js";
import { MutationRunner } from "./MutationRunner.js";
import { QueryRunner } from "./QueryRunner.js";
import { Scheduler as Scheduler$1 } from "./Scheduler.js";
import { StorageActionWriter as StorageActionWriter$1, StorageReader as StorageReader$1, StorageWriter as StorageWriter$1 } from "./Storage.js";
import { Layer } from "effect";
import { HttpRouter } from "convex/server";
import { HttpApi, HttpApiBuilder, HttpApiScalar, HttpApp, HttpRouter as HttpRouter$1 } from "@effect/platform";

//#region src/server/HttpApi.d.ts
declare namespace HttpApi_d_exports {
  export { HttpApi_, RoutePath, make };
}
type Middleware = (httpApp: HttpApp.Default) => HttpApp.Default<never, HttpApi.Api | HttpApiBuilder.Router | HttpRouter$1.HttpRouter.DefaultServices>;
type HttpApi_ = {
  apiLive: Layer.Layer<HttpApi.Api, never, QueryRunner | MutationRunner | ActionRunner | Scheduler$1 | Auth$1 | StorageReader$1 | StorageWriter$1 | StorageActionWriter$1>;
  middleware?: Middleware;
  scalar?: HttpApiScalar.ScalarConfig;
};
type RoutePath = "/" | `/${string}/`;
type HttpApis = Partial<Record<RoutePath, HttpApi_>>;
declare const make: (httpApis: HttpApis) => HttpRouter;
//#endregion
export { HttpApi_, HttpApi_d_exports, RoutePath, make };
//# sourceMappingURL=HttpApi.d.ts.map