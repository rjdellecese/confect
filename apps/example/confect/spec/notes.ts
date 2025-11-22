import { ConfectApiFunction, ConfectApiGroup } from "@rjdellecese/confect/api";
import { GenericId } from "@rjdellecese/confect/server";
import { Schema } from "effect";
import { Note } from "../schema/note";

export const Notes = ConfectApiGroup.make("notes")
  .addFunction(
    ConfectApiFunction.mutation({
      name: "insert",
      args: Schema.Struct({ text: Schema.String }),
      returns: GenericId.GenericId("notes"),
    }),
  )
  .addFunction(
    ConfectApiFunction.query({
      name: "list",
      args: Schema.Struct({}),
      returns: Schema.Array(Note.Doc),
    }),
  )
  .addFunction(
    ConfectApiFunction.mutation({
      name: "delete_",
      args: Schema.Struct({ noteId: GenericId.GenericId("notes") }),
      returns: Schema.Null,
    }),
  )
  .addFunction(
    ConfectApiFunction.query({
      name: "getFirst",
      args: Schema.Struct({}),
      returns: Schema.Option(Note.Doc),
    }),
  );
