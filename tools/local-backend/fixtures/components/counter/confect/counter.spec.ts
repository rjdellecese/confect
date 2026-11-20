import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";
import { Id } from "./_generated/id";
import counters from "./_generated/tables/counters";

export class Rejected extends Schema.TaggedError<Rejected, {}>()("Rejected", {
  id: Id("counters"),
}) {}

export default GroupSpec.make()
  .addFunction(
    FunctionSpec.publicMutation({
      name: "create",
      args: () => ({ run: Schema.String, count: Schema.FiniteFromString }),
      returns: () => Id("counters"),
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "list",
      args: () => ({ run: Schema.String }),
      returns: () => Schema.Array(counters.Doc),
    }),
  )
  .addFunction(
    FunctionSpec.publicPaginatedQuery({
      name: "paginate",
      args: () => ({ run: Schema.String }),
      item: () => counters.Doc,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "reject",
      args: () => ({ run: Schema.String }),
      error: () => Rejected,
      returns: () => Schema.Null,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "schedule",
      args: () => ({ run: Schema.String, count: Schema.FiniteFromString }),
      returns: () => Id("_scheduled_functions"),
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "uploadUrl",
      returns: () => Schema.String,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "storageUrl",
      args: () => ({ id: Id("_storage") }),
      returns: () => Schema.String,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "hasAuth",
      returns: () => Schema.Boolean,
    }),
  );
