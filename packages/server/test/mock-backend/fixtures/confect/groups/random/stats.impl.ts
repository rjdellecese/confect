import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import databaseSchema from "../../_generated/schema";
import stats from "./stats.spec";

const count = FunctionImpl.make(databaseSchema, stats, "count", () =>
  Effect.succeed(0),
);

export default GroupImpl.make(databaseSchema, stats).pipe(
  Layer.provide(count),
  GroupImpl.finalize,
);
