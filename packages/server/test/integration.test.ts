import { expect, layer } from "@effect/vitest";
import { assertEquals } from "@effect/vitest/utils";
import { Effect, Option } from "effect";
import { api } from "./confect/_generated/refs";
import { DatabaseWriter } from "./confect/_generated/services";
import * as TestConfect from "./TestConfect";

layer(TestConfect.layer)("reading from the database", (it) => {
  it.effect("should get a note", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      const text = "Hello, world!";

      yield* c.run(
        Effect.gen(function* () {
          const writer = yield* DatabaseWriter;

          yield* writer.insert("notes", {
            text,
          });
        }),
      );

      const retrievedText = yield* c
        .query(api.groups.notes.getFirst, {})
        .pipe(Effect.map(Option.map((note) => note.text)));

      assertEquals(retrievedText, Option.some(text));
    }),
  );
});

layer(TestConfect.layer)("MutationCtx", (it) => {
  it.effect("should insert a note", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      const text = "Hello, world!";

      yield* c.mutation(api.groups.notes.insert, {
        text,
      });

      const note = yield* c
        .query(api.groups.notes.getFirst, {})
        .pipe(Effect.map(Option.map((note_) => note_.text)));

      assertEquals(note, Option.some(text));
    }),
  );
});

layer(TestConfect.layer)("ActionCtx", (it) => {
  it.effect("should insert a note", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      const randomNumber = yield* c.action(api.groups.random.getNumber, {});

      expect(typeof randomNumber).toBe("number");
    }),
  );
});
