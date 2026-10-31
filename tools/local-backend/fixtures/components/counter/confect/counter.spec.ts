import { FunctionSpec, GenericId, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";
import { Id, scope } from "./_generated/id";
import counters from "./_generated/tables/counters";

export class Rejected extends Schema.TaggedError<Rejected>()("Rejected", {
  id: Id("counters"),
}) {}

export const StorageId = GenericId.GenericId("_storage", scope);
export const ScheduledId = GenericId.GenericId("_scheduled_functions", scope);

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
      returns: () => ScheduledId,
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
      args: () => ({ id: StorageId }),
      returns: () => Schema.String,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "hasAuth",
      returns: () => Schema.Boolean,
    }),
  );
