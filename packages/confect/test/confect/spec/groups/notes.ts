import { FunctionSpec, GenericId, GroupSpec } from "@rjdellecese/confect";
import { Schema } from "effect";
import { Note } from "../../tables/Note";

export const notes = GroupSpec.make("notes")
  .addFunction(
    FunctionSpec.mutation({
      name: "insert",
      args: Schema.Struct({ text: Schema.String }),
      returns: GenericId.GenericId("notes"),
    }),
  )
  .addFunction(
    FunctionSpec.query({
      name: "list",
      args: Schema.Struct({}),
      returns: Schema.Array(Note.Doc),
    }),
  )
  .addFunction(
    FunctionSpec.mutation({
      name: "delete_",
      args: Schema.Struct({ noteId: GenericId.GenericId("notes") }),
      returns: Schema.Null,
    }),
  )
  .addFunction(
    FunctionSpec.query({
      name: "getFirst",
      args: Schema.Struct({}),
      returns: Schema.Option(Note.Doc),
    }),
  )
  .addFunction(
    FunctionSpec.internalQuery({
      name: "internalGetFirst",
      args: Schema.Struct({}),
      returns: Schema.Option(Note.Doc),
    }),
  );
