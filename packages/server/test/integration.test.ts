import { GenericId } from "@confect/core";
import { describe, it } from "@effect/vitest";
import { assertEquals } from "@effect/vitest/utils";
import { Array, Effect } from "effect";
import { api } from "./confect/_generated/refs";
import { DatabaseWriter } from "./confect/_generated/services";
import * as TestConfect from "./TestConfect";

describe("DatabaseReader", () => {
  it.effect("get", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      const text = "Hello, world!";

      const noteId = yield* c.run(
        Effect.gen(function* () {
          const writer = yield* DatabaseWriter;

          return yield* writer.insert("notes", {
            text,
          });
        }),
        GenericId.GenericId("notes"),
      );

      const retrievedText = yield* c
        .query(api.databaseReader.getNote, { noteId: noteId })
        .pipe(Effect.map((note) => note.text));

      assertEquals(retrievedText, text);
    }).pipe(Effect.provide(TestConfect.layer())),
  );

  it.effect("collect", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      yield* c.run(
        Effect.gen(function* () {
          const writer = yield* DatabaseWriter;

          yield* Effect.forEach(Array.range(1, 10), (i) =>
            writer.insert("notes", {
              text: `${i}`,
            }),
          );
        }),
      );

      const notes = yield* c.query(api.databaseReader.listNotes, {});

      assertEquals(notes.length, 10);
      assertEquals(notes[0]?.text, "10");
      assertEquals(notes[9]?.text, "1");
    }).pipe(Effect.provide(TestConfect.layer())),
  );
});
