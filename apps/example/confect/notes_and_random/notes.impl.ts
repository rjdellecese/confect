import { FunctionImpl, GroupImpl, QueryStream } from "@confect/server";
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

const listPaginated = FunctionImpl.make(
  databaseSchema,
  notes,
  "listPaginated",
  ({ paginationOpts }) =>
    Effect.gen(function* () {
      const reader = yield* DatabaseReader;

      return yield* reader
        .table("notes")
        .index("by_creation_time", "desc")
        .paginate(paginationOpts);
    }).pipe(Effect.orDie),
);

const insertAuthored = FunctionImpl.make(
  databaseSchema,
  notes,
  "insertAuthored",
  ({ hidden, role, text }) =>
    Effect.gen(function* () {
      const writer = yield* DatabaseWriter;

      return yield* writer.table("notes").insert({
        text,
        author: { role, name: role === "admin" ? "Ada" : "Uma" },
        ...(hidden === true ? { tag: "hidden" } : {}),
      });
    }).pipe(Effect.orDie),
);

// A stream-first feed: the union of the admin- and user-authored note
// streams (two ranges of the `by_role` index), merged newest-first by
// creation time, with an effectful filter that hides tagged notes without
// breaking pagination. Cursors resume via index-range narrowing, and pages
// stay gap-free on the client via `useStreamPaginatedQuery`'s
// endCursor pinning.
const feed = FunctionImpl.make(
  databaseSchema,
  notes,
  "feed",
  ({ paginationOpts }) =>
    Effect.gen(function* () {
      const reader = yield* DatabaseReader;

      const authoredBy = (role: "admin" | "user") =>
        reader
          .table("notes")
          .stream("by_role", (q) => q.eq("author.role", role), "desc");

      return yield* QueryStream.merge([
        authoredBy("admin"),
        authoredBy("user"),
      ]).pipe(
        QueryStream.filter((note) => note.tag !== "hidden"),
        QueryStream.paginate(paginationOpts),
      );
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
  Layer.provide(insertAuthored),
  Layer.provide(list),
  Layer.provide(listPaginated),
  Layer.provide(feed),
  Layer.provide(delete_),
  Layer.provide(getFirst),
  Layer.provide(getOrFail),
  Layer.provide(internalGetFirst),
  Layer.provide(clearAll),
  Layer.provide(insertDefault),
  GroupImpl.finalize,
);
