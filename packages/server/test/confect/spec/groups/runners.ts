import { FunctionSpec, GenericId, GroupSpec } from "@confect/core";
import { Schema } from "effect";

export const runners = GroupSpec.make("runners")
  .addFunction(
    FunctionSpec.publicAction({
      name: "insertNoteViaRunner",
      args: Schema.Struct({ text: Schema.String }),
      returns: GenericId.GenericId("notes"),
    }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "getNumberViaRunner",
      args: Schema.Struct({}),
      returns: Schema.Number,
    }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "countNotesViaRunner",
      args: Schema.Struct({}),
      returns: Schema.Number,
    }),
  );
