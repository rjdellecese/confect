import { FunctionSpec, GroupSpec } from "@confect/core";
import { Schema } from "effect";

export default GroupSpec.make().addFunction(
  FunctionSpec.publicAction({
    name: "getNumber",
    args: () => Schema.Struct({}),
    returns: () => Schema.Number,
  }),
);
