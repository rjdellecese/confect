import { FunctionImpl, GroupImpl } from "@rjdellecese/confect";
import { Effect, Layer } from "effect";
import { api } from "../../api";

const getNumber = FunctionImpl.make(api, "groups.random", "getNumber", () =>
  Effect.succeed(Math.random()).pipe(Effect.orDie),
);

export const random = GroupImpl.make(api, "groups.random").pipe(
  Layer.provide(getNumber),
);
