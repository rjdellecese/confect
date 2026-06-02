import { FunctionImpl, GroupImpl } from "@confect/server";
import { Config, Effect, Layer } from "effect";
import databaseSchema from "./_generated/schema";
import env from "./env.spec";

const readEnvVar = FunctionImpl.make(databaseSchema, env, "readEnvVar", () =>
  Config.string("TEST_ENV_VAR").pipe(Effect.orDie),
);

export default GroupImpl.make(databaseSchema, env).pipe(
  Layer.provide(readEnvVar),
  GroupImpl.finalize,
);
