import { ConvexConfigProvider, FunctionImpl, GroupImpl } from "@confect/server";
import { Effect, Layer } from "effect";
import api from "./_generated/api";

const typedEnv = ConvexConfigProvider.fromEnv<{
  TEST_ENV_VAR: string;
}>();

const readEnvVar = FunctionImpl.make(api, "env", "readEnvVar", () =>
  typedEnv.string("TEST_ENV_VAR").pipe(Effect.orDie),
);

export const env = GroupImpl.make(api, "env").pipe(Layer.provide(readEnvVar));
