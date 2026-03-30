import { describe, it } from "@effect/vitest";
import { assertEquals } from "@effect/vitest/utils";
import { Effect } from "effect";
import { DatabaseReader } from "./confect/_generated/services";
import * as TestConfect from "./TestConfect";

describe("DatabaseReader", () => {
  it.effect("reads from system table _scheduled_functions", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      yield* c.run(
        Effect.gen(function* () {
          const reader = yield* DatabaseReader;

          const results = yield* reader
            .table("_scheduled_functions")
            .index("by_creation_time")
            .collect();

          assertEquals(results.length, 0);
        }),
      );
    }).pipe(Effect.provide(TestConfect.layer())),
  );

  it.effect("reads from system table _storage", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      yield* c.run(
        Effect.gen(function* () {
          const reader = yield* DatabaseReader;

          const results = yield* reader
            .table("_storage")
            .index("by_creation_time")
            .collect();

          assertEquals(results.length, 0);
        }),
      );
    }).pipe(Effect.provide(TestConfect.layer())),
  );
});
