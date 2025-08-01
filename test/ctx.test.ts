import { describe } from "@effect/vitest";
import { assertEquals } from "@effect/vitest/utils";
import { Effect } from "effect";
import { api } from "./convex/_generated/api";
import { TestConvexService } from "./TestConvexService";
import { effect } from "./test_utils";

describe("QueryCtx", () => {
  effect("should get a note", () =>
    Effect.gen(function* () {
      const c = yield* TestConvexService;

      const text = "Hello, world!";

      const noteId = yield* c.run(({ db }) =>
        db.insert("notes", {
          text,
        }),
      );

      const retrievedText = yield* c.query(api.ctx.get, {
        id: noteId,
      });

      assertEquals(retrievedText, text);
    }),
  );
});

describe("MutationCtx", () => {
  effect("should insert a note", () =>
    Effect.gen(function* () {
      const c = yield* TestConvexService;

      const text = "Hello, world!";

      const noteId = yield* c.mutation(api.ctx.insert, {
        text,
      });

      const note = yield* c.run(({ db }) => db.get(noteId));

      assertEquals(note?.text, text);
    }),
  );
});

describe("ActionCtx", () => {
  effect("should insert a note", () =>
    Effect.gen(function* () {
      const c = yield* TestConvexService;

      const text = "Hello, world!";

      const noteId = yield* c.run(({ db }) =>
        db.insert("notes", {
          text,
        }),
      );

      const retrievedText = yield* c.action(api.ctx.actionGet, {
        id: noteId,
      });

      assertEquals(retrievedText, text);
    }),
  );
});
