import { FunctionSpec, GroupSpec } from "@confect/core";
import { Schema } from "effect";

export const env = GroupSpec.make("env").addFunction(
  FunctionSpec.publicQuery({
    name: "readEnvVar",
    args: Schema.Struct({}),
    returns: Schema.String,
  }),
);
