import { FunctionImpl, GroupImpl } from "@confect/server";
import { Config, Effect, Layer } from "effect";
import api from "./_generated/api";
import env from "./env.spec";

const readEnvVar = FunctionImpl.make(api, env, "readEnvVar", () =>
  Config.string("TEST_ENV_VAR").pipe(Effect.orDie),
);

export default GroupImpl.make(api, env).pipe(Layer.provide(readEnvVar));
