import { Schema } from "@effect/schema";
import { Array, Chunk, Effect, Option, Stream, pipe } from "effect";

import type { PaginationResult } from "convex/server";
import { SchemaId } from "~/src/SchemaId";
import { api, internal } from "~/test/convex/_generated/api";
import type { Id } from "~/test/convex/_generated/dataModel";
import {
	action,
	internalAction,
	internalMutation,
	internalQuery,
	mutation,
	query,
} from "~/test/convex/confect_functions";
import type { ConfectDoc } from "~/test/convex/confect_functions";
import {
	type TableName,
	schema,
	tableName,
} from "~/test/convex/schemas/basic_schema_operations";

export const tables = schema.tables;

export const queryGet = query({
	args: Schema.Struct({
		noteId: SchemaId<TableName<"notes">>(),
	}),
	handler: (
		{ db },
		{ noteId },
	): Effect.Effect<ConfectDoc<TableName<"notes">> | null> =>
		db.get(noteId).pipe(Effect.map(Option.getOrNull)),
});

export const mutationGet = mutation({
	args: Schema.Struct({
		noteId: SchemaId<TableName<"notes">>(),
	}),
	handler: (
		{ db },
		{ noteId },
	): Effect.Effect<ConfectDoc<TableName<"notes">> | null> =>
		db.get(noteId).pipe(Effect.map(Option.getOrNull)),
});

export const insert = mutation({
	args: Schema.Struct({
		text: Schema.String,
	}),
	handler: ({ db }, { text }): Effect.Effect<Id<TableName<"notes">>> =>
		db.insert(tableName("notes"), { text }).pipe(Effect.orDie),
});

export const queryCollect = query({
	args: Schema.Struct({}),
	handler: ({ db }): Effect.Effect<ConfectDoc<TableName<"notes">>[]> =>
		db.query(tableName("notes")).collect(),
});

export const mutationCollect = mutation({
	args: Schema.Struct({}),
	handler: ({ db }): Effect.Effect<ConfectDoc<TableName<"notes">>[]> =>
		db.query(tableName("notes")).collect(),
});

export const filterFirst = query({
	args: Schema.Struct({
		text: Schema.String,
	}),
	handler: (
		{ db },
		{ text },
	): Effect.Effect<ConfectDoc<TableName<"notes">> | null> =>
		db
			.query(tableName("notes"))
			.filter((q) => q.eq(q.field("text"), text))
			.first()
			.pipe(Effect.map(Option.getOrNull)),
});

export const withIndexFirst = query({
	args: Schema.Struct({
		text: Schema.String,
	}),
	handler: (
		{ db },
		{ text },
	): Effect.Effect<ConfectDoc<TableName<"notes">> | null> =>
		db
			.query(tableName("notes"))
			.withIndex("by_text", (q) => q.eq("text", text))
			.first()
			.pipe(Effect.map(Option.getOrNull)),
});

export const orderDescCollect = query({
	args: Schema.Struct({}),
	handler: ({ db }): Effect.Effect<ConfectDoc<TableName<"notes">>[]> =>
		db.query(tableName("notes")).order("desc").collect(),
});

export const take = query({
	args: Schema.Struct({
		n: Schema.Number,
	}),
	handler: ({ db }, { n }): Effect.Effect<ConfectDoc<TableName<"notes">>[]> =>
		db.query(tableName("notes")).take(n),
});

export const paginate = query({
	args: Schema.Struct({
		cursor: Schema.Union(Schema.String, Schema.Null),
		numItems: Schema.Number,
	}),
	handler: (
		{ db },
		{ cursor, numItems },
	): Effect.Effect<PaginationResult<ConfectDoc<TableName<"notes">>>> => {
		return db.query(tableName("notes")).paginate({ cursor, numItems });
	},
});

export const unique = query({
	args: Schema.Struct({}),
	handler: ({
		db,
	}): Effect.Effect<ConfectDoc<TableName<"notes">> | null | "NotUniqueError"> =>
		db
			.query(tableName("notes"))
			.unique()
			.pipe(
				Effect.map(Option.getOrNull),
				Effect.catchTag("NotUniqueError", ({ _tag }) => Effect.succeed(_tag)),
			),
});

export const onlyFirst = query({
	args: Schema.Struct({}),
	handler: ({ db }): Effect.Effect<ConfectDoc<TableName<"notes">> | null> =>
		db.query(tableName("notes")).first().pipe(Effect.map(Option.getOrNull)),
});

export const mapTextStream = query({
	args: Schema.Struct({}),
	handler: ({ db }): Effect.Effect<string[]> =>
		Effect.gen(function* () {
			const stream = db.query(tableName("notes")).stream();
			return yield* pipe(
				stream,
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
	handler: ({ db }, { query, tag }): Effect.Effect<string[]> =>
		db
			.query(tableName("notes"))
			.withSearchIndex("text", (q) => q.search("text", query).eq("tag", tag))
			.collect()
			.pipe(Effect.map(Array.map((note) => note.text))),
});

export const queryNormalizeId = query({
	args: Schema.Struct({
		noteId: SchemaId<TableName<"notes">>(),
	}),
	handler: ({ db }, { noteId }): Effect.Effect<Id<TableName<"notes">> | null> =>
		pipe(
			db.normalizeId(tableName("notes"), noteId),
			Option.getOrNull,
			Effect.succeed,
		),
});

export const mutationNormalizeId = mutation({
	args: Schema.Struct({
		noteId: SchemaId<TableName<"notes">>(),
	}),
	handler: ({ db }, { noteId }): Effect.Effect<Id<TableName<"notes">> | null> =>
		pipe(
			db.normalizeId(tableName("notes"), noteId),
			Option.getOrNull,
			Effect.succeed,
		),
});

// Exporting only to stop TypeScript from complaining.
export const _badPatch = mutation({
	args: Schema.Struct({
		noteId: SchemaId<TableName<"notes">>(),
	}),
	handler: ({ db }, { noteId }) =>
		Effect.gen(function* () {
			yield* db.patch(noteId, {
				// @ts-expect-error: Should not be able to set `_id`
				_id: noteId,
			});

			yield* db.patch(noteId, {
				// @ts-expect-error: Should not be able to set `_creationTime`
				_creationTime: 0,
			});
		}).pipe(Effect.orDie),
});

export const patch = mutation({
	args: Schema.Struct({
		noteId: SchemaId<TableName<"notes">>(),
		fields: Schema.Struct({
			// TODO: Better error messages for `Schema.optionalWith` when `{ exact: true }` is not present
			text: Schema.optionalWith(Schema.String, { exact: true }),
			author: Schema.optionalWith(
				Schema.Struct({
					role: Schema.Literal("admin", "user"),
					name: Schema.String,
				}),
				{ exact: true },
			),
		}),
	}),
	handler: ({ db }, { noteId, fields }) =>
		db.patch(noteId, fields).pipe(Effect.orDie),
});

export const unsetAuthorPatch = mutation({
	args: Schema.Struct({
		noteId: SchemaId<TableName<"notes">>(),
	}),
	handler: ({ db }, { noteId }) =>
		db.patch(noteId, { author: undefined }).pipe(Effect.orDie),
});

export const insertTooLongText = mutation({
	args: Schema.Struct({
		text: Schema.String,
	}),
	handler: ({ db }, { text }) =>
		db.insert(tableName("notes"), { text }).pipe(Effect.orDie),
});

export const replace = mutation({
	args: Schema.Struct({
		noteId: SchemaId<TableName<"notes">>(),
		fields: Schema.Struct({
			_id: Schema.optionalWith(SchemaId<TableName<"notes">>(), { exact: true }),
			_creationTime: Schema.optionalWith(Schema.Number, { exact: true }),
			text: Schema.String,
		}),
	}),
	handler: ({ db }, { noteId, fields }) =>
		db.replace(noteId, fields).pipe(Effect.orDie),
});

export const deleteNote = mutation({
	args: Schema.Struct({
		noteId: SchemaId<TableName<"notes">>(),
	}),
	handler: ({ db }, { noteId }): Effect.Effect<void> => db.delete(noteId),
});

export const isAuthenticated = query({
	args: Schema.Struct({}),
	handler: ({ auth }): Effect.Effect<boolean> =>
		pipe(auth.getUserIdentity(), Effect.map(Option.isSome)),
});

// Action

export const actionQuery = internalQuery({
	args: Schema.Struct({}),
	handler: ({ db }): Effect.Effect<void> =>
		db.query(tableName("notes")).collect(),
});

export const actionMutation = internalMutation({
	args: Schema.Struct({}),
	handler: ({ db }): Effect.Effect<void> =>
		db.insert(tableName("notes"), { text: "Hello, world!" }).pipe(Effect.orDie),
});

export const actionNoop = internalAction({
	args: Schema.Struct({}),
	handler: (_ctx) => Effect.void,
});

export const runQueryAndMutation = action({
	args: Schema.Struct({}),
	handler: (ctx): Effect.Effect<void> =>
		Effect.gen(function* () {
			yield* ctx.runQuery(internal.basic_schema_operations.actionQuery);
			yield* ctx.runMutation(internal.basic_schema_operations.actionMutation);
			yield* ctx.runAction(internal.basic_schema_operations.actionNoop);
		}),
});

export const actionWithAuthAndRunMethods = action({
	args: Schema.Struct({}),
	handler: (ctx): Effect.Effect<void> =>
		Effect.gen(function* () {
			yield* ctx.auth.getUserIdentity().pipe(
				Effect.andThen(
					Option.match({
						onNone: () => Effect.die,
						onSome: () => Effect.void,
					}),
				),
			);

			yield* ctx.runAction(api.basic_schema_operations.runQueryAndMutation);
		}),
});

export const executeVectorSearch = action({
	args: Schema.Struct({
		vector: Schema.Array(Schema.Number),
		tag: Schema.Union(Schema.String, Schema.Null),
		limit: Schema.Number,
	}),
	handler: (
		{ runQuery, vectorSearch },
		{ vector, tag, limit },
	): Effect.Effect<{ text: string; tag?: string }[]> =>
		vectorSearch(tableName("notes"), "embedding", {
			vector: vector as number[],
			filter: tag === null ? undefined : (q) => q.eq("tag", tag),
			limit,
		}).pipe(
			Effect.andThen(
				Effect.forEach((vectorResult) =>
					runQuery(api.basic_schema_operations.getVectorSearch, {
						noteId: vectorResult._id,
					}).pipe(
						Effect.map(Option.fromNullable),
						Effect.map(Option.getOrThrow),
						Effect.map(({ text, tag }) => ({ text, tag })),
					),
				),
			),
			Effect.orDie,
		),
});

export const getVectorSearch = query({
	args: Schema.Struct({
		noteId: SchemaId<TableName<"notes">>(),
	}),
	handler: ({ db }, { noteId }) =>
		db.get(noteId).pipe(Effect.map(Option.getOrNull)),
});

// Scheduler

export const insertAfter = action({
	args: Schema.Struct({
		text: Schema.String,
		millis: Schema.Number,
	}),
	handler: ({ scheduler }, { text, millis }): Effect.Effect<void> =>
		scheduler.runAfter(millis, api.basic_schema_operations.scheduledInsert, {
			text,
		}),
});

export const scheduledInsert = mutation({
	args: Schema.Struct({
		text: Schema.String,
	}),
	handler: ({ db }, { text }): Effect.Effect<void> =>
		db.insert(tableName("notes"), { text }).pipe(Effect.orDie),
});

export const insertAt = action({
	args: Schema.Struct({
		text: Schema.String,
		timestamp: Schema.Number,
	}),
	handler: ({ scheduler }, { text, timestamp }): Effect.Effect<void> =>
		scheduler.runAt(timestamp, api.basic_schema_operations.scheduledInsert, {
			text,
		}),
});

export const systemNormalizeId = query({
	args: Schema.Struct({
		id: SchemaId<"_storage">(),
	}),
	handler: ({ db }, { id }): Effect.Effect<Id<"_storage"> | null> =>
		db.system
			.normalizeId("_storage", id)
			.pipe(Option.getOrNull, Effect.succeed),
});

export const systemGet = query({
	args: Schema.Struct({
		id: SchemaId<"_storage">(),
	}),
	handler: ({ db }, { id }) =>
		db.system.get(id).pipe(Effect.map(Option.getOrNull)),
});

export const systemQuery = query({
	args: Schema.Struct({}),
	handler: ({ db }) => db.system.query("_storage").collect(),
});

export const storageGetUrl = action({
	args: Schema.Struct({
		id: SchemaId<"_storage">(),
	}),
	handler: ({ storage }, { id }) =>
		storage.getUrl(id).pipe(Effect.map(Option.getOrNull)),
});

export const storageGenerateUploadUrl = action({
	args: Schema.Struct({}),
	handler: ({ storage }) => storage.generateUploadUrl(),
});

export const storageDelete = action({
	args: Schema.Struct({
		id: SchemaId<"_storage">(),
	}),
	handler: ({ storage }, { id }) => storage.delete(id),
});
