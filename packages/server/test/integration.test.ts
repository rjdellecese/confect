import { GenericId } from "@confect/core";
import { describe, expectTypeOf, it } from "@effect/vitest";
import { assertEquals } from "@effect/vitest/utils";
import { Array, Effect } from "effect";
import refs from "./confect/_generated/refs";
import { DatabaseWriter } from "./confect/_generated/services";
import type { Notes } from "./confect/tables/Notes";
import * as TestConfect from "./TestConfect";

describe("DatabaseReader", () => {
  it.effect("get", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      const text = "Hello, world!";

      const noteId = yield* c.run(
        Effect.gen(function* () {
          const writer = yield* DatabaseWriter;

          return yield* writer.table("notes").insert({
            text,
          });
        }),
        GenericId.GenericId("notes"),
      );

      const retrievedText = yield* c
        .query(refs.public.databaseReader.getNote, { noteId: noteId })
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
            writer.table("notes").insert({
              text: `${i}`,
            }),
          );
        }),
      );

      const notes = yield* c.query(refs.public.databaseReader.listNotes, {});

      assertEquals(notes.length, 10);
      assertEquals(notes[0]?.text, "10");
      assertEquals(notes[9]?.text, "1");
    }).pipe(Effect.provide(TestConfect.layer())),
  );
});

describe("MutationRunner", () => {
  it.effect("insertNoteViaRunner", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      const text = "via runner";

      const noteId = yield* c.action(
        refs.public.groups.runners.insertNoteViaRunner,
        { text },
      );

      const note = yield* c.query(refs.public.databaseReader.getNote, {
        noteId,
      });
      expectTypeOf(note).toEqualTypeOf<(typeof Notes.Doc)["Type"]>();
      assertEquals(note.text, text);
    }).pipe(Effect.provide(TestConfect.layer())),
  );
});

describe("ActionRunner", () => {
  it.effect("getNumberViaRunner", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      const result = yield* c.action(
        refs.public.groups.runners.getNumberViaRunner,
        {},
      );

      expectTypeOf(result).toEqualTypeOf<number>();
      assertEquals(typeof result, "number");
    }).pipe(Effect.provide(TestConfect.layer())),
  );
});

describe("QueryRunner", () => {
  it.effect("countNotesViaRunner", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      yield* c.mutation(refs.public.groups.notes.insert, { text: "one" });
      yield* c.mutation(refs.public.groups.notes.insert, { text: "two" });

      const count = yield* c.action(
        refs.public.groups.runners.countNotesViaRunner,
        {},
      );

      expectTypeOf(count).toEqualTypeOf<number>();
      assertEquals(count, 2);
    }).pipe(Effect.provide(TestConfect.layer())),
  );
});
