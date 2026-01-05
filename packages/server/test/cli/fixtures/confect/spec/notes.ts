import { FunctionSpec, GroupSpec } from "@confect/core";
import { Schema } from "effect";

export default GroupSpec.make("notes").addFunction(
  FunctionSpec.query({
    name: "getContent",
    args: Schema.Struct({}),
    returns: Schema.String,
  }),
);
