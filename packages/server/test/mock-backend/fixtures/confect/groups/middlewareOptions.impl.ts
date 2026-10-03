import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import databaseSchema from "../_generated/schema";
import ProvideViewer from "../middleware/ProvideViewer.impl";
import { Viewer } from "../middleware/ProvideViewer.spec";
import RequireName from "../middleware/RequireName.impl";
import group from "./middlewareOptions.spec";

const handler = () => Effect.map(Viewer, ({ username }) => username);

export default GroupImpl.make(databaseSchema, group).pipe(
  Layer.provide(FunctionImpl.make(databaseSchema, group, "shortName", handler)),
  Layer.provide(FunctionImpl.make(databaseSchema, group, "longName", handler)),
  Layer.provide(FunctionImpl.make(databaseSchema, group, "mutation", handler)),
  Layer.provide(FunctionImpl.make(databaseSchema, group, "action", handler)),
  Layer.provide(ProvideViewer),
  Layer.provide(RequireName),
  GroupImpl.finalize,
);
