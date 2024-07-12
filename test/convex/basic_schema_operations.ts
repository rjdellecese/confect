import { Schema } from "@effect/schema";
import { Effect, Option } from "effect";

import { SchemaId } from "~/src/SchemaId";
import { Doc, Id } from "~/test/convex/_generated/dataModel";
import { schema } from "~/test/convex/basic_schema_operations__schema";
import { mutation, query } from "~/test/convex/confect_functions";

export const tables = schema.tables;

export const get = query({
  args: Schema.Struct({
    id: SchemaId<"basic_schema_operations__notes">(),
  }),
  handler: (
    { db },
    { id },
  ): Effect.Effect<Doc<"basic_schema_operations__notes"> | null> => {
    return db.get(id).pipe(Effect.map(Option.getOrNull));
  },
});

export const insert = mutation({
  args: Schema.Struct({
    text: Schema.String,
  }),
  handler: (
    { db },
    { text },
  ): Effect.Effect<Id<"basic_schema_operations__notes">> => {
    return db.insert(schema.tableName("notes"), { text });
  },
});

export const collect = query({
  args: Schema.Struct({}),
  handler: ({ db }): Effect.Effect<Doc<"basic_schema_operations__notes">[]> => {
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
  ): Effect.Effect<Doc<"basic_schema_operations__notes"> | null> => {
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
  ): Effect.Effect<Doc<"basic_schema_operations__notes"> | null> => {
    return db
      .query(schema.tableName("notes"))
      .withIndex("by_text", (q) => q.eq("text", text))
      .first()
      .pipe(Effect.map(Option.getOrNull));
  },
});
