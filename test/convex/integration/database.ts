import { Chunk, Effect, Schema, Stream } from "effect";
import { Id } from "~/src/server/schemas/Id";
import { PaginationResult } from "~/src/server/schemas/PaginationResult";
import {
  ConfectDatabaseReader,
  ConfectDatabaseWriter,
  mutation,
  query,
} from "~/test/convex/confect";
import { confectSchema } from "~/test/convex/schema";

export const getById = query({
  args: Schema.Struct({
    noteId: Id("notes"),
  }),
  returns: confectSchema.tableSchemas.notes.withSystemFields,
  handler: ({ noteId }) =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;

      return yield* reader.table("notes").getbyId(noteId);
    }),
});

export const getByIndex = query({
  args: Schema.Struct({
    name: Schema.String,
    role: Schema.Literal("admin", "user"),
    text: Schema.String,
  }),
  returns: confectSchema.tableSchemas.notes.withSystemFields,
  handler: ({ name, role, text }) =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;

      return yield* reader
        .table("notes")
        .getByIndex("by_name_and_role_and_text", name, role, text);
    }),
});

export const first = query({
  args: Schema.Struct({}),
  returns: Schema.Option(confectSchema.tableSchemas.notes.withSystemFields),
  handler: () =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;
      return yield* reader.table("notes").withIndex("by_text").first();
    }),
});

export const take = query({
  args: Schema.Struct({
    n: Schema.Number,
  }),
  returns: Schema.Array(confectSchema.tableSchemas.notes.withSystemFields),
  handler: ({ n }) =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;

      return yield* reader.table("notes").withIndex("by_creation_time").take(n);
    }),
});

export const collect = query({
  args: Schema.Struct({}),
  returns: Schema.Array(confectSchema.tableSchemas.notes.withSystemFields),
  handler: () =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;
      return yield* reader
        .table("notes")
        .withIndex("by_creation_time")
        .collect();
    }),
});

export const paginate = query({
  args: Schema.Struct({
    cursor: Schema.Union(Schema.String, Schema.Null),
    numItems: Schema.Number,
  }),
  returns: PaginationResult(confectSchema.tableSchemas.notes.withSystemFields),
  handler: ({ cursor, numItems }) =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;

      return yield* reader
        .table("notes")
        .withIndex("by_creation_time")
        .paginate({ cursor, numItems });
    }),
});

export const stream = query({
  args: Schema.Struct({
    until: Schema.NonEmptyString,
  }),
  returns: Schema.Array(confectSchema.tableSchemas.notes.withSystemFields),
  handler: ({ until }) =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;

      return yield* reader
        .table("notes")
        .withIndex("by_creation_time")
        .stream()
        .pipe(
          Stream.takeUntil(({ text }) => text === until),
          Stream.runCollect,
          Effect.andThen(Chunk.toArray),
        );
    }),
});

export const withIndexWithQueryRangeWithOrder = query({
  args: Schema.Struct({}),
  returns: Schema.Array(confectSchema.tableSchemas.notes.withSystemFields),
  handler: () =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;

      return yield* reader.table("notes").withIndex("by_text").take(2);
    }),
});

export const withIndexWithQueryRangeWithoutOrder = query({
  args: Schema.Struct({
    text: Schema.NonEmptyString,
  }),
  returns: Schema.Array(confectSchema.tableSchemas.notes.withSystemFields),
  handler: ({ text }) =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;

      return yield* reader
        .table("notes")
        .withIndex("by_text", (q) => q.gte("text", text))
        .take(2);
    }),
});

export const withIndexWithQueryRangeAndOrder = query({
  args: Schema.Struct({
    text: Schema.NonEmptyString,
  }),
  returns: Schema.Array(confectSchema.tableSchemas.notes.withSystemFields),
  handler: ({ text }) =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;

      return yield* reader
        .table("notes")
        .withIndex("by_text", (q) => q.gte("text", text), "desc")
        .take(2);
    }),
});

export const withIndexWithoutQueryRangeWithOrder = query({
  args: Schema.Struct({}),
  returns: Schema.Array(confectSchema.tableSchemas.notes.withSystemFields),
  handler: () =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;

      return yield* reader.table("notes").withIndex("by_text", "desc").take(2);
    }),
});

export const withIndexWithoutQueryRangeWithoutOrder = query({
  args: Schema.Struct({}),
  returns: Schema.Array(confectSchema.tableSchemas.notes.withSystemFields),
  handler: () =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;
      return yield* reader.table("notes").withIndex("by_text").take(2);
    }),
});

export const withSearchIndex = query({
  args: Schema.Struct({
    text: Schema.String,
  }),
  returns: Schema.Array(confectSchema.tableSchemas.notes.withSystemFields),
  handler: ({ text }) =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;
      return yield* reader
        .table("notes")
        .withSearchIndex("text", (q) =>
          q.search("text", text).eq("tag", "colors"),
        )
        .collect();
    }),
});

export const systemGet = query({
  args: Schema.Struct({
    id: Id("_storage"),
  }),
  returns: confectSchema.tableSchemas._storage.withSystemFields,
  handler: ({ id }) =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;

      return yield* reader.table("_storage").getbyId(id);
    }),
});

export const systemQuery = query({
  args: Schema.Struct({}),
  returns: Schema.Array(confectSchema.tableSchemas._storage.withSystemFields),
  handler: () =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;

      return yield* reader
        .table("_storage")
        .withIndex("by_creation_time")
        .collect();
    }),
});

// Exporting only to stop TypeScript from complaining.
export const _badPatch = mutation({
  args: Schema.Struct({
    noteId: Id("notes"),
  }),
  returns: Schema.Null,
  handler: ({ noteId }) =>
    Effect.gen(function* () {
      const writer = yield* ConfectDatabaseWriter;

      yield* writer.patch("notes", noteId, {
        // @ts-expect-error: Should not be able to set `_id`
        _id: noteId,
      });

      yield* writer.patch("notes", noteId, {
        // @ts-expect-error: Should not be able to set `_creationTime`
        _creationTime: 0,
      });

      return null;
    }),
});

export const patch = mutation({
  args: Schema.Struct({
    noteId: Id("notes"),
    fields: Schema.Struct({
      text: Schema.optional(Schema.String),
      author: Schema.optional(
        Schema.Struct({
          role: Schema.Literal("admin", "user"),
          name: Schema.String,
        }),
      ),
    }),
  }),
  returns: Schema.Null,
  handler: ({ noteId, fields }) =>
    Effect.gen(function* () {
      const writer = yield* ConfectDatabaseWriter;

      yield* writer.patch("notes", noteId, fields);

      return null;
    }),
});

export const patchUnset = mutation({
  args: Schema.Struct({
    noteId: Id("notes"),
  }),
  returns: Schema.Null,
  handler: ({ noteId }) =>
    Effect.gen(function* () {
      const writer = yield* ConfectDatabaseWriter;

      yield* writer.patch("notes", noteId, { author: undefined });

      return null;
    }),
});

export const insertTooLongText = mutation({
  args: Schema.Struct({
    text: Schema.String,
  }),
  returns: Id("notes"),
  handler: ({ text }) =>
    Effect.gen(function* () {
      const writer = yield* ConfectDatabaseWriter;

      return yield* writer.insert("notes", { text });
    }),
});

export const replace = mutation({
  args: Schema.Struct({
    noteId: Id("notes"),
    fields: Schema.Struct({
      _id: Schema.optional(Id("notes")),
      _creationTime: Schema.optional(Schema.Number),
      text: Schema.String,
    }),
  }),
  returns: Schema.Null,
  handler: ({ noteId, fields }) =>
    Effect.gen(function* () {
      const writer = yield* ConfectDatabaseWriter;

      yield* writer.replace("notes", noteId, fields);

      return null;
    }),
});

export const delete_ = mutation({
  args: Schema.Struct({
    noteId: Id("notes"),
  }),
  returns: Schema.Null,
  handler: ({ noteId }) =>
    Effect.gen(function* () {
      const writer = yield* ConfectDatabaseWriter;

      yield* writer.delete("notes", noteId);

      return null;
    }),
});
