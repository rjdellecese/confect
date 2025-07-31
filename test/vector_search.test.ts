import { describe, expect } from "@effect/vitest";
import { Effect } from "effect";
import { api } from "~/test/convex/_generated/api";
import { effect } from "~/test/convex_effect_test";
import { TestConvexService } from "~/test/TestConvexService";

describe("ConfectVectorSearch", () => {
  effect("vectorSearch", () =>
    Effect.gen(function* () {
      const c = yield* TestConvexService;

      yield* c.run(({ db }) =>
        Promise.all([
          db.insert("notes", {
            tag: "Art",
            text: "convex",
            embedding: [1, 1, 1],
          }),
          db.insert("notes", {
            tag: "Sports",
            text: "next",
            embedding: [0, 0, 0],
          }),
          db.insert("notes", {
            tag: "Art",
            text: "base",
            embedding: [1, 1, 0],
          }),
          db.insert("notes", {
            tag: "Sports",
            text: "rad",
            embedding: [1, 1, 0],
          }),
        ]),
      );

      {
        const notes = yield* c.action(api.vector_search.vectorSearch, {
          vector: [1, 1, 1],
          tag: null,
          limit: 3,
        });

        expect(notes).toMatchObject([
          { tag: "Art", text: "convex" },
          { tag: "Art", text: "base" },
          { tag: "Sports", text: "rad" },
        ]);
      }

      {
        const notes = yield* c.action(api.vector_search.vectorSearch, {
          vector: [1, 1, 1],
          tag: "Art",
          limit: 10,
        });

        expect(notes).toMatchObject([
          { tag: "Art", text: "convex" },
          { tag: "Art", text: "base" },
        ]);
      }
    }),
  );
});
