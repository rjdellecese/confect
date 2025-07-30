import { assert, describe, expect, vi } from "@effect/vitest";
import { assertEquals } from "@effect/vitest/utils";
import { Array, Effect } from "effect";
import { api } from "~/test/convex/_generated/api";
import { test } from "~/test/convex-effect-test";
import { TestConvexService } from "~/test/test-convex-service";

describe("ConfectDatabaseReader", () => {
  test("getById", () =>
    Effect.gen(function* () {
      const c = yield* TestConvexService;
      yield* Effect.sync(() => vi.useFakeTimers());

      const text = "Hello, world!";

      const noteId = yield* c.run(({ db }) => db.insert("notes", { text }));

      const note = yield* c.query(
        api.integration.database.databaseReaderGetById,
        {
          noteId,
        },
      );

      assertEquals(note._id, noteId);
    }));

  test("getManyById", () =>
    Effect.gen(function* () {
      const c = yield* TestConvexService;

      const text = "Hello, world!";

      const noteId1 = yield* c.run(({ db }) => db.insert("notes", { text }));
      const noteId2 = yield* c.run(({ db }) => db.insert("notes", { text }));

      const notes = yield* c.query(
        api.integration.database.databaseReaderGetManyById,
        {
          noteIds: [noteId1, noteId2],
        },
      );

      assert.includeMembers(
        Array.map(notes, ({ _id }) => _id),
        [noteId1, noteId2],
      );
    }));
});
