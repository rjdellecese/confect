import { FunctionSpec, GroupSpec } from "@confect/core";
import { Schema } from "effect";

export default GroupSpec.make().addFunction(
  FunctionSpec.publicQuery({
    name: "readEnvVar",
    args: Schema.Struct({}),
    returns: Schema.String,
  }),
);
