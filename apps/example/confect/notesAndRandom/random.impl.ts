import { FunctionImpl, GroupImpl } from "@confect/server";
import { Effect, Layer } from "effect";
import api from "../_generated/api";
import random from "./random.spec";

const getNumber = FunctionImpl.make(api, random, "getNumber", () =>
  Effect.succeed(Math.random()).pipe(Effect.orDie),
);

export default GroupImpl.make(api, random).pipe(Layer.provide(getNumber));
