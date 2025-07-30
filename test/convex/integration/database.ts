import {
  Array,
  Chunk,
  Effect,
  Option,
  type ParseResult,
  Schema,
  Stream,
} from "effect";
import { Id } from "~/src/server/schemas/Id";
import { PaginationResult } from "~/src/server/schemas/PaginationResult";
import { api } from "~/test/convex/_generated/api";
import {
  action,
  ConfectDatabaseReader,
  ConfectDatabaseWriter,
  ConfectQueryRunner,
  ConfectVectorSearch,
  mutation,
  query,
} from "~/test/convex/confect";
import { confectSchema } from "~/test/convex/schema";

export const databaseReaderGetById = query({
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

export const databaseReaderGetManyById = query({
  args: Schema.Struct({
    noteIds: Schema.Array(Id("notes")),
  }),
  returns: Schema.Array(confectSchema.tableSchemas.notes.withSystemFields),
  handler: ({ noteIds }) =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;
      return yield* reader.table("notes").getManyById(noteIds);
    }),
});

export const queryGetById = query({
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

export const queryGetManyById = query({
  args: Schema.Struct({
    noteIds: Schema.Array(Id("notes")),
  }),
  returns: Schema.Array(confectSchema.tableSchemas.notes.withSystemFields),
  handler: ({ noteIds }) =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;
      return yield* reader.table("notes").getManyById(noteIds);
    }),
});

export const queryOrderedUnique = query({
  args: Schema.Struct({}),
  returns: confectSchema.tableSchemas.notes.withSystemFields,
  handler: () =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;
      return yield* reader.table("notes").order("desc").unique();
    }),
});

export const queryOrderedTake = query({
  args: Schema.Struct({
    n: Schema.Positive,
  }),
  returns: Schema.Array(confectSchema.tableSchemas.notes.withSystemFields),
  handler: ({ n }) =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;
      return yield* reader.table("notes").order("desc").take(n);
    }),
});

export const queryGetByIndexOneField = query({
  args: Schema.Struct({
    text: Schema.String,
  }),
  returns: confectSchema.tableSchemas.notes.withSystemFields,
  handler: ({ text }) =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;
      return yield* reader.table("notes").getByIndex("by_text", text);
    }),
});

export const queryGetByIndexThreeFields = query({
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

export const mutationGet = mutation({
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

export const insert = mutation({
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

export const queryCollect = query({
  args: Schema.Struct({}),
  returns: Schema.Array(confectSchema.tableSchemas.notes.withSystemFields),
  handler: () =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;

      return yield* reader.table("notes").collect();
    }),
});

export const mutationCollect = mutation({
  args: Schema.Struct({}),
  returns: Schema.Array(confectSchema.tableSchemas.notes.withSystemFields),
  handler: () =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;

      return yield* reader.table("notes").collect();
    }),
});

export const withIndexFirst = query({
  args: Schema.Struct({
    text: Schema.String,
  }),
  returns: confectSchema.tableSchemas.notes.withSystemFields,
  handler: ({ text }) =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;

      return yield* reader
        .table("notes")
        .withIndex("by_text", (q) => q.eq("text", text))
        .order("desc")
        .first();
    }),
});

export const orderDescCollect = query({
  args: Schema.Struct({}),
  returns: Schema.Array(confectSchema.tableSchemas.notes.withSystemFields),
  handler: () =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;

      return yield* reader.table("notes").order("desc").collect();
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

      return yield* reader.table("notes").take(n);
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

      return yield* reader.table("notes").paginate({ cursor, numItems });
    }),
});

export const unique = query({
  args: Schema.Struct({}),
  returns: Schema.Option(confectSchema.tableSchemas.notes.withSystemFields),
  handler: () =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;

      return yield* reader
        .table("notes")
        .unique()
        .pipe(
          Effect.map(Option.some),
          Effect.catchTag("NoDocumentsMatchQueryError", () =>
            Effect.succeed(Option.none()),
          ),
        );
    }),
});

export const onlyFirst = query({
  args: Schema.Struct({}),
  returns: Schema.Option(confectSchema.tableSchemas.notes.withSystemFields),
  handler: () =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;

      return yield* reader
        .table("notes")
        .first()
        .pipe(
          Effect.map(Option.some),
          Effect.catchTag("NoDocumentsMatchQueryError", () =>
            Effect.succeed(Option.none()),
          ),
        );
    }),
});

export const mapTextStream = query({
  args: Schema.Struct({}),
  returns: Schema.Array(Schema.String),
  handler: () =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;

      return yield* reader
        .table("notes")
        .stream()
        .pipe(
          Stream.map((note) => note.text),
          Stream.runCollect,
          Effect.map(Chunk.toArray),
        );
    }),
});

export const search = query({
  args: Schema.Struct({
    query: Schema.String,
    tag: Schema.String,
  }),
  returns: Schema.Array(Schema.String),
  handler: ({ query, tag }) =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;

      return yield* reader
        .table("notes")
        .withSearchIndex("text", (q) => q.search("text", query).eq("tag", tag))
        .collect()
        .pipe(Effect.map(Array.map((note) => note.text)));
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

export const unsetAuthorPatch = mutation({
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

export const deleteNote = mutation({
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

export const executeVectorSearch = action({
  args: Schema.Struct({
    vector: Schema.Array(Schema.Number),
    tag: Schema.Union(Schema.String, Schema.Null),
    limit: Schema.Number,
  }),
  returns: Schema.Array(
    Schema.Struct({
      text: Schema.String,
      tag: Schema.optional(Schema.String),
    }),
  ),
  handler: ({
    vector,
    tag,
    limit,
  }): Effect.Effect<
    { text: string; tag?: string }[],
    ParseResult.ParseError,
    ConfectVectorSearch | ConfectQueryRunner
  > =>
    Effect.gen(function* () {
      const { vectorSearch } = yield* ConfectVectorSearch;
      const { runQuery } = yield* ConfectQueryRunner;

      return yield* vectorSearch("notes", "embedding", {
        vector: vector as number[],
        filter: tag === null ? undefined : (q) => q.eq("tag", tag),
        limit,
      }).pipe(
        Effect.andThen(
          Effect.forEach((vectorResult) =>
            runQuery(api.functions.getVectorSearch, {
              noteId: vectorResult._id,
            }).pipe(
              Effect.andThen(
                Schema.decode(
                  confectSchema.tableSchemas.notes.withSystemFields,
                ),
              ),
              Effect.map(({ text, tag }) => ({ text, tag })),
            ),
          ),
        ),
      );
    }),
});

export const getVectorSearch = query({
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

      return yield* reader.table("_storage").collect();
    }),
});
