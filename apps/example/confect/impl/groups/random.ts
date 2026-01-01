import { FunctionImpl, GroupImpl } from "@rjdellecese/confect";
import { Effect, Layer } from "effect";
import Api from "../../_generated/api";

const getNumber = FunctionImpl.make(Api, "groups.random", "getNumber", () =>
  Effect.succeed(Math.random()).pipe(Effect.orDie),
);

export const random = GroupImpl.make(Api, "groups.random").pipe(
  Layer.provide(getNumber),
);
