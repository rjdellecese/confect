import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import databaseSchema from "../_generated/schema";
import {
  DatabaseReader,
  MutationCtx,
  TransactionMetadata,
} from "../_generated/services";
import orderedQueries from "./orderedQueries.spec";

const seed = FunctionImpl.make(databaseSchema, orderedQueries, "seed", () =>
  Effect.gen(function* () {
    const { db } = yield* MutationCtx;
    const previous = yield* Effect.promise(() =>
      db.query("filterNotes").collect(),
    );
    yield* Effect.forEach(previous, (doc) =>
      Effect.promise(() => db.delete(doc._id)),
    );
    yield* Effect.forEach(["1", "2", "3", "4", "invalid"], (value) =>
      Effect.promise(() =>
        db.insert("filterNotes", {
          value,
          keep: value === "2" || value === "3",
        }),
      ),
    );
    return null;
  }),
);

const read = FunctionImpl.make(
  databaseSchema,
  orderedQueries,
  "read",
  ({ terminal, empty }) =>
    Effect.gen(function* () {
      const reader = yield* DatabaseReader;
      const metrics = yield* TransactionMetadata;
      const base = reader
        .table("filterNotes")
        .index("by_value", (q) => q.gte("value", "1"));
      const selected = base
        .filter((q) => q.eq(q.field("keep"), true))
        .filter((q) => (empty ? false : q.neq(q.field("value"), "invalid")));
      const result =
        terminal === "first"
          ? selected.first().pipe(Effect.map(Option.toArray))
          : terminal === "take"
            ? selected.take(2)
            : terminal === "collect"
              ? selected.collect()
              : Stream.runCollect(selected.stream());
      const before = yield* metrics.getMetrics();
      const docs = yield* result;
      const after = yield* metrics.getMetrics();
      const repeated = yield* result;
      return {
        values: Array.map(docs, (doc) => doc.value),
        repeated: Array.map(repeated, (doc) => doc.value),
        reads: before.documentsRead.remaining - after.documentsRead.remaining,
      };
    }).pipe(Effect.orDie),
);

const page = FunctionImpl.make(
  databaseSchema,
  orderedQueries,
  "page",
  ({ paginationOpts, extra }) =>
    Effect.gen(function* () {
      const reader = yield* DatabaseReader;
      const metrics = yield* TransactionMetadata;
      const selected = reader
        .table("filterNotes")
        .index("by_value")
        .filter((q) => q.eq(q.field("keep"), true));
      const before = yield* metrics.getMetrics();
      const result = yield* selected.paginate(
        paginationOpts,
        extra ? (q) => q.eq(q.field("value"), "3") : undefined,
      );
      const after = yield* metrics.getMetrics();
      return {
        values: Array.map(result.page, (doc) => doc.value),
        isDone: result.isDone,
        continueCursor: result.continueCursor,
        reads: before.documentsRead.remaining - after.documentsRead.remaining,
      };
    }).pipe(Effect.orDie),
);

export default GroupImpl.make(databaseSchema, orderedQueries).pipe(
  Layer.provide(seed),
  Layer.provide(read),
  Layer.provide(page),
  GroupImpl.finalize,
);
