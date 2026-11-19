import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Random from "effect/Random";
import { FunctionImpl, GroupImpl } from "../_generated/server";
import randomSpec from "./random.spec";

const getNumber = FunctionImpl.make(randomSpec, "getNumber", () =>
  Random.next.pipe(Effect.orDie),
);

export default GroupImpl.make(randomSpec).pipe(
  Layer.provide(getNumber),
  GroupImpl.finalize,
);
