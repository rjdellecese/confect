import { FunctionSpec, GenericId, GroupSpec } from "@confect/core";
import { Schema } from "effect";
import { Notes } from "../../tables/Notes";

export const notes = GroupSpec.make("notes")
  .addFunction(
    FunctionSpec.publicMutation({
      name: "insert",
      args: Schema.Struct({ text: Schema.String }),
      returns: GenericId.GenericId("notes"),
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "list",
      args: Schema.Struct({}),
      returns: Schema.Array(Notes.Doc),
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "delete_",
      args: Schema.Struct({ noteId: GenericId.GenericId("notes") }),
      returns: Schema.Null,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "getFirst",
      args: Schema.Struct({}),
      returns: Schema.Option(Notes.Doc),
    }),
  )
  .addFunction(
    FunctionSpec.internalQuery({
      name: "internalGetFirst",
      args: Schema.Struct({}),
      returns: Schema.Option(Notes.Doc),
    }),
  );
