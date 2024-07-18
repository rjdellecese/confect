import { Schema } from "@effect/schema";
import { Array, Chunk, Effect, Option, Stream, pipe } from "effect";

import type { PaginationResult } from "convex/server";
import { SchemaId } from "~/src/SchemaId";
import type { Doc, Id } from "~/test/convex/_generated/dataModel";
import { mutation, query } from "~/test/convex/confect_functions";
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
	): Effect.Effect<Doc<TableName<"notes">> | null> =>
		db.get(noteId).pipe(Effect.map(Option.getOrNull)),
});

export const mutationGet = mutation({
	args: Schema.Struct({
		noteId: SchemaId<TableName<"notes">>(),
	}),
	handler: (
		{ db },
		{ noteId },
	): Effect.Effect<Doc<TableName<"notes">> | null> =>
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
	handler: ({ db }): Effect.Effect<Doc<TableName<"notes">>[]> =>
		db.query(tableName("notes")).collect(),
});

export const mutationCollect = mutation({
	args: Schema.Struct({}),
	handler: ({ db }): Effect.Effect<Doc<TableName<"notes">>[]> =>
		db.query(tableName("notes")).collect(),
});

export const filterFirst = query({
	args: Schema.Struct({
		text: Schema.String,
	}),
	handler: ({ db }, { text }): Effect.Effect<Doc<TableName<"notes">> | null> =>
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
	handler: ({ db }, { text }): Effect.Effect<Doc<TableName<"notes">> | null> =>
		db
			.query(tableName("notes"))
			.withIndex("by_text", (q) => q.eq("text", text))
			.first()
			.pipe(Effect.map(Option.getOrNull)),
});

export const orderDescCollect = query({
	args: Schema.Struct({}),
	handler: ({ db }): Effect.Effect<Doc<TableName<"notes">>[]> =>
		db.query(tableName("notes")).order("desc").collect(),
});

export const take = query({
	args: Schema.Struct({
		n: Schema.Number,
	}),
	handler: ({ db }, { n }): Effect.Effect<Doc<TableName<"notes">>[]> =>
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
	): Effect.Effect<PaginationResult<Doc<TableName<"notes">>>> => {
		return db.query(tableName("notes")).paginate({ cursor, numItems });
	},
});

export const unique = query({
	args: Schema.Struct({}),
	handler: ({
		db,
	}): Effect.Effect<Doc<TableName<"notes">> | null | "NotUniqueError"> =>
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
	handler: ({ db }): Effect.Effect<Doc<TableName<"notes">> | null> =>
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
			.withSearchIndex("search_text", (q) =>
				q.search("text", query).eq("tag", tag),
			)
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

const _badPatch = mutation({
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
				// @ts-expect-error: Should not be able to set `_id`
				_creationTime: 0,
			});
		}).pipe(Effect.orDie),
});

export const patch = mutation({
	args: Schema.Struct({
		noteId: SchemaId<TableName<"notes">>(),
		fields: Schema.Struct({
			// TODO: Better error messages for `Schema.optional` when `{ exact: true }` is not present
			text: Schema.optional(Schema.String, { exact: true }),
			author: Schema.optional(
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

export const deleteAuthorPatch = mutation({
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
