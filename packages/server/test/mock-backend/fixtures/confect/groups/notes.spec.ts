import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";
import { Id } from "../_generated/id";
import notesTable from "../_generated/tables/notes";

export default GroupSpec.make()
  .addFunction(
    FunctionSpec.publicMutation({
      name: "insert",
      args: () => ({ text: Schema.String }),
      returns: () => Id("notes"),
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "list",
      returns: () => Schema.Array(notesTable.Doc),
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "delete_",
      args: () => ({ noteId: Id("notes") }),
      returns: () => Schema.Null,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "getFirst",
      returns: () => Schema.OptionFromNullOr(notesTable.Doc),
    }),
  )
  .addFunction(
    FunctionSpec.internalQuery({
      name: "internalGetFirst",
      returns: () => Schema.OptionFromNullOr(notesTable.Doc),
    }),
  );
