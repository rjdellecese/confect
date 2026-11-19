import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";
import { Id } from "./_generated/id";
import notesTable from "./_generated/tables/notes";

export class PaginationDenied extends Schema.TaggedError<
  PaginationDenied,
  {}
>()("PaginationDenied", { reason: Schema.String }) {}

export default GroupSpec.make()
  .addFunction(
    FunctionSpec.publicQuery({
      name: "getNote",
      args: () => ({ noteId: Id("notes") }),
      returns: () => notesTable.Doc,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "listNotes",
      returns: () => Schema.Array(notesTable.Doc),
    }),
  )
  .addFunction(
    FunctionSpec.publicPaginatedQuery({
      name: "paginateNotes",
      item: () => notesTable.Doc,
    }),
  )
  .addFunction(
    FunctionSpec.publicPaginatedQuery({
      name: "paginateNotesWithFilter",
      args: () => ({ tag: Schema.String }),
      item: () => notesTable.Doc,
    }),
  )
  .addFunction(
    FunctionSpec.publicPaginatedQuery({
      name: "paginateNotesOrFail",
      args: () => ({ shouldFail: Schema.Boolean }),
      item: () => notesTable.Doc,
      error: () => PaginationDenied,
    }),
  );
