import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FunctionImpl, GroupImpl } from "../../_generated/server";
import statsSpec from "./stats.spec";

const count = FunctionImpl.make(statsSpec, "count", () => Effect.succeed(0));

export default GroupImpl.make(statsSpec).pipe(
  Layer.provide(count),
  GroupImpl.finalize,
);
