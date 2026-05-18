import { HttpApi } from "@confect/server";
import { HttpMiddleware } from "effect/unstable/http";
import { flow } from "effect";
import { Api, ApiLive } from "./http/path-prefix";

export default HttpApi.make({
  "/path-prefix/": {
    api: Api,
    apiLive: ApiLive,
    middleware: flow(HttpMiddleware.cors(), HttpMiddleware.logger),
  },
});
