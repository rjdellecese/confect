import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";
import { Id } from "./_generated/id";
import counters from "./_generated/tables/counters";

export const Rejected = Schema.TaggedStruct("Rejected", {
  id: Id("counters"),
});

export default GroupSpec.make()
  .addFunction(
    FunctionSpec.publicMutation({
      name: "create",
      args: () => ({ count: Schema.FiniteFromString }),
      returns: () => Id("counters"),
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "list",
      returns: () => Schema.Array(counters.Doc),
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "reject",
      error: () => Rejected,
      returns: () => Schema.Null,
    }),
  )
  .addFunction(
    FunctionSpec.internalQuery({
      name: "privateValue",
      returns: () => Schema.String,
    }),
  );
