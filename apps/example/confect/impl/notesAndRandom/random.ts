import { FunctionImpl, GroupImpl } from "@confect/server";
import { Effect, Layer } from "effect";
import api from "../../_generated/api";

const getNumber = FunctionImpl.make(
  api,
  "notesAndRandom.random",
  "getNumber",
  () => Effect.succeed(Math.random()).pipe(Effect.orDie),
);

export const random = GroupImpl.make(api, "notesAndRandom.random").pipe(
  Layer.provide(getNumber),
);
