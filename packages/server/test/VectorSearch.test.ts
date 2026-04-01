import { describe, it } from "@effect/vitest";
import { assertEquals } from "@effect/vitest/utils";
import { Effect, Ref } from "effect";
import * as VectorSearch from "../src/VectorSearch";

interface VectorSearchCall {
  readonly tableName: string;
  readonly indexName: string;
  readonly query: unknown;
}

const testVectorSearchLayer = (
  results: Array<{ _id: string; _score: number }> = [],
) =>
  Effect.gen(function* () {
    const calls = yield* Ref.make<ReadonlyArray<VectorSearchCall>>([]);

    const vectorSearch = async (
      tableName: string,
      indexName: string,
      query: unknown,
    ) => {
      Effect.runSync(
        Ref.update(calls, (prev) => [...prev, { tableName, indexName, query }]),
      );
      return results as any;
    };

    return {
      layer: VectorSearch.layer(vectorSearch as any),
      calls,
    };
  });

describe("VectorSearch", () => {
  it.effect("delegates to the underlying vectorSearch function", () =>
    Effect.gen(function* () {
      const { layer, calls } = yield* testVectorSearchLayer([
        { _id: "id1", _score: 0.95 },
        { _id: "id2", _score: 0.8 },
      ]);

      const results = yield* Effect.gen(function* () {
        const vs = yield* VectorSearch.VectorSearch<any>();
        return yield* vs(
          "notes" as any,
          "embedding" as any,
          {
            vector: [1, 2, 3],
            limit: 10,
          } as any,
        );
      }).pipe(Effect.provide(layer));

      const recorded = yield* Ref.get(calls);
      assertEquals(recorded.length, 1);
      assertEquals(recorded[0]?.tableName, "notes");
      assertEquals(recorded[0]?.indexName, "embedding");
      assertEquals(results.length, 2);
      assertEquals(results[0]?._score, 0.95);
    }),
  );

  it.effect("returns empty results", () =>
    Effect.gen(function* () {
      const { layer } = yield* testVectorSearchLayer([]);

      const results = yield* Effect.gen(function* () {
        const vs = yield* VectorSearch.VectorSearch<any>();
        return yield* vs(
          "table" as any,
          "idx" as any,
          {
            vector: [],
            limit: 5,
          } as any,
        );
      }).pipe(Effect.provide(layer));

      assertEquals(results.length, 0);
    }),
  );
});
