import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Random from "effect/Random";
import databaseSchema from "../_generated/schema";
import random from "./random.spec";

const getNumber = FunctionImpl.make(databaseSchema, random, "getNumber", () =>
  Random.next.pipe(Effect.orDie),
);

export default GroupImpl.make(databaseSchema, random).pipe(
  Layer.provide(getNumber),
  GroupImpl.finalize,
);
