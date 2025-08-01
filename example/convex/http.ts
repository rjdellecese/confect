import { HttpMiddleware } from "@effect/platform";
import { makeConvexHttpRouter } from "@rjdellecese/confect/server";
import { flow } from "effect";
import { ApiLive } from "./http/api";

export default makeConvexHttpRouter({
  "/path-prefix/": {
    apiLive: ApiLive,
    middleware: flow(HttpMiddleware.cors(), HttpMiddleware.logger),
  },
});
