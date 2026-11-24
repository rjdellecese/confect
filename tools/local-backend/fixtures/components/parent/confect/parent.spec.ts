import { Component, FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";
import counters from "../../counter/confect/_generated/tables/counters";
import { child } from "./child";

export default GroupSpec.make()
  .addFunction(
    FunctionSpec.publicMutation({
      name: "create",
      args: () => ({ run: Schema.String, count: Schema.FiniteFromString }),
      returns: () => Component.id(child, "counters"),
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "list",
      args: () => ({ run: Schema.String }),
      returns: () => Schema.Array(Component.schema(child, counters.Doc)),
    }),
  );
