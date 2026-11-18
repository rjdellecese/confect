import { GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FunctionImpl } from "../../_generated/server";
import stats from "./stats.spec";

const count = FunctionImpl.make(stats, "count", () => Effect.succeed(0));

export default GroupImpl.make(stats).pipe(
  Layer.provide(count),
  GroupImpl.finalize,
);
