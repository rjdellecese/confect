import {
  ConfectApiFunctionImpl,
  ConfectApiGroupImpl,
} from "@rjdellecese/confect";
import { Effect, Layer } from "effect";
import Api from "../../_generated/api";
import {
  ConfectDatabaseReader,
  ConfectDatabaseWriter,
} from "../../_generated/services";

const Insert = ConfectApiFunctionImpl.make(
  Api,
  "groups.notes",
  "insert",
  ({ text }) =>
    Effect.gen(function* () {
      const writer = yield* ConfectDatabaseWriter;

      return yield* writer.insert("notes", { text });
    }).pipe(Effect.orDie),
);

const List = ConfectApiFunctionImpl.make(Api, "groups.notes", "list", () =>
  Effect.gen(function* () {
    const reader = yield* ConfectDatabaseReader;

    return yield* reader
      .table("notes")
      .index("by_creation_time", "desc")
      .collect();
  }).pipe(Effect.orDie),
);

const Delete = ConfectApiFunctionImpl.make(
  Api,
  "groups.notes",
  "delete_",
  ({ noteId }) =>
    Effect.gen(function* () {
      const writer = yield* ConfectDatabaseWriter;

      yield* writer.delete("notes", noteId);

      return null;
    }).pipe(Effect.orDie),
);

const GetFirst = ConfectApiFunctionImpl.make(
  Api,
  "groups.notes",
  "getFirst",
  () =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;

      return yield* reader.table("notes").index("by_creation_time").first();
    }).pipe(Effect.orDie),
);

const InternalGetFirst = ConfectApiFunctionImpl.make(
  Api,
  "groups.notes",
  "internalGetFirst",
  () =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;

      return yield* reader.table("notes").index("by_creation_time").first();
    }).pipe(Effect.orDie),
);

export const Notes = ConfectApiGroupImpl.make(Api, "groups.notes").pipe(
  Layer.provide(Insert),
  Layer.provide(List),
  Layer.provide(Delete),
  Layer.provide(GetFirst),
  Layer.provide(InternalGetFirst),
);
