import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";
import { Id } from "../_generated/id";

export default GroupSpec.make()
  .addFunction(
    FunctionSpec.publicAction({
      name: "insertNoteViaRunner",
      args: () => ({ text: Schema.String }),
      returns: () => Id("notes"),
    }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "getNumberViaRunner",
      args: () => ({}),
      returns: () => Schema.Finite,
    }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "countNotesViaRunner",
      args: () => ({}),
      returns: () => Schema.Finite,
    }),
  );
