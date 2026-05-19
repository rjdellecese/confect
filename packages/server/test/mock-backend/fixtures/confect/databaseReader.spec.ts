import {
  FunctionSpec,
  GenericId,
  GroupSpec,
  PaginationResult,
} from "@confect/core";
import { Schema } from "effect";
import { Notes } from "./tables/Notes";

export const databaseReader = GroupSpec.make("databaseReader")
  .addFunction(
    FunctionSpec.publicQuery({
      name: "getNote",
      args: Schema.Struct({ noteId: GenericId.GenericId("notes") }),
      returns: Notes.Doc,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "listNotes",
      args: Schema.Struct({}),
      returns: Schema.Array(Notes.Doc),
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "paginateNotes",
      args: Schema.Struct({
        cursor: Schema.NullOr(Schema.String),
        numItems: Schema.Number,
      }),
      returns: PaginationResult.PaginationResult(Notes.Doc),
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "paginateNotesWithFilter",
      args: Schema.Struct({
        cursor: Schema.NullOr(Schema.String),
        numItems: Schema.Number,
        tag: Schema.String,
      }),
      returns: PaginationResult.PaginationResult(Notes.Doc),
    }),
  );
