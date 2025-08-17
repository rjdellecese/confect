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
import * as Schema from "effect/Schema";

export class NotFoundError extends Schema.TaggedError<NotFoundError>('NotFoundError')('NotFoundError', {}) {
  get message(): string {
    return 'Not Found'
  }
}


export const insertNote = confectMutation({
  args: InsertNoteArgs,
  returns: InsertNoteResult,
  errors: NotFoundError,
  handler: ({ text }) =>
    Effect.gen(function* () {
      const writer = yield* ConfectDatabaseWriter;

      if (text.length > 100) {
        return yield* Effect.fail(new NotFoundError());
      }

      return yield* writer.insert("notes", { text }).pipe(
        Effect.orDie
      );
    }),
});

export const listNotes = confectQuery({
  args: ListNotesArgs,
  returns: ListNotesResult,
  errors: NotFoundError,
  handler: () =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;

      yield* Effect.log("listNotes");

      return yield* reader
        .table("notes")
        .index("by_creation_time", "desc")
        .collect().pipe(
          Effect.catchTag('DocumentDecodeError', () => Effect.fail(new NotFoundError())), 
          Effect.orDie,
        );
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

      return yield* reader.table("notes").index("by_creation_time").first().pipe(
        Effect.orDie,
      );
    }),
});
