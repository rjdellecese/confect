import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";

export default GroupSpec.make().addFunction(
  FunctionSpec.publicQuery({
    name: "now",
    args: () => Schema.Struct({}),
    returns: () => Schema.String,
  }),
);
