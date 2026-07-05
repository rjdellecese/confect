import { HttpApi } from "@confect/server";
import * as HttpMiddleware from "effect/unstable/http/HttpMiddleware";
import { flow } from "effect/Function";
import { Api, ApiLive } from "./http/pathPrefix";

export default HttpApi.make({
  "/path-prefix/": HttpApi.mount({
    api: Api,
    apiLive: ApiLive,
    middleware: flow(HttpMiddleware.cors(), HttpMiddleware.logger),
  }),
});
