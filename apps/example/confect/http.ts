import { HttpApi } from "@confect/server";
import * as HttpMiddleware from "@effect/platform/HttpMiddleware";
import { flow } from "effect/Function";
import { ApiLive } from "./http/pathPrefix";

export default HttpApi.make({
  "/path-prefix/": {
    apiLive: ApiLive,
    middleware: flow(HttpMiddleware.cors(), HttpMiddleware.logger),
  },
});
