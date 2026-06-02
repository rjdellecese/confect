import { FunctionSpec, GroupSpec } from "@confect/core";
import { Schema } from "effect";
import { Id } from "../_generated/id";

export default GroupSpec.make()
  .addFunction(
    FunctionSpec.publicAction({
      name: "insertNoteViaRunner",
      args: () => Schema.Struct({ text: Schema.String }),
      returns: () => Id("notes"),
    }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "getNumberViaRunner",
      args: () => Schema.Struct({}),
      returns: () => Schema.Number,
    }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "countNotesViaRunner",
      args: () => Schema.Struct({}),
      returns: () => Schema.Number,
    }),
  );
