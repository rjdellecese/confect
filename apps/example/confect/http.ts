import { HttpApi } from "@confect/server";
import { HttpMiddleware } from "@effect/platform";
import { flow } from "effect";
import { ApiLive } from "./http/path-prefix";

export default HttpApi.make({
  "/path-prefix/": {
    apiLive: ApiLive,
    middleware: flow(HttpMiddleware.cors(), HttpMiddleware.logger),
  },
});
