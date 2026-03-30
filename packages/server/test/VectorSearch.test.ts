import { describe, it } from "@effect/vitest";
import { assertEquals } from "@effect/vitest/utils";
import { Effect } from "effect";
import * as VectorSearch from "../src/VectorSearch";

describe("VectorSearch", () => {
  it.effect("delegates to the underlying vectorSearch function", () =>
    Effect.gen(function* () {
      let capturedTable: string | undefined;
      let capturedIndex: string | undefined;
      let capturedQuery: any;

      const fakeVectorSearch = async (
        tableName: string,
        indexName: string,
        query: any,
      ) => {
        capturedTable = tableName;
        capturedIndex = indexName;
        capturedQuery = query;
        return [
          { _id: "id1" as any, _score: 0.95 },
          { _id: "id2" as any, _score: 0.8 },
        ];
      };

      const vs = VectorSearch.make(fakeVectorSearch as any);
      const results = yield* vs(
        "notes" as any,
        "embedding" as any,
        {
          vector: [1, 2, 3],
          limit: 10,
        } as any,
      );

      assertEquals(capturedTable, "notes");
      assertEquals(capturedIndex, "embedding");
      assertEquals(capturedQuery.limit, 10);
      assertEquals(results.length, 2);
      assertEquals(results[0]?._score, 0.95);
    }),
  );

  it.effect("layer provides the VectorSearch service", () =>
    Effect.gen(function* () {
      const fakeVectorSearch = async () => [];

      const vs = yield* VectorSearch.VectorSearch<any>().pipe(
        Effect.provide(VectorSearch.layer(fakeVectorSearch as any)),
      );

      const results = yield* vs(
        "table" as any,
        "idx" as any,
        {
          vector: [],
          limit: 5,
        } as any,
      );
      assertEquals(results.length, 0);
    }),
  );
});
