import { describe, it } from "@effect/vitest";
import { assertEquals, assertTrue } from "@effect/vitest/utils";
import { Array, Effect, Option, Stream } from "effect";
import { DatabaseReader, DatabaseWriter } from "./confect/_generated/services";
import * as TestConfect from "./TestConfect";

describe("OrderedQuery", () => {
  it.effect("first returns None on empty table", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      yield* c.run(
        Effect.gen(function* () {
          const reader = yield* DatabaseReader;
          const result = yield* reader
            .table("notes")
            .index("by_creation_time")
            .first();
          assertTrue(Option.isNone(result));
        }),
      );
    }).pipe(Effect.provide(TestConfect.layer())),
  );

  it.effect("first returns Some on non-empty table", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      yield* c.run(
        Effect.gen(function* () {
          const writer = yield* DatabaseWriter;
          yield* writer.table("notes").insert({ text: "only note" });
        }),
      );

      yield* c.run(
        Effect.gen(function* () {
          const reader = yield* DatabaseReader;
          const result = yield* reader
            .table("notes")
            .index("by_creation_time")
            .first();
          assertTrue(Option.isSome(result));
          if (Option.isSome(result)) {
            assertEquals(result.value.text, "only note");
          }
        }),
      );
    }).pipe(Effect.provide(TestConfect.layer())),
  );

  it.effect("take returns at most n documents", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      yield* c.run(
        Effect.gen(function* () {
          const writer = yield* DatabaseWriter;
          yield* Effect.forEach(Array.range(1, 5), (i) =>
            writer.table("notes").insert({ text: `note ${i}` }),
          );
        }),
      );

      yield* c.run(
        Effect.gen(function* () {
          const reader = yield* DatabaseReader;
          const results = yield* reader
            .table("notes")
            .index("by_creation_time")
            .take(3);
          assertEquals(results.length, 3);
        }),
      );
    }).pipe(Effect.provide(TestConfect.layer())),
  );

  it.effect("stream produces all documents", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      yield* c.run(
        Effect.gen(function* () {
          const writer = yield* DatabaseWriter;
          yield* Effect.forEach(Array.range(1, 4), (i) =>
            writer.table("notes").insert({ text: `note ${i}` }),
          );
        }),
      );

      yield* c.run(
        Effect.gen(function* () {
          const reader = yield* DatabaseReader;
          const results = yield* reader
            .table("notes")
            .index("by_creation_time")
            .stream()
            .pipe(Stream.runCollect, Effect.map(Array.fromIterable));
          assertEquals(results.length, 4);
        }),
      );
    }).pipe(Effect.provide(TestConfect.layer())),
  );

  it.effect("collect returns all documents", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      yield* c.run(
        Effect.gen(function* () {
          const writer = yield* DatabaseWriter;
          yield* Effect.forEach(Array.range(1, 3), (i) =>
            writer.table("notes").insert({ text: `note ${i}` }),
          );
        }),
      );

      yield* c.run(
        Effect.gen(function* () {
          const reader = yield* DatabaseReader;
          const results = yield* reader
            .table("notes")
            .index("by_creation_time")
            .collect();
          assertEquals(results.length, 3);
        }),
      );
    }).pipe(Effect.provide(TestConfect.layer())),
  );
});
