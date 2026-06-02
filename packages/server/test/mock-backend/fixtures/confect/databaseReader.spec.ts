import { FunctionSpec, GroupSpec, PaginationResult } from "@confect/core";
import { Schema } from "effect";
import { Id } from "./_generated/id";
import notes from "./_generated/tables/notes";

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
    FunctionSpec.publicQuery({
      name: "paginateNotes",
      args: () =>
        Schema.Struct({
          cursor: Schema.NullOr(Schema.String),
          numItems: Schema.Number,
        }),
      returns: () => PaginationResult.PaginationResult(notes.Doc),
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "paginateNotesWithFilter",
      args: () =>
        Schema.Struct({
          cursor: Schema.NullOr(Schema.String),
          numItems: Schema.Number,
          tag: Schema.String,
        }),
      returns: () => PaginationResult.PaginationResult(notes.Doc),
    }),
  );
