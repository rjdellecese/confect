import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import databaseSchema from "../_generated/schema";
import { DatabaseReader, DatabaseWriter } from "../_generated/services";
import orderedQuery from "./orderedQuery.spec";

const seed = FunctionImpl.make(
  databaseSchema,
  orderedQuery,
  "seed",
  ({ caseId, count }) =>
    Effect.gen(function* () {
      const writer = yield* DatabaseWriter;
      const reader = yield* DatabaseReader;
      const rows = yield* reader
        .table("orderedRows")
        .index("by_caseId_position", (q) => q.eq("caseId", caseId))
        .collect();
      for (const row of rows)
        yield* writer.table("orderedRows").delete(row._id);
      for (let position = 0; position < count; position++) {
        yield* writer.table("orderedRows").insert({ caseId, position });
      }
      return null;
    }).pipe(Effect.orDie),
);

const first = FunctionImpl.make(
  databaseSchema,
  orderedQuery,
  "first",
  ({ caseId }) =>
    Effect.gen(function* () {
      const reader = yield* DatabaseReader;
      const row = yield* reader
        .table("orderedRows")
        .index("by_caseId_position", (q) => q.eq("caseId", caseId))
        .first();
      return Option.match(row, {
        onNone: () => null,
        onSome: ({ position }) => position,
      });
    }).pipe(Effect.orDie),
);

const take = FunctionImpl.make(
  databaseSchema,
  orderedQuery,
  "take",
  ({ caseId, n }) =>
    Effect.gen(function* () {
      const reader = yield* DatabaseReader;
      const rows = yield* reader
        .table("orderedRows")
        .index("by_caseId_position", (q) => q.eq("caseId", caseId))
        .take(n);
      return rows.map(({ position }) => position);
    }).pipe(Effect.orDie),
);

export default GroupImpl.make(databaseSchema, orderedQuery).pipe(
  Layer.provide(seed),
  Layer.provide(first),
  Layer.provide(take),
  GroupImpl.finalize,
);
