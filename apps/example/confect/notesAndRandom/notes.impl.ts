import { FunctionImpl, GroupImpl } from "@confect/server";
import { Effect, Layer } from "effect";
import api from "../_generated/api";
import { DatabaseReader, DatabaseWriter } from "../_generated/services";
import { NoteNotFound } from "./notes.spec";

const insert = FunctionImpl.make(
  api,
  "notesAndRandom.notes",
  "insert",
  ({ text }) =>
    Effect.gen(function* () {
      const writer = yield* DatabaseWriter;

      return yield* writer.table("notes").insert({ text });
    }).pipe(Effect.orDie),
);

const list = FunctionImpl.make(api, "notesAndRandom.notes", "list", () =>
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
  "notesAndRandom.notes",
  "delete_",
  ({ noteId }) =>
    Effect.gen(function* () {
      const writer = yield* DatabaseWriter;

      yield* writer.table("notes").delete(noteId);

      return null;
    }).pipe(Effect.orDie),
);

const getFirst = FunctionImpl.make(
  api,
  "notesAndRandom.notes",
  "getFirst",
  () =>
    Effect.gen(function* () {
      const reader = yield* DatabaseReader;

      return yield* reader.table("notes").index("by_creation_time").first();
    }).pipe(Effect.orDie),
);

const getOrFail = FunctionImpl.make(
  api,
  "notesAndRandom.notes",
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
  api,
  "notesAndRandom.notes",
  "internalGetFirst",
  () =>
    Effect.gen(function* () {
      const reader = yield* DatabaseReader;

      return yield* reader.table("notes").index("by_creation_time").first();
    }).pipe(Effect.orDie),
);

const clearAll = FunctionImpl.make(
  api,
  "notesAndRandom.notes",
  "clearAll",
  () =>
    Effect.gen(function* () {
      const reader = yield* DatabaseReader;
      const writer = yield* DatabaseWriter;
      const allNotes = yield* reader
        .table("notes")
        .index("by_creation_time")
        .collect();

      for (const note of allNotes) {
        yield* writer.table("notes").delete(note._id);
      }

      return null;
    }).pipe(Effect.orDie),
);

const insertDefault = FunctionImpl.make(
  api,
  "notesAndRandom.notes",
  "insertDefault",
  ({ text }) =>
    Effect.gen(function* () {
      const writer = yield* DatabaseWriter;

      yield* writer.table("notes").insert({ text });

      return null;
    }).pipe(Effect.orDie),
);

export const notes = GroupImpl.make(api, "notesAndRandom.notes").pipe(
  Layer.provide(insert),
  Layer.provide(list),
  Layer.provide(delete_),
  Layer.provide(getFirst),
  Layer.provide(getOrFail),
  Layer.provide(internalGetFirst),
  Layer.provide(clearAll),
  Layer.provide(insertDefault),
);
