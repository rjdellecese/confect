import { FunctionImpl, GroupImpl } from "@rjdellecese/confect";
import { Effect, Layer } from "effect";
import {
  DatabaseReader,
  DatabaseWriter,
} from "../../../convex/confect/services";
import { api } from "../../api";

const Insert = FunctionImpl.make(api, "groups.notes", "insert", ({ text }) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;

    return yield* writer.insert("notes", { text });
  }).pipe(Effect.orDie),
);

const List = FunctionImpl.make(api, "groups.notes", "list", () =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;

    return yield* reader
      .table("notes")
      .index("by_creation_time", "desc")
      .collect();
  }).pipe(Effect.orDie),
);

const Delete = FunctionImpl.make(api, "groups.notes", "delete_", ({ noteId }) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;

    yield* writer.delete("notes", noteId);

    return null;
  }).pipe(Effect.orDie),
);

const GetFirst = FunctionImpl.make(api, "groups.notes", "getFirst", () =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;

    return yield* reader.table("notes").index("by_creation_time").first();
  }).pipe(Effect.orDie),
);

const InternalGetFirst = FunctionImpl.make(
  api,
  "groups.notes",
  "internalGetFirst",
  () =>
    Effect.gen(function* () {
      const reader = yield* DatabaseReader;

      return yield* reader.table("notes").index("by_creation_time").first();
    }).pipe(Effect.orDie),
);

export const Notes = GroupImpl.make(api, "groups.notes").pipe(
  Layer.provide(Insert),
  Layer.provide(List),
  Layer.provide(Delete),
  Layer.provide(GetFirst),
  Layer.provide(InternalGetFirst),
);
