import { GroupImpl } from "@confect/server";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FunctionImpl } from "./_generated/server";
import env from "./env.spec";

const readEnvVar = FunctionImpl.make(env, "readEnvVar", () =>
  Config.String("TEST_ENV_VAR").pipe(Effect.orDie),
);

export default GroupImpl.make(env).pipe(
  Layer.provide(readEnvVar),
  GroupImpl.finalize,
);
