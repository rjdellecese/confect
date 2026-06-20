import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";

export default GroupSpec.make().addFunction(
  FunctionSpec.publicQuery({
    name: "count",
    args: () => Schema.Struct({}),
    returns: () => Schema.Number,
  }),
);
