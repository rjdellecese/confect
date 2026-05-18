import { FunctionSpec, GroupSpec } from "@gunta/confect-core";
import { Schema } from "effect";

export const env = GroupSpec.make("env").addFunction(
  FunctionSpec.publicQuery({
    name: "readEnvVar",
    args: Schema.Struct({}),
    returns: Schema.String,
  }),
);
