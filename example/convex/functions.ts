import { Effect } from "effect";
import {
  ConfectDatabaseReader,
  ConfectDatabaseWriter,
  confectAction,
  confectMutation,
  confectQuery,
} from "./confect";
import {
  DeleteNoteArgs,
  DeleteNoteResult,
  GetFirstArgs,
  GetFirstResult,
  GetRandomArgs,
  GetRandomResult,
  InsertNoteArgs,
  InsertNoteResult,
  ListNotesArgs,
  ListNotesResult,
} from "./functions.schemas";

export const insertNote = confectMutation({
  args: InsertNoteArgs,
  returns: InsertNoteResult,
  handler: ({ text }) =>
    Effect.gen(function* () {
      const writer = yield* ConfectDatabaseWriter;

      return yield* writer.insert("notes", { text });
    }),
});

export const listNotes = confectQuery({
  args: ListNotesArgs,
  returns: ListNotesResult,
  handler: () =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;

      return yield* reader
        .table("notes")
        .index("by_creation_time", "desc")
        .collect();
    }),
});

export const deleteNote = confectMutation({
  args: DeleteNoteArgs,
  returns: DeleteNoteResult,
  handler: ({ noteId }) =>
    Effect.gen(function* () {
      const writer = yield* ConfectDatabaseWriter;

      yield* writer.delete("notes", noteId);

      return null;
    }),
});

export const getRandom = confectAction({
  args: GetRandomArgs,
  returns: GetRandomResult,
  handler: () => Effect.succeed(Math.random()),
});

export const getFirst = confectQuery({
  args: GetFirstArgs,
  returns: GetFirstResult,
  handler: () =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;

      return yield* reader.table("notes").index("by_creation_time").first();
    }),
});
