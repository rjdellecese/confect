import { Effect, Layer } from "effect";
import { FunctionImpl, GroupImpl } from "../../../../src/index";
import { DatabaseReader, DatabaseWriter } from "../../_generated/services";
import { api } from "../../api";

const insert = FunctionImpl.make(api, "groups.notes", "insert", ({ text }) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;

    return yield* writer.insert("notes", { text });
  }).pipe(Effect.orDie),
);

const list = FunctionImpl.make(api, "groups.notes", "list", () =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;

    return yield* reader
      .table("notes")
      .index("by_creation_time", "desc")
      .collect();
  }).pipe(Effect.orDie),
);

const delete_ = FunctionImpl.make(
  api,
  "groups.notes",
  "delete_",
  ({ noteId }) =>
    Effect.gen(function* () {
      const writer = yield* DatabaseWriter;

      yield* writer.delete("notes", noteId);

      return null;
    }).pipe(Effect.orDie),
);

const getFirst = FunctionImpl.make(api, "groups.notes", "getFirst", () =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;

    return yield* reader.table("notes").index("by_creation_time").first();
  }).pipe(Effect.orDie),
);

const internalGetFirst = FunctionImpl.make(
  api,
  "groups.notes",
  "internalGetFirst",
  () =>
    Effect.gen(function* () {
      const reader = yield* DatabaseReader;

      return yield* reader.table("notes").index("by_creation_time").first();
    }).pipe(Effect.orDie),
);

export const notes = GroupImpl.make(api, "groups.notes").pipe(
  Layer.provide(insert),
  Layer.provide(list),
  Layer.provide(delete_),
  Layer.provide(getFirst),
  Layer.provide(internalGetFirst),
);
