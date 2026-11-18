import { GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FunctionImpl } from "../_generated/server";
import notesTable from "../_generated/tables/notes";
import { DatabaseReader, DatabaseWriter } from "../_generated/services";
import notes from "./notes.spec";

const insert = FunctionImpl.make(notes, "insert", ({ text }) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;

    return yield* writer.table(notesTable).insert({ text });
  }).pipe(Effect.orDie),
);

const list = FunctionImpl.make(notes, "list", () =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;

    return yield* reader
      .table(notesTable)
      .index("by_creation_time", "desc")
      .collect();
  }).pipe(Effect.orDie),
);

const delete_ = FunctionImpl.make(notes, "delete_", ({ noteId }) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;

    yield* writer.table(notesTable).delete(noteId);

    return null;
  }).pipe(Effect.orDie),
);

const getFirst = FunctionImpl.make(notes, "getFirst", () =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;

    return yield* reader.table(notesTable).index("by_creation_time").first();
  }).pipe(Effect.orDie),
);

const internalGetFirst = FunctionImpl.make(notes, "internalGetFirst", () =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;

    return yield* reader.table(notesTable).index("by_creation_time").first();
  }).pipe(Effect.orDie),
);

export default GroupImpl.make(notes).pipe(
  Layer.provide(insert),
  Layer.provide(list),
  Layer.provide(delete_),
  Layer.provide(getFirst),
  Layer.provide(internalGetFirst),
  GroupImpl.finalize,
);
