import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";

export default GroupSpec.make().addFunction(
  FunctionSpec.publicAction({
    name: "getNumber",
    args: () => Schema.Struct({}),
    returns: () => Schema.Number,
  }),
);
