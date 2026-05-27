import { FunctionSpec, GroupSpec } from "@confect/core";
import { Schema } from "effect";
import { Id } from "../_generated/id";
import notes from "../_generated/tables/notes";

export default GroupSpec.make()
  .addFunction(
    FunctionSpec.publicMutation({
      name: "insert",
      args: Schema.Struct({ text: Schema.String }),
      returns: Id("notes"),
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "list",
      args: Schema.Struct({}),
      returns: Schema.Array(notes.Doc),
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "delete_",
      args: Schema.Struct({ noteId: Id("notes") }),
      returns: Schema.Null,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "getFirst",
      args: Schema.Struct({}),
      returns: Schema.Option(notes.Doc),
    }),
  )
  .addFunction(
    FunctionSpec.internalQuery({
      name: "internalGetFirst",
      args: Schema.Struct({}),
      returns: Schema.Option(notes.Doc),
    }),
  );
