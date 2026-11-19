import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";
import { Id } from "../_generated/id";
import notesTable from "../_generated/tables/notes";

export class NoteNotFound extends Schema.TaggedError<
  NoteNotFound,
  { readonly brand: unique symbol }
>()("NoteNotFound", { noteId: Id("notes") }) {}

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
    FunctionSpec.publicPaginatedQuery({
      name: "listPaginated",
      item: () => notesTable.Doc,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "insertAuthored",
      args: () => ({
        text: Schema.String,
        role: Schema.Literals(["admin", "user"]),
        hidden: Schema.optional(Schema.Boolean),
      }),
      returns: () => Id("notes"),
    }),
  )
  .addFunction(
    FunctionSpec.publicPaginatedQuery({
      name: "feed",
      item: () => notesTable.Doc,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "getOrFail",
      args: () => ({ noteId: Id("notes") }),
      returns: () => notesTable.Doc,
      error: () => NoteNotFound,
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
  )
  .addFunction(
    FunctionSpec.internalMutation({
      name: "clearAll",
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
