import { Schema } from "@effect/schema";
import { Effect, Option } from "effect";

import type { PaginationResult } from "convex/server";
import { SchemaId } from "~/src/SchemaId";
import type { Doc, Id } from "~/test/convex/_generated/dataModel";
import { mutation, query } from "~/test/convex/confect_functions";
import {
	type TableName,
	schema,
} from "~/test/convex/schemas/basic_schema_operations";

export const tables = schema.tables;

export const get = query({
	args: Schema.Struct({
		id: SchemaId<TableName<"notes">>(),
	}),
	handler: ({ db }, { id }): Effect.Effect<Doc<TableName<"notes">> | null> => {
		return db.get(id).pipe(Effect.map(Option.getOrNull));
	},
});

export const insert = mutation({
	args: Schema.Struct({
		text: Schema.String,
	}),
	handler: ({ db }, { text }): Effect.Effect<Id<TableName<"notes">>> => {
		return db.insert(schema.tableName("notes"), { text });
	},
});

export const collect = query({
	args: Schema.Struct({}),
	handler: ({ db }): Effect.Effect<Doc<TableName<"notes">>[]> => {
		return db.query(schema.tableName("notes")).collect();
	},
});

export const filterFirst = query({
	args: Schema.Struct({
		text: Schema.String,
	}),
	handler: (
		{ db },
		{ text },
	): Effect.Effect<Doc<TableName<"notes">> | null> => {
		return db
			.query(schema.tableName("notes"))
			.filter((q) => q.eq(q.field("text"), text))
			.first()
			.pipe(Effect.map(Option.getOrNull));
	},
});

export const withIndexFirst = query({
	args: Schema.Struct({
		text: Schema.String,
	}),
	handler: (
		{ db },
		{ text },
	): Effect.Effect<Doc<TableName<"notes">> | null> => {
		return db
			.query(schema.tableName("notes"))
			.withIndex("by_text", (q) => q.eq("text", text))
			.first()
			.pipe(Effect.map(Option.getOrNull));
	},
});

export const orderDescCollect = query({
	args: Schema.Struct({}),
	handler: ({ db }): Effect.Effect<Doc<TableName<"notes">>[]> => {
		return db.query(schema.tableName("notes")).order("desc").collect();
	},
});

export const take = query({
	args: Schema.Struct({
		n: Schema.Number,
	}),
	handler: ({ db }, { n }): Effect.Effect<Doc<TableName<"notes">>[]> => {
		return db.query(schema.tableName("notes")).take(n);
	},
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
		return db.query(schema.tableName("notes")).paginate({ cursor, numItems });
	},
});

export const unique = query({
	args: Schema.Struct({}),
	handler: ({
		db,
	}): Effect.Effect<Doc<TableName<"notes">> | null | "NotUniqueError"> =>
		db
			.query(schema.tableName("notes"))
			.unique()
			.pipe(
				Effect.map(Option.getOrNull),
				Effect.catchTag("NotUniqueError", ({ _tag }) => Effect.succeed(_tag)),
			),
});
