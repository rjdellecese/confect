import { makeHttpRouter } from "@rjdellecese/confect/server";

import { HttpMiddleware } from "@effect/platform";
import { flow } from "effect";
import { Api, ApiLive } from "./http/api";

export default makeHttpRouter({
	api: Api,
	apiLive: ApiLive,
	middleware: flow(HttpMiddleware.cors(), HttpMiddleware.logger),
	apiDocsTitle: "Confect Example API Reference",
});