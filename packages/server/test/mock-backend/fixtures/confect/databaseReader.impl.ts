import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import databaseSchema from "./_generated/schema";
import { DatabaseReader } from "./_generated/services";
import databaseReader, { PaginationDenied } from "./databaseReader.spec";

export default GroupImpl.make(databaseSchema, databaseReader).pipe(
  Layer.provide(
    Layer.mergeAll(
      FunctionImpl.make(
        databaseSchema,
        databaseReader,
        "getNote",
        ({ noteId }) =>
          Effect.gen(function* () {
            const reader = yield* DatabaseReader;

            return yield* reader.table("notes").get(noteId);
          }).pipe(Effect.orDie),
      ),
      FunctionImpl.make(databaseSchema, databaseReader, "listNotes", () =>
        Effect.gen(function* () {
          const reader = yield* DatabaseReader;

          return yield* reader
            .table("notes")
            .index("by_creation_time", "desc")
            .collect();
        }).pipe(Effect.orDie),
      ),
      FunctionImpl.make(
        databaseSchema,
        databaseReader,
        "paginateNotes",
        ({ paginationOpts }) =>
          Effect.gen(function* () {
            const reader = yield* DatabaseReader;

            return yield* reader
              .table("notes")
              .index("by_creation_time")
              .paginate(paginationOpts);
          }).pipe(Effect.orDie),
      ),
      FunctionImpl.make(
        databaseSchema,
        databaseReader,
        "paginateNotesWithFilter",
        ({ paginationOpts, tag }) =>
          Effect.gen(function* () {
            const reader = yield* DatabaseReader;

            return yield* reader
              .table("notes")
              .index("by_creation_time")
              .paginate(paginationOpts, (q) => q.eq(q.field("tag"), tag));
          }).pipe(Effect.orDie),
      ),
      FunctionImpl.make(
        databaseSchema,
        databaseReader,
        "paginateNotesOrFail",
        ({ paginationOpts, shouldFail }) =>
          Effect.gen(function* () {
            if (shouldFail) {
              return yield* new PaginationDenied({ reason: "denied" });
            }

            const reader = yield* DatabaseReader;

            return yield* reader
              .table("notes")
              .index("by_creation_time")
              .paginate(paginationOpts)
              .pipe(Effect.orDie);
          }),
      ),
    ),
  ),
  GroupImpl.finalize,
);
