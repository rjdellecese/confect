import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FunctionImpl, GroupImpl } from "./_generated/server";
import notes from "./_generated/tables/notes";
import { DatabaseReader } from "./_generated/services";
import databaseReader, { PaginationDenied } from "./databaseReader.spec";

export default GroupImpl.make(databaseReader).pipe(
  Layer.provide(
    Layer.mergeAll(
      FunctionImpl.make(databaseReader, "getNote", ({ noteId }) =>
        Effect.gen(function* () {
          const reader = yield* DatabaseReader;

          return yield* reader.table(notes).get(noteId);
        }).pipe(Effect.orDie),
      ),
      FunctionImpl.make(databaseReader, "listNotes", () =>
        Effect.gen(function* () {
          const reader = yield* DatabaseReader;

          return yield* reader
            .table(notes)
            .index("by_creation_time", "desc")
            .collect();
        }).pipe(Effect.orDie),
      ),
      FunctionImpl.make(databaseReader, "paginateNotes", ({ paginationOpts }) =>
        Effect.gen(function* () {
          const reader = yield* DatabaseReader;

          return yield* reader
            .table(notes)
            .index("by_creation_time")
            .paginate(paginationOpts);
        }).pipe(Effect.orDie),
      ),
      FunctionImpl.make(
        databaseReader,
        "paginateNotesWithFilter",
        ({ paginationOpts, tag }) =>
          Effect.gen(function* () {
            const reader = yield* DatabaseReader;

            return yield* reader
              .table(notes)
              .index("by_creation_time")
              .paginate(paginationOpts, (q) => q.eq(q.field("tag"), tag));
          }).pipe(Effect.orDie),
      ),
      FunctionImpl.make(
        databaseReader,
        "paginateNotesOrFail",
        ({ paginationOpts, shouldFail }) =>
          Effect.gen(function* () {
            if (shouldFail) {
              return yield* PaginationDenied.make({ reason: "denied" });
            }

            const reader = yield* DatabaseReader;

            return yield* reader
              .table(notes)
              .index("by_creation_time")
              .paginate(paginationOpts)
              .pipe(Effect.orDie);
          }),
      ),
    ),
  ),
  GroupImpl.finalize,
);
