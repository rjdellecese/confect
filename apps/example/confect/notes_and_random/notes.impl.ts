import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import databaseSchema from "../_generated/schema";
import { DatabaseReader, DatabaseWriter } from "../_generated/services";
import notes, { NoteNotFound } from "./notes.spec";

const insert = FunctionImpl.make(databaseSchema, notes, "insert", ({ text }) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;

    return yield* writer.table("notes").insert({ text });
  }).pipe(Effect.orDie),
);

const list = FunctionImpl.make(databaseSchema, notes, "list", () =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;

    return yield* reader
      .table("notes")
      .index("by_creation_time", "desc")
      .collect();
  }).pipe(Effect.orDie),
);

const delete_ = FunctionImpl.make(
  databaseSchema,
  notes,
  "delete_",
  ({ noteId }) =>
    Effect.gen(function* () {
      const writer = yield* DatabaseWriter;

      yield* writer.table("notes").delete(noteId);

      return null;
    }).pipe(Effect.orDie),
);

const getFirst = FunctionImpl.make(databaseSchema, notes, "getFirst", () =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;

    return yield* reader.table("notes").index("by_creation_time").first();
  }).pipe(Effect.orDie),
);

const getOrFail = FunctionImpl.make(
  databaseSchema,
  notes,
  "getOrFail",
  ({ noteId }) =>
    Effect.gen(function* () {
      const reader = yield* DatabaseReader;

      return yield* reader
        .table("notes")
        .get(noteId)
        .pipe(Effect.mapError(() => new NoteNotFound({ noteId })));
    }),
);

const internalGetFirst = FunctionImpl.make(
  databaseSchema,
  notes,
  "internalGetFirst",
  () =>
    Effect.gen(function* () {
      const reader = yield* DatabaseReader;

      return yield* reader.table("notes").index("by_creation_time").first();
    }).pipe(Effect.orDie),
);

const clearAll = FunctionImpl.make(databaseSchema, notes, "clearAll", () =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const writer = yield* DatabaseWriter;
    const allNotes = yield* reader
      .table("notes")
      .index("by_creation_time")
      .collect();

    yield* Effect.forEach(allNotes, (note) =>
      writer.table("notes").delete(note._id),
    );

    return null;
  }).pipe(Effect.orDie),
);

const insertDefault = FunctionImpl.make(
  databaseSchema,
  notes,
  "insertDefault",
  ({ text }) =>
    Effect.gen(function* () {
      const writer = yield* DatabaseWriter;

      yield* writer.table("notes").insert({ text });

      return null;
    }).pipe(Effect.orDie),
);

export default GroupImpl.make(databaseSchema, notes).pipe(
  Layer.provide(insert),
  Layer.provide(list),
  Layer.provide(delete_),
  Layer.provide(getFirst),
  Layer.provide(getOrFail),
  Layer.provide(internalGetFirst),
  Layer.provide(clearAll),
  Layer.provide(insertDefault),
  GroupImpl.finalize,
);
