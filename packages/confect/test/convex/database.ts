import { Chunk, Effect, Schema, Stream } from "effect";
import { GenericId } from "../../src/server/schemas/GenericId";
import { PaginationResult } from "../../src/server/schemas/PaginationResult";
import {
  ConfectDatabaseReader,
  ConfectDatabaseWriter,
  confectMutation,
  confectQuery,
} from "./confect";
import { confectSchema } from "./schema";

export const getById = confectQuery({
  args: Schema.Struct({
    noteId: GenericId("notes"),
  }),
  returns: confectSchema.tableSchemas.notes.withSystemFields,
  handler: ({ noteId }) =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;

      return yield* reader.table("notes").get(noteId);
    }),
});

export const getByIndex = confectQuery({
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
        .get("by_name_and_role_and_text", name, role, text);
    }),
});

export const first = confectQuery({
  args: Schema.Struct({}),
  returns: Schema.Option(confectSchema.tableSchemas.notes.withSystemFields),
  handler: () =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;
      return yield* reader.table("notes").index("by_text").first();
    }),
});

export const take = confectQuery({
  args: Schema.Struct({
    n: Schema.Number,
  }),
  returns: Schema.Array(confectSchema.tableSchemas.notes.withSystemFields),
  handler: ({ n }) =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;

      return yield* reader.table("notes").index("by_creation_time").take(n);
    }),
});

export const collect = confectQuery({
  args: Schema.Struct({}),
  returns: Schema.Array(confectSchema.tableSchemas.notes.withSystemFields),
  handler: () =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;
      return yield* reader.table("notes").index("by_creation_time").collect();
    }),
});

export const paginate = confectQuery({
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
        .index("by_creation_time")
        .paginate({ cursor, numItems });
    }),
});

export const stream = confectQuery({
  args: Schema.Struct({
    until: Schema.NonEmptyString,
  }),
  returns: Schema.Array(confectSchema.tableSchemas.notes.withSystemFields),
  handler: ({ until }) =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;

      return yield* reader
        .table("notes")
        .index("by_creation_time")
        .stream()
        .pipe(
          Stream.takeUntil(({ text }) => text === until),
          Stream.runCollect,
          Effect.andThen(Chunk.toArray),
        );
    }),
});

export const withIndexWithQueryRangeWithOrder = confectQuery({
  args: Schema.Struct({}),
  returns: Schema.Array(confectSchema.tableSchemas.notes.withSystemFields),
  handler: () =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;

      return yield* reader.table("notes").index("by_text").take(2);
    }),
});

export const withIndexWithQueryRangeWithoutOrder = confectQuery({
  args: Schema.Struct({
    text: Schema.NonEmptyString,
  }),
  returns: Schema.Array(confectSchema.tableSchemas.notes.withSystemFields),
  handler: ({ text }) =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;

      return yield* reader
        .table("notes")
        .index("by_text", (q) => q.gte("text", text))
        .take(2);
    }),
});

export const withIndexWithQueryRangeAndOrder = confectQuery({
  args: Schema.Struct({
    text: Schema.NonEmptyString,
  }),
  returns: Schema.Array(confectSchema.tableSchemas.notes.withSystemFields),
  handler: ({ text }) =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;

      return yield* reader
        .table("notes")
        .index("by_text", (q) => q.gte("text", text), "desc")
        .take(2);
    }),
});

export const withIndexWithoutQueryRangeWithOrder = confectQuery({
  args: Schema.Struct({}),
  returns: Schema.Array(confectSchema.tableSchemas.notes.withSystemFields),
  handler: () =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;

      return yield* reader.table("notes").index("by_text", "desc").take(2);
    }),
});

export const withIndexWithoutQueryRangeWithoutOrder = confectQuery({
  args: Schema.Struct({}),
  returns: Schema.Array(confectSchema.tableSchemas.notes.withSystemFields),
  handler: () =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;
      return yield* reader.table("notes").index("by_text").take(2);
    }),
});

export const withSearchIndex = confectQuery({
  args: Schema.Struct({
    text: Schema.String,
  }),
  returns: Schema.Array(confectSchema.tableSchemas.notes.withSystemFields),
  handler: ({ text }) =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;
      return yield* reader
        .table("notes")
        .search("text", (q) => q.search("text", text).eq("tag", "colors"))
        .collect();
    }),
});

export const systemGet = confectQuery({
  args: Schema.Struct({
    id: GenericId("_storage"),
  }),
  returns: confectSchema.tableSchemas._storage.withSystemFields,
  handler: ({ id }) =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;

      return yield* reader.table("_storage").get(id);
    }),
});

export const systemQuery = confectQuery({
  args: Schema.Struct({}),
  returns: Schema.Array(confectSchema.tableSchemas._storage.withSystemFields),
  handler: () =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;

      return yield* reader
        .table("_storage")
        .index("by_creation_time")
        .collect();
    }),
});

// Exporting only to stop TypeScript from complaining.
export const _badPatch = confectMutation({
  args: Schema.Struct({
    noteId: GenericId("notes"),
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

export const patch = confectMutation({
  args: Schema.Struct({
    noteId: GenericId("notes"),
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

export const patchUnset = confectMutation({
  args: Schema.Struct({
    noteId: GenericId("notes"),
  }),
  returns: Schema.Null,
  handler: ({ noteId }) =>
    Effect.gen(function* () {
      const writer = yield* ConfectDatabaseWriter;

      yield* writer.patch("notes", noteId, { author: undefined });

      return null;
    }),
});

export const insertTooLongText = confectMutation({
  args: Schema.Struct({
    text: Schema.String,
  }),
  returns: GenericId("notes"),
  handler: ({ text }) =>
    Effect.gen(function* () {
      const writer = yield* ConfectDatabaseWriter;

      return yield* writer.insert("notes", { text });
    }),
});

export const replace = confectMutation({
  args: Schema.Struct({
    noteId: GenericId("notes"),
    fields: Schema.Struct({
      _id: Schema.optional(GenericId("notes")),
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

export const delete_ = confectMutation({
  args: Schema.Struct({
    noteId: GenericId("notes"),
  }),
  returns: Schema.Null,
  handler: ({ noteId }) =>
    Effect.gen(function* () {
      const writer = yield* ConfectDatabaseWriter;

      yield* writer.delete("notes", noteId);

      return null;
    }),
});
