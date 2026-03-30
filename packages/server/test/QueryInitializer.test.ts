import { GenericId } from "@confect/core";
import { describe, it } from "@effect/vitest";
import { assertEquals, assertTrue } from "@effect/vitest/utils";
import { Cause, Effect, Exit } from "effect";
import * as QueryInitializer from "../src/QueryInitializer";
import { DatabaseReader, DatabaseWriter } from "./confect/_generated/services";
import * as TestConfect from "./TestConfect";

describe("QueryInitializer", () => {
  it.effect("get by index succeeds with matching document", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      yield* c.run(
        Effect.gen(function* () {
          const writer = yield* DatabaseWriter;
          yield* writer.table("notes").insert({ text: "find-me" });
        }),
      );

      yield* c.run(
        Effect.gen(function* () {
          const reader = yield* DatabaseReader;
          const doc = yield* reader.table("notes").get("by_text", "find-me");
          assertEquals(doc.text, "find-me");
        }),
      );
    }).pipe(Effect.provide(TestConfect.layer())),
  );

  it.effect("get by index fails with GetByIndexFailure when no match", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      yield* c.run(
        Effect.gen(function* () {
          const reader = yield* DatabaseReader;
          const exit = yield* reader
            .table("notes")
            .get("by_text", "nonexistent")
            .pipe(Effect.exit);

          assertTrue(Exit.isFailure(exit));
          const cause = exit.cause;
          assertTrue(Cause.isFailType(cause));
          assertTrue(
            cause.error instanceof QueryInitializer.GetByIndexFailure,
          );
          assertEquals(cause.error.tableName, "notes");
          assertEquals(cause.error.indexName, "by_text");
        }),
      );
    }).pipe(Effect.provide(TestConfect.layer())),
  );

  it.effect("get by id fails with GetByIdFailure when not found", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      yield* c.run(
        Effect.gen(function* () {
          const reader = yield* DatabaseReader;
          const fakeId = "kd7b0r05v3nvdjsmbc01t0b2ws7e1e0s" as ReturnType<
            typeof GenericId.GenericId<"notes">
          >["Type"];
          const exit = yield* reader
            .table("notes")
            .get(fakeId)
            .pipe(Effect.exit);
          assertTrue(Exit.isFailure(exit));
          const cause = exit.cause;
          assertTrue(Cause.isFailType(cause));
          assertTrue(cause.error instanceof QueryInitializer.GetByIdFailure);
          assertEquals(cause.error.tableName, "notes");
        }),
      );
    }).pipe(Effect.provide(TestConfect.layer())),
  );

  it.effect("index with order parameter", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      yield* c.run(
        Effect.gen(function* () {
          const writer = yield* DatabaseWriter;
          yield* writer.table("notes").insert({ text: "a" });
          yield* writer.table("notes").insert({ text: "b" });
          yield* writer.table("notes").insert({ text: "c" });
        }),
      );

      yield* c.run(
        Effect.gen(function* () {
          const reader = yield* DatabaseReader;

          const asc = yield* reader
            .table("notes")
            .index("by_creation_time")
            .collect();
          const desc = yield* reader
            .table("notes")
            .index("by_creation_time", "desc")
            .collect();

          assertEquals(asc[0]?.text, "a");
          assertEquals(desc[0]?.text, "c");
        }),
      );
    }).pipe(Effect.provide(TestConfect.layer())),
  );

  it.effect("index with range function and order", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      yield* c.run(
        Effect.gen(function* () {
          const writer = yield* DatabaseWriter;
          yield* writer.table("notes").insert({ text: "aa" });
          yield* writer.table("notes").insert({ text: "bb" });
          yield* writer.table("notes").insert({ text: "cc" });
        }),
      );

      yield* c.run(
        Effect.gen(function* () {
          const reader = yield* DatabaseReader;
          const results = yield* reader
            .table("notes")
            .index("by_text", (q) => q.eq("text", "bb"))
            .collect();
          assertEquals(results.length, 1);
          assertEquals(results[0]?.text, "bb");
        }),
      );
    }).pipe(Effect.provide(TestConfect.layer())),
  );

  it.effect("index with range function and explicit order", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      yield* c.run(
        Effect.gen(function* () {
          const writer = yield* DatabaseWriter;
          yield* writer.table("notes").insert({ text: "x" });
          yield* writer.table("notes").insert({ text: "y" });
        }),
      );

      yield* c.run(
        Effect.gen(function* () {
          const reader = yield* DatabaseReader;
          const results = yield* reader
            .table("notes")
            .index(
              "by_text",
              (q) => q.gte("text", "x"),
              "desc",
            )
            .collect();
          assertEquals(results.length, 2);
          assertEquals(results[0]?.text, "y");
        }),
      );
    }).pipe(Effect.provide(TestConfect.layer())),
  );

  describe("error messages", () => {
    it.effect("GetByIdFailure has a descriptive message", () =>
      Effect.gen(function* () {
        const error = new QueryInitializer.GetByIdFailure({
          tableName: "users",
          id: "abc123",
        });
        assertTrue(error.message.includes("abc123"));
        assertTrue(error.message.includes("users"));
        assertTrue(error.message.includes("not found"));
      }),
    );

    it.effect("GetByIndexFailure has a descriptive message", () =>
      Effect.gen(function* () {
        const error = new QueryInitializer.GetByIndexFailure({
          tableName: "notes",
          indexName: "by_text",
          indexFieldValues: ["hello"],
        });
        assertTrue(error.message.includes("notes"));
        assertTrue(error.message.includes("by_text"));
        assertTrue(error.message.includes("hello"));
      }),
    );
  });
});
