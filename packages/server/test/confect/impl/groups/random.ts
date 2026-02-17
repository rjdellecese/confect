import { FunctionImpl, GroupImpl } from "@confect/server";
import { Effect, Layer } from "effect";
import api from "../../_generated/api";

const getNumber = FunctionImpl.make(api, "groups.random", "getNumber", () =>
  Effect.succeed(Math.random()).pipe(Effect.orDie),
);

export const random = GroupImpl.make(api, "groups.random").pipe(
  Layer.provide(getNumber),
);
