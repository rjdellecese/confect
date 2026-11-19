import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FunctionImpl, GroupImpl } from "./_generated/server";
import notesTable from "./_generated/tables/notes";
import { DatabaseReader } from "./_generated/services";
import databaseReaderSpec, { PaginationDenied } from "./databaseReader.spec";

export default GroupImpl.make(databaseReaderSpec).pipe(
  Layer.provide(
    Layer.mergeAll(
      FunctionImpl.make(databaseReaderSpec, "getNote", ({ noteId }) =>
        Effect.gen(function* () {
          const reader = yield* DatabaseReader;

          return yield* reader.table(notesTable).get(noteId);
        }).pipe(Effect.orDie),
      ),
      FunctionImpl.make(databaseReaderSpec, "listNotes", () =>
        Effect.gen(function* () {
          const reader = yield* DatabaseReader;

          return yield* reader
            .table(notesTable)
            .index("by_creation_time", "desc")
            .collect();
        }).pipe(Effect.orDie),
      ),
      FunctionImpl.make(
        databaseReaderSpec,
        "paginateNotes",
        ({ paginationOpts }) =>
          Effect.gen(function* () {
            const reader = yield* DatabaseReader;

            return yield* reader
              .table(notesTable)
              .index("by_creation_time")
              .paginate(paginationOpts);
          }).pipe(Effect.orDie),
      ),
      FunctionImpl.make(
        databaseReaderSpec,
        "paginateNotesWithFilter",
        ({ paginationOpts, tag }) =>
          Effect.gen(function* () {
            const reader = yield* DatabaseReader;

            return yield* reader
              .table(notesTable)
              .index("by_creation_time")
              .paginate(paginationOpts, (q) => q.eq(q.field("tag"), tag));
          }).pipe(Effect.orDie),
      ),
      FunctionImpl.make(
        databaseReaderSpec,
        "paginateNotesOrFail",
        ({ paginationOpts, shouldFail }) =>
          Effect.gen(function* () {
            if (shouldFail) {
              return yield* PaginationDenied.make({ reason: "denied" });
            }

            const reader = yield* DatabaseReader;

            return yield* reader
              .table(notesTable)
              .index("by_creation_time")
              .paginate(paginationOpts)
              .pipe(Effect.orDie);
          }),
      ),
    ),
  ),
  GroupImpl.finalize,
);
