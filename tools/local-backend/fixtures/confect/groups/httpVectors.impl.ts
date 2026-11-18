import { GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FunctionImpl } from "../_generated/server";
import { DatabaseReader, DatabaseWriter } from "../_generated/services";
import httpVectorsTable from "../_generated/tables/httpVectors";
import httpVectors from "./httpVectors.spec";

export default GroupImpl.make(httpVectors).pipe(
  Layer.provide(
    FunctionImpl.make(httpVectors, "seed", ({ caseId }) =>
      Effect.gen(function* () {
        const writer = yield* DatabaseWriter;
        const reader = yield* DatabaseReader;
        const table = writer.table(httpVectorsTable);
        const previous = yield* reader
          .table(httpVectorsTable)
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
