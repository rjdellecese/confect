import { Component, FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";
import { first } from "../componentBindings";

export default GroupSpec.make()
  .addFunction(
    FunctionSpec.publicMutation({
      name: "exercise",
      args: () => ({ run: Schema.String }),
      returns: () =>
        Schema.Struct({
          first: Schema.Array(Schema.Finite),
          second: Schema.Array(Schema.Finite),
          left: Schema.Array(Schema.Finite),
          right: Schema.Array(Schema.Finite),
          rejectedId: Component.id(first, "counters"),
        }),
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "schedule",
      args: () => ({ run: Schema.String }),
      returns: () => Component.id(first, "_scheduled_functions"),
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "list",
      args: () => ({ run: Schema.String }),
      returns: () =>
        Schema.Struct({
          first: Schema.Array(Schema.Finite),
          second: Schema.Array(Schema.Finite),
        }),
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
      args: () => ({ id: Component.id(first, "_storage") }),
      returns: () => Schema.String,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "hasAuth",
      returns: () => Schema.Boolean,
    }),
  );
