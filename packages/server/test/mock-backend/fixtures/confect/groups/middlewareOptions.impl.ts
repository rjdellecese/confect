import { GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FunctionImpl } from "../_generated/server";
import ProvideViewer from "../middleware/ProvideViewer.impl";
import { Viewer } from "../middleware/ProvideViewer.spec";
import RequireName from "../middleware/RequireName.impl";
import group from "./middlewareOptions.spec";

const handler = () => Effect.map(Viewer, ({ username }) => username);

export default GroupImpl.make(group).pipe(
  Layer.provide(FunctionImpl.make(group, "shortName", handler)),
  Layer.provide(FunctionImpl.make(group, "longName", handler)),
  Layer.provide(FunctionImpl.make(group, "mutation", handler)),
  Layer.provide(FunctionImpl.make(group, "action", handler)),
  Layer.provide(ProvideViewer),
  Layer.provide(RequireName),
  GroupImpl.finalize,
);
