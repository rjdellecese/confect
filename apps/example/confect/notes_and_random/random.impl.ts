import { GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Random from "effect/Random";
import { FunctionImpl } from "../_generated/server";
import random from "./random.spec";

const getNumber = FunctionImpl.make(random, "getNumber", () =>
  Random.next.pipe(Effect.orDie),
);

export default GroupImpl.make(random).pipe(
  Layer.provide(getNumber),
  GroupImpl.finalize,
);
