import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FunctionImpl, GroupImpl } from "./_generated/server";
import envSpec from "./env.spec";

const readEnvVar = FunctionImpl.make(envSpec, "readEnvVar", () =>
  Config.String("TEST_ENV_VAR").pipe(Effect.orDie),
);

export default GroupImpl.make(envSpec).pipe(
  Layer.provide(readEnvVar),
  GroupImpl.finalize,
);
