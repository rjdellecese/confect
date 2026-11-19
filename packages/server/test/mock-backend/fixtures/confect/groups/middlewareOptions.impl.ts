import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FunctionImpl, GroupImpl } from "../_generated/server";
import ProvideViewer from "../middleware/ProvideViewer.impl";
import { Viewer } from "../middleware/ProvideViewer.spec";
import RequireName from "../middleware/RequireName.impl";
import middlewareOptionsSpec from "./middlewareOptions.spec";

const handler = () => Effect.map(Viewer, ({ username }) => username);

export default GroupImpl.make(middlewareOptionsSpec).pipe(
  Layer.provide(FunctionImpl.make(middlewareOptionsSpec, "shortName", handler)),
  Layer.provide(FunctionImpl.make(middlewareOptionsSpec, "longName", handler)),
  Layer.provide(FunctionImpl.make(middlewareOptionsSpec, "mutation", handler)),
  Layer.provide(FunctionImpl.make(middlewareOptionsSpec, "action", handler)),
  Layer.provide(ProvideViewer),
  Layer.provide(RequireName),
  GroupImpl.finalize,
);
