import { HttpRouter as ConfectHttpRouter } from "@confect/server";
import { flow } from "effect/Function";
import * as Layer from "effect/Layer";
import * as HttpMiddleware from "effect/unstable/http/HttpMiddleware";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import * as NotesApi from "./http/NotesApi";
import * as ScalarDocs from "./http/ScalarDocs";

export default ConfectHttpRouter.make(
  Layer.mergeAll(
    NotesApi.layer,
    ScalarDocs.layer,
    HttpRouter.add("GET", "/health", HttpServerResponse.text("OK")),
    HttpRouter.middleware(flow(HttpMiddleware.cors(), HttpMiddleware.logger), {
      global: true,
    }),
  ),
);
