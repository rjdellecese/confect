import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";

export default GroupSpec.make()
  .addFunction(
    FunctionSpec.publicQuery({
      name: "manyOpsQuery",
      args: () => Schema.Struct({}),
      returns: () => Schema.Finite,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "manyOpsMutation",
      args: () => Schema.Struct({}),
      returns: () => Schema.Finite,
    }),
  );
