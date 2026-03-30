import { GenericId } from "@confect/core";
import { describe, it } from "@effect/vitest";
import { assertEquals, assertTrue } from "@effect/vitest/utils";
import { Effect, Option } from "effect";
import { DatabaseReader, DatabaseWriter } from "./confect/_generated/services";
import * as TestConfect from "./TestConfect";

describe("DatabaseWriter", () => {
  it.effect("insert returns a valid id", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      const noteId = yield* c.run(
        Effect.gen(function* () {
          const writer = yield* DatabaseWriter;
          return yield* writer.table("notes").insert({ text: "hello" });
        }),
        GenericId.GenericId("notes"),
      );

      assertTrue(typeof noteId === "string");
    }).pipe(Effect.provide(TestConfect.layer())),
  );

  it.effect("patch updates specific fields", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      const noteId = yield* c.run(
        Effect.gen(function* () {
          const writer = yield* DatabaseWriter;
          return yield* writer
            .table("notes")
            .insert({ text: "original", tag: "first" });
        }),
        GenericId.GenericId("notes"),
      );

      yield* c.run(
        Effect.gen(function* () {
          const writer = yield* DatabaseWriter;
          yield* writer.table("notes").patch(noteId, { text: "patched" });
        }),
      );

      yield* c.run(
        Effect.gen(function* () {
          const reader = yield* DatabaseReader;
          const doc = yield* reader.table("notes").get(noteId);
          assertEquals(doc.text, "patched");
          assertEquals(doc.tag, "first");
        }),
      );
    }).pipe(Effect.provide(TestConfect.layer())),
  );

  it.effect("patch removes fields set to undefined", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      const noteId = yield* c.run(
        Effect.gen(function* () {
          const writer = yield* DatabaseWriter;
          return yield* writer
            .table("notes")
            .insert({ text: "test", tag: "removeme" });
        }),
        GenericId.GenericId("notes"),
      );

      yield* c.run(
        Effect.gen(function* () {
          const writer = yield* DatabaseWriter;
          yield* writer
            .table("notes")
            .patch(noteId, { tag: undefined } as any);
        }),
      );

      yield* c.run(
        Effect.gen(function* () {
          const reader = yield* DatabaseReader;
          const doc = yield* reader.table("notes").get(noteId);
          assertEquals(doc.text, "test");
          assertEquals(doc.tag, undefined);
        }),
      );
    }).pipe(Effect.provide(TestConfect.layer())),
  );

  it.effect("replace overwrites entire document", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      const noteId = yield* c.run(
        Effect.gen(function* () {
          const writer = yield* DatabaseWriter;
          return yield* writer
            .table("notes")
            .insert({ text: "old", tag: "keep" });
        }),
        GenericId.GenericId("notes"),
      );

      yield* c.run(
        Effect.gen(function* () {
          const writer = yield* DatabaseWriter;
          yield* writer.table("notes").replace(noteId, { text: "replaced" });
        }),
      );

      yield* c.run(
        Effect.gen(function* () {
          const reader = yield* DatabaseReader;
          const doc = yield* reader.table("notes").get(noteId);
          assertEquals(doc.text, "replaced");
          assertEquals(doc.tag, undefined);
        }),
      );
    }).pipe(Effect.provide(TestConfect.layer())),
  );

  it.effect("delete removes the document", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      const noteId = yield* c.run(
        Effect.gen(function* () {
          const writer = yield* DatabaseWriter;
          return yield* writer.table("notes").insert({ text: "to-delete" });
        }),
        GenericId.GenericId("notes"),
      );

      yield* c.run(
        Effect.gen(function* () {
          const writer = yield* DatabaseWriter;
          yield* writer.table("notes").delete(noteId);
        }),
      );

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
});
