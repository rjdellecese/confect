import { makeHttpRouter } from "@rjdellecese/confect/server";

import { Api, ApiLive } from "./http/api";
import { HttpMiddleware } from "@effect/platform";
import { flow } from "effect";

export default makeHttpRouter({
	api: Api,
	apiLive: ApiLive,
	middleware: flow(HttpMiddleware.cors(), HttpMiddleware.logger),
});
