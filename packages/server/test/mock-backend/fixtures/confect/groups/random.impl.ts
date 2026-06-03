import { FunctionImpl, GroupImpl } from "@confect/server";
import { Effect, Layer } from "effect";
import databaseSchema from "../_generated/schema";
import random from "./random.spec";

const getNumber = FunctionImpl.make(databaseSchema, random, "getNumber", () =>
  Effect.succeed(Math.random()).pipe(Effect.orDie),
);

export default GroupImpl.make(databaseSchema, random).pipe(
  Layer.provide(getNumber),
  GroupImpl.finalize,
);
