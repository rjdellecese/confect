import { FunctionImpl, GroupImpl } from "@rjdellecese/confect";
import { Effect, Layer } from "effect";
import Api from "../../_generated/api";
import { DatabaseReader, DatabaseWriter } from "../../_generated/services";

const insert = FunctionImpl.make(Api, "groups.notes", "insert", ({ text }) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;

    return yield* writer.insert("notes", { text });
  }).pipe(Effect.orDie),
);

const list = FunctionImpl.make(Api, "groups.notes", "list", () =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;

    return yield* reader
      .table("notes")
      .index("by_creation_time", "desc")
      .collect();
  }).pipe(Effect.orDie),
);

const delete_ = FunctionImpl.make(
  Api,
  "groups.notes",
  "delete_",
  ({ noteId }) =>
    Effect.gen(function* () {
      const writer = yield* DatabaseWriter;

      yield* writer.delete("notes", noteId);

      return null;
    }).pipe(Effect.orDie),
);

const getFirst = FunctionImpl.make(Api, "groups.notes", "getFirst", () =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;

    return yield* reader.table("notes").index("by_creation_time").first();
  }).pipe(Effect.orDie),
);

const internalGetFirst = FunctionImpl.make(
  Api,
  "groups.notes",
  "internalGetFirst",
  () =>
    Effect.gen(function* () {
      const reader = yield* DatabaseReader;

      return yield* reader.table("notes").index("by_creation_time").first();
    }).pipe(Effect.orDie),
);

export const notes = GroupImpl.make(Api, "groups.notes").pipe(
  Layer.provide(insert),
  Layer.provide(list),
  Layer.provide(delete_),
  Layer.provide(getFirst),
  Layer.provide(internalGetFirst),
);
