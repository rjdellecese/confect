import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";
import { Id } from "../_generated/id";
import notes from "../_generated/tables/notes";

export class NoteNotFound extends Schema.TaggedError<NoteNotFound>()(
  "NoteNotFound",
  { noteId: Id("notes") },
) {}

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
      args: () => ({}),
      returns: () => Schema.Array(notes.Doc),
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
    FunctionSpec.publicPaginatedQuery({
      name: "listPaginated",
      item: () => notes.Doc,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "getOrFail",
      args: () => ({ noteId: Id("notes") }),
      returns: () => notes.Doc,
      error: () => NoteNotFound,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "getFirst",
      args: () => ({}),
      returns: () => Schema.OptionFromNullOr(notes.Doc),
    }),
  )
  .addFunction(
    FunctionSpec.internalQuery({
      name: "internalGetFirst",
      args: () => ({}),
      returns: () => Schema.OptionFromNullOr(notes.Doc),
    }),
  )
  .addFunction(
    FunctionSpec.internalMutation({
      name: "clearAll",
      args: () => ({}),
      returns: () => Schema.Null,
    }),
  )
  .addFunction(
    FunctionSpec.internalMutation({
      name: "insertDefault",
      args: () => ({ text: Schema.String }),
      returns: () => Schema.Null,
    }),
  );
