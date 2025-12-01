import { HttpMiddleware } from "@effect/platform";
import { ConfectHttpApi } from "@rjdellecese/confect/server";
import { flow } from "effect";
import { ApiLive } from "./http/path-prefix";

export default ConfectHttpApi.make({
  "/path-prefix/": {
    apiLive: ApiLive,
    middleware: flow(HttpMiddleware.cors(), HttpMiddleware.logger),
  },
});
