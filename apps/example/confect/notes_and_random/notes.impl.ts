import { GroupImpl, QueryStream } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FunctionImpl } from "../_generated/server";
import { DatabaseReader, DatabaseWriter } from "../_generated/services";
import notesTable from "../_generated/tables/notes";
import notes, { NoteNotFound } from "./notes.spec";

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

const listPaginated = FunctionImpl.make(
  notes,
  "listPaginated",
  ({ paginationOpts }) =>
    Effect.gen(function* () {
      const reader = yield* DatabaseReader;

      return yield* reader
        .table(notesTable)
        .index("by_creation_time", "desc")
        .paginate(paginationOpts);
    }).pipe(Effect.orDie),
);

const insertAuthored = FunctionImpl.make(
  notes,
  "insertAuthored",
  ({ hidden, role, text }) =>
    Effect.gen(function* () {
      const writer = yield* DatabaseWriter;

      return yield* writer.table(notesTable).insert({
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
const feed = FunctionImpl.make(notes, "feed", ({ paginationOpts }) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;

    const authoredBy = (role: "admin" | "user") =>
      reader
        .table(notesTable)
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

const getOrFail = FunctionImpl.make(notes, "getOrFail", ({ noteId }) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;

    return yield* reader
      .table(notesTable)
      .get(noteId)
      .pipe(Effect.mapError(() => NoteNotFound.make({ noteId })));
  }),
);

const internalGetFirst = FunctionImpl.make(notes, "internalGetFirst", () =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;

    return yield* reader.table(notesTable).index("by_creation_time").first();
  }).pipe(Effect.orDie),
);

const clearAll = FunctionImpl.make(notes, "clearAll", () =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const writer = yield* DatabaseWriter;
    const allNotes = yield* reader
      .table(notesTable)
      .index("by_creation_time")
      .collect();

    yield* Effect.forEach(
      allNotes,
      (note) => writer.table(notesTable).delete(note._id),
      { concurrency: 1 },
    );

    return null;
  }).pipe(Effect.orDie),
);

const insertDefault = FunctionImpl.make(notes, "insertDefault", ({ text }) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;

    yield* writer.table(notesTable).insert({ text });

    return null;
  }).pipe(Effect.orDie),
);

export default GroupImpl.make(notes).pipe(
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
