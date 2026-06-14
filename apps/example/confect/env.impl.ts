import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import databaseSchema from "./_generated/schema";
import env from "./env.spec";

const readEnvVar = FunctionImpl.make(databaseSchema, env, "readEnvVar", () =>
  Config.string("TEST_ENV_VAR").pipe(Effect.orDie),
);

export default GroupImpl.make(databaseSchema, env).pipe(
  Layer.provide(readEnvVar),
  GroupImpl.finalize,
);
