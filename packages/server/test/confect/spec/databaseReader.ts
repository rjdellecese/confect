import { FunctionSpec, GenericId, GroupSpec } from "@confect/core";
import { Schema } from "effect";
import { Notes } from "../tables/Notes";

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
  );
