import { HttpMiddleware } from "@effect/platform";
import { makeHttpRouter } from "@rjdellecese/confect/server";
import { flow } from "effect";
import { ApiLive } from "./http/api";

export default makeHttpRouter({
  "/path-prefix/": {
    apiLive: ApiLive,
    middleware: flow(HttpMiddleware.cors(), HttpMiddleware.logger),
  },
});
