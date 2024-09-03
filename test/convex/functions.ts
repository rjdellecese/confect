import { Schema } from "@effect/schema";
import { Array, Chunk, Effect, Option, Stream, pipe } from "effect";
import { IdSchema } from "~/src/schemas/IdSchema";
import * as PaginationResult from "~/src/schemas/PaginationResult";
import { api, internal } from "~/test/convex/_generated/api";
import type { Id } from "~/test/convex/_generated/dataModel";
import {
	action,
	internalAction,
	internalMutation,
	internalQuery,
	mutation,
	query,
} from "~/test/convex/confect";
import type { ConfectDoc } from "~/test/convex/confect";
import { confectTableSchemas } from "./schema";

export const queryGet = query({
	args: Schema.Struct({
		noteId: IdSchema<"notes">(),
	}),
	returns: Schema.Option(confectTableSchemas.notes.withSystemFields),
	handler: ({ db }, { noteId }) => db.get(noteId),
});

export const mutationGet = mutation({
	args: Schema.Struct({
		noteId: IdSchema<"notes">(),
	}),
	handler: ({ db }, { noteId }): Effect.Effect<ConfectDoc<"notes"> | null> =>
		db.get(noteId).pipe(Effect.map(Option.getOrNull)),
});

export const insert = mutation({
	args: Schema.Struct({
		text: Schema.String,
	}),
	handler: ({ db }, { text }): Effect.Effect<Id<"notes">> =>
		db.insert("notes", { text }).pipe(Effect.orDie),
});

export const queryCollect = query({
	args: Schema.Struct({}),
	returns: Schema.Array(confectTableSchemas.notes.withSystemFields),
	handler: ({ db }) => db.query("notes").collect(),
});

export const mutationCollect = mutation({
	args: Schema.Struct({}),
	handler: ({ db }): Effect.Effect<ConfectDoc<"notes">[]> =>
		db.query("notes").collect(),
});

export const filterFirst = query({
	args: Schema.Struct({
		text: Schema.String,
	}),
	returns: Schema.Option(confectTableSchemas.notes.withSystemFields),
	handler: ({ db }, { text }) =>
		db
			.query("notes")
			.filter((q) => q.eq(q.field("text"), text))
			.first(),
});

export const withIndexFirst = query({
	args: Schema.Struct({
		text: Schema.String,
	}),
	returns: Schema.Option(confectTableSchemas.notes.withSystemFields),
	handler: ({ db }, { text }) =>
		db
			.query("notes")
			.withIndex("by_text", (q) => q.eq("text", text))
			.first(),
});

export const orderDescCollect = query({
	args: Schema.Struct({}),
	returns: Schema.Array(confectTableSchemas.notes.withSystemFields),
	handler: ({ db }) => db.query("notes").order("desc").collect(),
});

export const take = query({
	args: Schema.Struct({
		n: Schema.Number,
	}),
	returns: Schema.Array(confectTableSchemas.notes.withSystemFields),
	handler: ({ db }, { n }) => db.query("notes").take(n),
});

export const paginate = query({
	args: Schema.Struct({
		cursor: Schema.Union(Schema.String, Schema.Null),
		numItems: Schema.Number,
	}),
	returns: PaginationResult.PaginationResult(
		confectTableSchemas.notes.withSystemFields,
	),
	handler: ({ db }, { cursor, numItems }) =>
		db.query("notes").paginate({ cursor, numItems }),
});

export const unique = query({
	args: Schema.Struct({}),
	returns: Schema.Union(
		Schema.Literal("NotUniqueError"),
		Schema.Option(confectTableSchemas.notes.withSystemFields),
	),
	handler: ({ db }) =>
		db
			.query("notes")
			.unique()
			.pipe(
				Effect.catchTag("NotUniqueError", ({ _tag }) => Effect.succeed(_tag)),
			),
});

export const onlyFirst = query({
	args: Schema.Struct({}),
	returns: Schema.Option(confectTableSchemas.notes.withSystemFields),
	handler: ({ db }) => db.query("notes").first(),
});

export const mapTextStream = query({
	args: Schema.Struct({}),
	returns: Schema.Array(Schema.String),
	handler: ({ db }) =>
		Effect.gen(function* () {
			const stream = db.query("notes").stream();
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
	returns: Schema.Array(Schema.String),
	handler: ({ db }, { query, tag }) =>
		db
			.query("notes")
			.withSearchIndex("text", (q) => q.search("text", query).eq("tag", tag))
			.collect()
			.pipe(Effect.map(Array.map((note) => note.text))),
});

export const queryNormalizeId = query({
	args: Schema.Struct({
		noteId: IdSchema<"notes">(),
	}),
	returns: Schema.Option(IdSchema<"notes">()),
	handler: ({ db }, { noteId }) =>
		Effect.succeed(db.normalizeId("notes", noteId)),
});

export const mutationNormalizeId = mutation({
	args: Schema.Struct({
		noteId: IdSchema<"notes">(),
	}),
	handler: ({ db }, { noteId }): Effect.Effect<Id<"notes"> | null> =>
		pipe(db.normalizeId("notes", noteId), Option.getOrNull, Effect.succeed),
});

// Exporting only to stop TypeScript from complaining.
export const _badPatch = mutation({
	args: Schema.Struct({
		noteId: IdSchema<"notes">(),
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
		noteId: IdSchema<"notes">(),
		fields: Schema.Struct({
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
		noteId: IdSchema<"notes">(),
	}),
	handler: ({ db }, { noteId }) =>
		db.patch(noteId, { author: undefined }).pipe(Effect.orDie),
});

export const insertTooLongText = mutation({
	args: Schema.Struct({
		text: Schema.String,
	}),
	handler: ({ db }, { text }) =>
		db.insert("notes", { text }).pipe(Effect.orDie),
});

export const replace = mutation({
	args: Schema.Struct({
		noteId: IdSchema<"notes">(),
		fields: Schema.Struct({
			_id: Schema.optionalWith(IdSchema<"notes">(), { exact: true }),
			_creationTime: Schema.optionalWith(Schema.Number, { exact: true }),
			text: Schema.String,
		}),
	}),
	handler: ({ db }, { noteId, fields }) =>
		db.replace(noteId, fields).pipe(Effect.orDie),
});

export const deleteNote = mutation({
	args: Schema.Struct({
		noteId: IdSchema<"notes">(),
	}),
	handler: ({ db }, { noteId }): Effect.Effect<void> => db.delete(noteId),
});

export const isAuthenticated = query({
	args: Schema.Struct({}),
	returns: Schema.Boolean,
	handler: ({ auth }) =>
		pipe(auth.getUserIdentity(), Effect.map(Option.isSome)),
});

// Action

export const actionQuery = internalQuery({
	args: Schema.Struct({}),
	returns: Schema.Null,
	handler: ({ db }) => db.query("notes").collect().pipe(Effect.as(null)),
});

export const actionMutation = internalMutation({
	args: Schema.Struct({}),
	handler: ({ db }): Effect.Effect<void> =>
		db.insert("notes", { text: "Hello, world!" }).pipe(Effect.orDie),
});

export const actionNoop = internalAction({
	args: Schema.Struct({}),
	handler: (_ctx) => Effect.void,
});

export const runQueryAndMutation = action({
	args: Schema.Struct({}),
	handler: (ctx): Effect.Effect<void> =>
		Effect.gen(function* () {
			yield* ctx.runQuery(internal.functions.actionQuery);
			yield* ctx.runMutation(internal.functions.actionMutation);
			yield* ctx.runAction(internal.functions.actionNoop);
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

			yield* ctx.runAction(api.functions.runQueryAndMutation);
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
		vectorSearch("notes", "embedding", {
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
								Schema.Option(confectTableSchemas.notes.withSystemFields),
							),
						),
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
		noteId: IdSchema<"notes">(),
	}),
	returns: Schema.Option(confectTableSchemas.notes.withSystemFields),
	handler: ({ db }, { noteId }) => db.get(noteId),
});

// Scheduler

export const insertAfter = action({
	args: Schema.Struct({
		text: Schema.String,
		millis: Schema.Number,
	}),
	handler: ({ scheduler }, { text, millis }): Effect.Effect<void> =>
		scheduler.runAfter(millis, api.functions.scheduledInsert, {
			text,
		}),
});

export const scheduledInsert = mutation({
	args: Schema.Struct({
		text: Schema.String,
	}),
	handler: ({ db }, { text }): Effect.Effect<void> =>
		db.insert("notes", { text }).pipe(Effect.orDie),
});

export const insertAt = action({
	args: Schema.Struct({
		text: Schema.String,
		timestamp: Schema.Number,
	}),
	handler: ({ scheduler }, { text, timestamp }): Effect.Effect<void> =>
		scheduler.runAt(timestamp, api.functions.scheduledInsert, {
			text,
		}),
});

export const systemNormalizeId = query({
	args: Schema.Struct({
		id: IdSchema<"_storage">(),
	}),
	returns: Schema.Option(IdSchema<"_storage">()),
	handler: ({ db }, { id }) =>
		db.system.normalizeId("_storage", id).pipe(Effect.succeed),
});

export const systemGet = query({
	args: Schema.Struct({
		id: IdSchema<"_storage">(),
	}),
	returns: Schema.Option(confectTableSchemas._storage.withSystemFields),
	handler: ({ db }, { id }) => db.system.get(id),
});

export const systemQuery = query({
	args: Schema.Struct({}),
	returns: Schema.Array(confectTableSchemas._storage.withSystemFields),
	handler: ({ db }) => db.system.query("_storage").collect(),
});

export const storageGetUrl = action({
	args: Schema.Struct({
		id: IdSchema<"_storage">(),
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
		id: IdSchema<"_storage">(),
	}),
	handler: ({ storage }, { id }) => storage.delete(id),
});
