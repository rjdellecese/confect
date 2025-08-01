import { Effect, type ParseResult, Schema } from "effect";
import { api } from "~/test/convex/_generated/api";
import {
  ConfectDatabaseReader,
  ConfectQueryRunner,
  ConfectVectorSearch,
  confectAction,
  confectQuery,
} from "~/test/convex/confect";
import { confectSchema } from "~/test/convex/schema";
import { GenericId } from "../../src/server";

export const vectorSearch = confectAction({
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
            runQuery(api.vector_search.get, {
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

export const get = confectQuery({
  args: Schema.Struct({
    noteId: GenericId("notes"),
  }),
  returns: confectSchema.tableSchemas.notes.withSystemFields,
  handler: ({ noteId }) =>
    Effect.gen(function* () {
      const reader = yield* ConfectDatabaseReader;

      return yield* reader.table("notes").getbyId(noteId);
    }),
});
