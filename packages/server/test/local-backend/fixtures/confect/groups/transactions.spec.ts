import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";

export class RejectedWrite extends Schema.TaggedError<RejectedWrite>()(
  "RejectedWrite",
  {
    value: Schema.String,
  },
) {}

export default GroupSpec.make()
  .addFunction(
    FunctionSpec.internalQuery({
      name: "read",
      args: () => ({ caseId: Schema.String }),
      returns: () => Schema.Array(Schema.String),
    }),
  )
  .addFunction(
    FunctionSpec.internalMutation({
      name: "write",
      args: () => ({
        caseId: Schema.String,
        value: Schema.String,
        fail: Schema.Boolean,
      }),
      returns: () => Schema.Null,
      error: () => RejectedWrite,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "seed",
      args: () => ({ caseId: Schema.String, count: Schema.Finite }),
      returns: () => Schema.Null,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "limitedRead",
      args: () => ({ caseId: Schema.String, limit: Schema.Finite }),
      returns: () => Schema.Array(Schema.String),
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "limitedReadFromMutation",
      args: () => ({ caseId: Schema.String, limit: Schema.Finite }),
      returns: () => Schema.Array(Schema.String),
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "limitedWrite",
      args: () => ({ caseId: Schema.String, limit: Schema.Finite }),
      returns: () => Schema.Null,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "rollback",
      args: () => ({ caseId: Schema.String }),
      returns: () => Schema.Boolean,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "staleRead",
      args: () => ({ caseId: Schema.String, stale: Schema.Boolean }),
      returns: () => Schema.Array(Schema.String),
    }),
  );
