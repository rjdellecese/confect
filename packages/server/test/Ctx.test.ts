import { describe, expect } from "@effect/vitest";
import { assertEquals } from "@effect/vitest/utils";
import { Effect, Option } from "effect";
import { api } from "./confect/_generated/refs";
import { DatabaseWriter } from "./confect/_generated/services";
import { TestConfect } from "./TestConfect";
import { effect } from "./testUtils";

describe("QueryCtx", () => {
  effect("should get a note", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect;

      const text = "Hello, world!";

      yield* c.run(
        Effect.gen(function* () {
          const writer = yield* DatabaseWriter;

          return yield* writer.insert("notes", {
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

describe("MutationCtx", () => {
  effect("should insert a note", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect;

      const text = "Hello, world!";

      yield* c.mutation(api.groups.notes.insert, {
        text,
      });

      const note = yield* c
        .query(api.groups.notes.getFirst, {})
        .pipe(Effect.map(Option.map(({ text }) => text)));

      assertEquals(note, Option.some(text));
    }),
  );
});

describe("ActionCtx", () => {
  effect("should insert a note", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect;

      const randomNumber = yield* c.action(api.groups.random.getNumber, {});

      expect(typeof randomNumber).toBe("number");
    }),
  );
});
