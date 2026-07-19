import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";
import { Id } from "./_generated/id";
import notes from "./_generated/tables/notes";

export class PaginationDenied extends Schema.TaggedError<PaginationDenied>()(
  "PaginationDenied",
  { reason: Schema.String },
) {}

export default GroupSpec.make()
  .addFunction(
    FunctionSpec.publicQuery({
      name: "getNote",
      args: () => Schema.Struct({ noteId: Id("notes") }),
      returns: () => notes.Doc,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "listNotes",
      args: () => Schema.Struct({}),
      returns: () => Schema.Array(notes.Doc),
    }),
  )
  .addFunction(
    FunctionSpec.publicPaginatedQuery({
      name: "paginateNotes",
      item: () => notes.Doc,
    }),
  )
  .addFunction(
    FunctionSpec.publicPaginatedQuery({
      name: "paginateNotesWithFilter",
      args: () => Schema.Struct({ tag: Schema.String }),
      item: () => notes.Doc,
    }),
  )
  .addFunction(
    FunctionSpec.publicPaginatedQuery({
      name: "paginateNotesOrFail",
      args: () => Schema.Struct({ shouldFail: Schema.Boolean }),
      item: () => notes.Doc,
      error: () => PaginationDenied,
    }),
  );
