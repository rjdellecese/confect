import { ConfectApiBuilder } from "@rjdellecese/confect";
import { Effect } from "effect";
import Api from "../../_generated/api";
import {
  ConfectDatabaseReader,
  ConfectDatabaseWriter,
} from "../../_generated/services";

export const Notes = ConfectApiBuilder.group(Api, "groups.notes", (handlers) =>
  handlers
    .handle("insert", ({ text }) =>
      Effect.gen(function* () {
        const writer = yield* ConfectDatabaseWriter;

        return yield* writer.insert("notes", { text });
      }).pipe(Effect.orDie),
    )
    .handle("list", () =>
      Effect.gen(function* () {
        const reader = yield* ConfectDatabaseReader;

        return yield* reader
          .table("notes")
          .index("by_creation_time", "desc")
          .collect();
      }).pipe(Effect.orDie),
    )
    .handle("delete_", ({ noteId }) =>
      Effect.gen(function* () {
        const writer = yield* ConfectDatabaseWriter;

        yield* writer.delete("notes", noteId);

        return null;
      }).pipe(Effect.orDie),
    )
    .handle("getFirst", () =>
      Effect.gen(function* () {
        const reader = yield* ConfectDatabaseReader;

        return yield* reader.table("notes").index("by_creation_time").first();
      }).pipe(Effect.orDie),
    )
    .handle("internalGetFirst", () =>
      Effect.gen(function* () {
        const reader = yield* ConfectDatabaseReader;

        return yield* reader.table("notes").index("by_creation_time").first();
      }).pipe(Effect.orDie),
    ),
);
