import {
  Array,
  Chunk,
  Effect,
  Option,
  type ParseResult,
  Schema,
  Stream,
  pipe,
} from "effect";
import { Id } from "~/src/server/schemas/Id";
import { PaginationResult } from "~/src/server/schemas/PaginationResult";
import { api, internal } from "~/test/convex/_generated/api";
import {
  ConfectDatabaseReader,
  ConfectActionCtx,
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  ConfectDatabaseWriter,
} from "~/test/convex/confect_";
import { confectSchema } from "~/test/convex/schema";
import type {
  DocumentDecodeError,
  DocumentEncodeError,
} from "~/src/server/database_";

export const queryGet = query({
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
      const { db } = yield* ConfectQueryCtx;

      return yield* db
        .query("notes")
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
      const { db } = yield* ConfectMutationCtx;

      return yield* db.replace(noteId, fields).pipe(Effect.as(null));
    }),
});

export const deleteNote = mutation({
  args: Schema.Struct({
    noteId: Id("notes"),
  }),
  returns: Schema.Null,
  handler: ({ noteId }) =>
    Effect.gen(function* () {
      const { db } = yield* ConfectMutationCtx;

      return yield* db.delete(noteId).pipe(Effect.as(null));
    }),
});

export const isAuthenticated = query({
  args: Schema.Struct({}),
  returns: Schema.Boolean,
  handler: () =>
    Effect.gen(function* () {
      const { auth } = yield* ConfectQueryCtx;

      return yield* auth.getUserIdentity().pipe(Effect.map(Option.isSome));
    }),
});

// Action

export const actionQuery = internalQuery({
  args: Schema.Struct({}),
  returns: Schema.Null,
  handler: () =>
    Effect.gen(function* () {
      const { db } = yield* ConfectQueryCtx;

      return yield* db.query("notes").collect().pipe(Effect.as(null));
    }),
});

export const actionMutation = internalMutation({
  args: Schema.Struct({}),
  returns: Id("notes"),
  handler: () =>
    Effect.gen(function* () {
      const { db } = yield* ConfectMutationCtx;

      return yield* db.insert("notes", { text: "Hello, world!" });
    }),
});

export const actionNoop = internalAction({
  args: Schema.Struct({}),
  returns: Schema.Null,
  handler: (_ctx) => Effect.succeed(null),
});

export const runQueryAndMutation = action({
  args: Schema.Struct({}),
  returns: Schema.Null,
  handler: (): Effect.Effect<null, never, ConfectActionCtx> =>
    Effect.gen(function* () {
      const { runQuery, runMutation, runAction } = yield* ConfectActionCtx;

      yield* runQuery(internal.functions.actionQuery);
      yield* runMutation(internal.functions.actionMutation);
      yield* runAction(internal.functions.actionNoop);

      return null;
    }),
});

export const actionWithAuthAndRunMethods = action({
  args: Schema.Struct({}),
  returns: Schema.Null,
  handler: (): Effect.Effect<null, never, ConfectActionCtx> =>
    Effect.gen(function* () {
      const { auth, runAction } = yield* ConfectActionCtx;

      yield* auth.getUserIdentity().pipe(
        Effect.andThen(
          Option.match({
            onNone: () => Effect.die,
            onSome: () => Effect.void,
          }),
        ),
      );

      yield* runAction(api.functions.runQueryAndMutation);

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
    ConfectActionCtx
  > =>
    Effect.gen(function* () {
      const { vectorSearch, runQuery } = yield* ConfectActionCtx;

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
                  Schema.Option(
                    confectSchema.tableSchemas.notes.withSystemFields,
                  ),
                ),
              ),
              Effect.map(Option.getOrThrow),
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

// Scheduler

export const insertAfter = action({
  args: Schema.Struct({
    text: Schema.String,
    millis: Schema.Number,
  }),
  returns: Schema.Null,
  handler: ({ text, millis }): Effect.Effect<null, never, ConfectActionCtx> =>
    Effect.gen(function* () {
      const { scheduler } = yield* ConfectActionCtx;

      return yield* scheduler
        .runAfter(millis, api.functions.scheduledInsert, {
          text,
        })
        .pipe(Effect.as(null));
    }),
});

export const scheduledInsert = mutation({
  args: Schema.Struct({
    text: Schema.String,
  }),
  returns: Schema.Null,
  handler: ({
    text,
  }): Effect.Effect<
    null,
    DocumentEncodeError | DocumentDecodeError,
    ConfectDatabaseWriter
  > =>
    Effect.gen(function* () {
      const writer = yield* ConfectDatabaseWriter;

      yield* writer.insert("notes", { text });

      return null;
    }),
});

export const insertAt = action({
  args: Schema.Struct({
    text: Schema.String,
    timestamp: Schema.Number,
  }),
  returns: Schema.Null,
  handler: ({
    text,
    timestamp,
  }): Effect.Effect<null, never, ConfectActionCtx> =>
    Effect.gen(function* () {
      const { scheduler } = yield* ConfectActionCtx;

      return yield* scheduler
        .runAt(timestamp, api.functions.scheduledInsert, {
          text,
        })
        .pipe(Effect.as(null));
    }),
});

export const systemNormalizeId = query({
  args: Schema.Struct({
    id: Id("_storage"),
  }),
  returns: Schema.Option(Id("_storage")),
  handler: ({ id }) =>
    Effect.gen(function* () {
      const { db } = yield* ConfectQueryCtx;

      return db.system.normalizeId("_storage", id);
    }),
});

export const systemGet = query({
  args: Schema.Struct({
    id: Id("_storage"),
  }),
  returns: Schema.Option(confectSchema.tableSchemas._storage.withSystemFields),
  handler: ({ id }) =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;

      return yield* db.system.get(id);
    }),
});

export const systemQuery = query({
  args: Schema.Struct({}),
  returns: Schema.Array(confectSchema.tableSchemas._storage.withSystemFields),
  handler: () =>
    Effect.gen(function* () {
      const { db } = yield* ConfectQueryCtx;

      return yield* db.system.query("_storage").collect();
    }),
});

export const storageGetUrl = action({
  args: Schema.Struct({
    id: Id("_storage"),
  }),
  returns: Schema.Option(Schema.String),
  handler: ({
    id,
  }): Effect.Effect<Option.Option<string>, never, ConfectActionCtx> =>
    Effect.gen(function* () {
      const { storage } = yield* ConfectActionCtx;

      return yield* storage.getUrl(id);
    }),
});

export const storageGenerateUploadUrl = action({
  args: Schema.Struct({}),
  returns: Schema.String,
  handler: (): Effect.Effect<string, never, ConfectActionCtx> =>
    Effect.gen(function* () {
      const { storage } = yield* ConfectActionCtx;

      return yield* storage.generateUploadUrl();
    }),
});

export const storageDelete = action({
  args: Schema.Struct({
    id: Id("_storage"),
  }),
  returns: Schema.Null,
  handler: ({ id }): Effect.Effect<null, never, ConfectActionCtx> =>
    Effect.gen(function* () {
      const { storage } = yield* ConfectActionCtx;

      return yield* storage.delete(id).pipe(Effect.as(null));
    }),
});
