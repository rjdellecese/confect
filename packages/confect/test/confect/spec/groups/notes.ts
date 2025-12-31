import {
  ConfectApiFunctionSpec,
  ConfectApiGroupSpec,
  GenericId,
} from "@rjdellecese/confect";
import { Schema } from "effect";
import { Note } from "../../schema/note";

export const Notes = ConfectApiGroupSpec.make("notes")
  .addFunction(
    ConfectApiFunctionSpec.mutation({
      name: "insert",
      args: Schema.Struct({ text: Schema.String }),
      returns: GenericId.GenericId("notes"),
    }),
  )
  .addFunction(
    ConfectApiFunctionSpec.query({
      name: "list",
      args: Schema.Struct({}),
      returns: Schema.Array(Note.Doc),
    }),
  )
  .addFunction(
    ConfectApiFunctionSpec.mutation({
      name: "delete_",
      args: Schema.Struct({ noteId: GenericId.GenericId("notes") }),
      returns: Schema.Null,
    }),
  )
  .addFunction(
    ConfectApiFunctionSpec.query({
      name: "getFirst",
      args: Schema.Struct({}),
      returns: Schema.Option(Note.Doc),
    }),
  )
  .addFunction(
    ConfectApiFunctionSpec.internalQuery({
      name: "internalGetFirst",
      args: Schema.Struct({}),
      returns: Schema.Option(Note.Doc),
    }),
  );
