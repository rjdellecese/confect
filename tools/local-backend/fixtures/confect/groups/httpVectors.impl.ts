import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import databaseSchema from "../_generated/schema";
import { DatabaseReader, DatabaseWriter } from "../_generated/services";
import httpVectors from "./httpVectors.spec";

export default GroupImpl.make(databaseSchema, httpVectors).pipe(
  Layer.provide(
    FunctionImpl.make(databaseSchema, httpVectors, "seed", ({ caseId }) =>
      Effect.gen(function* () {
        const writer = yield* DatabaseWriter;
        const reader = yield* DatabaseReader;
        const table = writer.table("httpVectors");
        const previous = yield* reader
          .table("httpVectors")
          .index("by_creation_time")
          .collect();
        for (const doc of previous) yield* table.delete(doc._id);
        const nearest = yield* table.insert({ caseId, embedding: [1, 0, 0] });
        const orthogonal = yield* table.insert({
          caseId,
          embedding: [0, 1, 0],
        });
        yield* table.insert({
          caseId: `${caseId}-excluded`,
          embedding: [1, 0, 0],
        });
        return [nearest, orthogonal];
      }).pipe(Effect.orDie),
    ),
  ),
  GroupImpl.finalize,
);
