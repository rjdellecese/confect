import { FunctionSpec, GroupSpec, PaginationOptions } from "@confect/core";
import * as Schema from "effect/Schema";

const observation = () =>
  Schema.Struct({
    values: Schema.Array(Schema.Finite),
    repeated: Schema.Array(Schema.Finite),
    reads: Schema.Finite,
  });

export default GroupSpec.make()
  .addFunction(
    FunctionSpec.publicMutation({ name: "seed", returns: () => Schema.Null }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "read",
      args: () => ({
        terminal: Schema.Literals(["first", "take", "collect", "stream"]),
        empty: Schema.Boolean,
      }),
      returns: observation,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "page",
      args: () => ({
        paginationOpts: PaginationOptions.PaginationOptions,
        extra: Schema.Boolean,
      }),
      returns: () =>
        Schema.Struct({
          values: Schema.Array(Schema.Finite),
          isDone: Schema.Boolean,
          continueCursor: Schema.String,
          reads: Schema.Finite,
        }),
    }),
  );
