import { FunctionImpl, GroupImpl } from "@confect/server";
import { Effect, Layer } from "effect";
import api from "../_generated/api";
import { DatabaseReader } from "../_generated/services";

export const databaseReader = GroupImpl.make(api, "databaseReader").pipe(
  Layer.provide(
    Layer.mergeAll(
      FunctionImpl.make(api, "databaseReader", "getNote", ({ noteId }) =>
        Effect.gen(function* () {
          const reader = yield* DatabaseReader;

          return yield* reader.table("notes").get(noteId);
        }).pipe(Effect.orDie),
      ),
      FunctionImpl.make(api, "databaseReader", "listNotes", () =>
        Effect.gen(function* () {
          const reader = yield* DatabaseReader;

          return yield* reader
            .table("notes")
            .index("by_creation_time", "desc")
            .collect();
        }).pipe(Effect.orDie),
      ),
    ),
  ),
);
