import { GenericId } from "@confect/core";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import { assertEquals } from "@effect/vitest/utils";
import { Array, Effect, Either } from "effect";
import refs from "./confect/_generated/refs";
import { DatabaseWriter } from "./confect/_generated/services";
import { Forbidden, NotFound } from "./confect/groups/typedErrors.spec";
import { NodeNotFound } from "./confect/node/typedErrorsNode.spec";
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

      const notes = yield* c.query(refs.public.databaseReader.listNotes);

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
      );

      expectTypeOf(count).toEqualTypeOf<number>();
      assertEquals(count, 2);
    }).pipe(Effect.provide(TestConfect.layer())),
  );
});

describe("paginate", () => {
  it.effect("paginate without filter", () =>
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

      const result = yield* c.query(refs.public.databaseReader.paginateNotes, {
        cursor: null,
        numItems: 3,
      });

      assertEquals(result.page.length, 3);
      assertEquals(result.isDone, false);

      const result2 = yield* c.query(refs.public.databaseReader.paginateNotes, {
        cursor: result.continueCursor,
        numItems: 3,
      });

      assertEquals(result2.page.length, 2);
      assertEquals(result2.isDone, true);
    }).pipe(Effect.provide(TestConfect.layer())),
  );

  it.effect("paginate with filter", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      yield* c.run(
        Effect.gen(function* () {
          const writer = yield* DatabaseWriter;

          yield* writer.table("notes").insert({ text: "a", tag: "important" });
          yield* writer.table("notes").insert({ text: "b", tag: "trivial" });
          yield* writer.table("notes").insert({ text: "c", tag: "important" });
          yield* writer.table("notes").insert({ text: "d", tag: "trivial" });
          yield* writer.table("notes").insert({ text: "e", tag: "important" });
        }),
      );

      const result = yield* c.query(
        refs.public.databaseReader.paginateNotesWithFilter,
        { cursor: null, numItems: 10, tag: "important" },
      );

      assertEquals(result.page.length, 3);
      assertEquals(result.isDone, true);

      const texts = result.page.map((n) => n.text);
      assertEquals(texts.includes("a"), true);
      assertEquals(texts.includes("c"), true);
      assertEquals(texts.includes("e"), true);
    }).pipe(Effect.provide(TestConfect.layer())),
  );

  it.effect("paginate with filter returns empty when no matches", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      yield* c.run(
        Effect.gen(function* () {
          const writer = yield* DatabaseWriter;

          yield* writer.table("notes").insert({ text: "a", tag: "trivial" });
          yield* writer.table("notes").insert({ text: "b", tag: "trivial" });
        }),
      );

      const result = yield* c.query(
        refs.public.databaseReader.paginateNotesWithFilter,
        { cursor: null, numItems: 10, tag: "important" },
      );

      assertEquals(result.page.length, 0);
      assertEquals(result.isDone, true);
    }).pipe(Effect.provide(TestConfect.layer())),
  );

  it.effect("paginate with filter paginates correctly", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      yield* c.run(
        Effect.gen(function* () {
          const writer = yield* DatabaseWriter;

          yield* Effect.forEach(Array.range(1, 10), (i) =>
            writer
              .table("notes")
              .insert({ text: `note ${i}`, tag: i % 2 === 0 ? "even" : "odd" }),
          );
        }),
      );

      const page1 = yield* c.query(
        refs.public.databaseReader.paginateNotesWithFilter,
        { cursor: null, numItems: 2, tag: "even" },
      );

      assertEquals(page1.page.length, 2);

      for (const note of page1.page) {
        assertEquals(note.tag, "even");
      }
    }).pipe(Effect.provide(TestConfect.layer())),
  );
});

const expectFailure = <A, E>(either: Either.Either<A, E>): E => {
  expect(Either.isLeft(either)).toBe(true);
  if (!Either.isLeft(either)) throw new Error("unreachable");
  return either.left;
};

// Insert a note then immediately delete it to obtain a well-formed Convex id
// that no longer points at any document. Convex's argument validators reject
// arbitrary strings when the spec declares Id<"notes">.
const insertAndDeleteNote = Effect.gen(function* () {
  const c = yield* TestConfect.TestConfect;
  return yield* c.run(
    Effect.gen(function* () {
      const writer = yield* DatabaseWriter;
      const id = yield* writer.table("notes").insert({ text: "transient" });
      yield* writer.table("notes").delete(id);
      return id;
    }),
    GenericId.GenericId("notes"),
  );
}).pipe(Effect.orDie);

describe("typed errors", () => {
  describe("server-side encoding", () => {
    it.effect("query handler typed error surfaces as the typed error", () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;
        const missingId = yield* insertAndDeleteNote;

        const result = yield* Effect.either(
          c.query(refs.public.groups.typedErrors.getNoteOrFail, {
            noteId: missingId,
          }),
        );

        const error = expectFailure(result);
        expect(error).toBeInstanceOf(NotFound);
        expect((error as NotFound).id).toBe(missingId);
      }).pipe(Effect.provide(TestConfect.layer())),
    );

    it.effect(
      "mutation handler typed error (NotFound) surfaces as the typed error",
      () =>
        Effect.gen(function* () {
          const c = yield* TestConfect.TestConfect;
          const missingId = yield* insertAndDeleteNote;

          const result = yield* Effect.either(
            c.mutation(refs.public.groups.typedErrors.deleteNoteOrFail, {
              noteId: missingId,
              asAdmin: true,
            }),
          );

          const error = expectFailure(result);
          expect(error).toBeInstanceOf(NotFound);
          expect((error as NotFound).id).toBe(missingId);
        }).pipe(Effect.provide(TestConfect.layer())),
    );

    it.effect(
      "mutation handler typed error (Forbidden) surfaces as the typed error",
      () =>
        Effect.gen(function* () {
          const c = yield* TestConfect.TestConfect;
          const missingId = yield* insertAndDeleteNote;

          const result = yield* Effect.either(
            c.mutation(refs.public.groups.typedErrors.deleteNoteOrFail, {
              noteId: missingId,
              asAdmin: false,
            }),
          );

          const error = expectFailure(result);
          expect(error).toBeInstanceOf(Forbidden);
          expect((error as Forbidden).reason).toBe("admin required");
        }).pipe(Effect.provide(TestConfect.layer())),
    );

    it.effect("action handler typed error surfaces as the typed error", () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;

        const result = yield* Effect.either(
          c.action(refs.public.groups.typedErrors.failingAction, {
            kind: "forbidden",
          }),
        );

        const error = expectFailure(result);
        expect(error).toBeInstanceOf(Forbidden);
        expect((error as Forbidden).reason).toBe("no access");
      }).pipe(Effect.provide(TestConfect.layer())),
    );
  });

  describe("runner decoding", () => {
    it.effect("QueryRunner decodes nested typed error to tagged result", () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;
        const missingId = yield* insertAndDeleteNote;

        const result = yield* c.query(
          refs.public.groups.typedErrors.tryGetNote,
          { noteId: missingId },
        );

        expect(result).toStrictEqual({ _tag: "NotFound", id: missingId });
      }).pipe(Effect.provide(TestConfect.layer())),
    );

    it.effect("QueryRunner Ok path: returns the decoded note text", () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;

        const noteId = yield* c.run(
          Effect.gen(function* () {
            const writer = yield* DatabaseWriter;
            return yield* writer.table("notes").insert({ text: "hello" });
          }),
          GenericId.GenericId("notes"),
        );

        const result = yield* c.query(
          refs.public.groups.typedErrors.tryGetNote,
          { noteId },
        );

        expect(result).toStrictEqual({ _tag: "Ok", text: "hello" });
      }).pipe(Effect.provide(TestConfect.layer())),
    );

    it.effect("MutationRunner decodes NotFound to tagged result", () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;
        const missingId = yield* insertAndDeleteNote;

        const result = yield* c.action(
          refs.public.groups.typedErrors.tryDeleteNote,
          { noteId: missingId, asAdmin: true },
        );

        expect(result).toStrictEqual({ _tag: "NotFound", id: missingId });
      }).pipe(Effect.provide(TestConfect.layer())),
    );

    it.effect("MutationRunner decodes Forbidden to tagged result", () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;
        const missingId = yield* insertAndDeleteNote;

        const result = yield* c.action(
          refs.public.groups.typedErrors.tryDeleteNote,
          { noteId: missingId, asAdmin: false },
        );

        expect(result).toStrictEqual({
          _tag: "Forbidden",
          reason: "admin required",
        });
      }).pipe(Effect.provide(TestConfect.layer())),
    );

    it.effect("MutationRunner Ok path: deletes the existing note", () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;

        const noteId = yield* c.run(
          Effect.gen(function* () {
            const writer = yield* DatabaseWriter;
            return yield* writer.table("notes").insert({ text: "to delete" });
          }),
          GenericId.GenericId("notes"),
        );

        const result = yield* c.action(
          refs.public.groups.typedErrors.tryDeleteNote,
          { noteId, asAdmin: true },
        );

        expect(result).toStrictEqual({ _tag: "Ok" });

        const remaining = yield* c.query(refs.public.databaseReader.listNotes);
        assertEquals(remaining.length, 0);
      }).pipe(Effect.provide(TestConfect.layer())),
    );

    it.effect("ActionRunner decodes NotFound to tagged result", () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;

        const result = yield* c.action(
          refs.public.groups.typedErrors.tryFailingAction,
          { kind: "notFound" },
        );

        expect(result).toStrictEqual({ _tag: "NotFound", id: "missing" });
      }).pipe(Effect.provide(TestConfect.layer())),
    );

    it.effect("ActionRunner decodes Forbidden to tagged result", () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;

        const result = yield* c.action(
          refs.public.groups.typedErrors.tryFailingAction,
          { kind: "forbidden" },
        );

        expect(result).toStrictEqual({
          _tag: "Forbidden",
          reason: "no access",
        });
      }).pipe(Effect.provide(TestConfect.layer())),
    );
  });

  describe("round-trip identity", () => {
    it.effect(
      "decoded error data round-trips into the original TaggedError class",
      () =>
        Effect.gen(function* () {
          const c = yield* TestConfect.TestConfect;
          const missingId = yield* insertAndDeleteNote;

          const queryResult = yield* Effect.either(
            c.query(refs.public.groups.typedErrors.getNoteOrFail, {
              noteId: missingId,
            }),
          );
          const notFound = expectFailure(queryResult);
          expect(notFound).toBeInstanceOf(NotFound);
          expect((notFound as NotFound).id).toBe(missingId);

          const mutationResult = yield* Effect.either(
            c.mutation(refs.public.groups.typedErrors.deleteNoteOrFail, {
              noteId: missingId,
              asAdmin: false,
            }),
          );
          const forbidden = expectFailure(mutationResult);
          expect(forbidden).toBeInstanceOf(Forbidden);
          expect((forbidden as Forbidden).reason).toBe("admin required");
        }).pipe(Effect.provide(TestConfect.layer())),
    );
  });

  describe("mutation rollback", () => {
    it.effect(
      "throwing typed error from a mutation rolls back inserted rows",
      () =>
        Effect.gen(function* () {
          const c = yield* TestConfect.TestConfect;

          const result = yield* Effect.either(
            c.mutation(refs.public.groups.typedErrors.insertThenFail, {
              text: "should not persist",
            }),
          );

          const error = expectFailure(result);
          expect(error).toBeInstanceOf(NotFound);
          expect((error as NotFound).id).toBe("rolled-back");

          const notes = yield* c.query(refs.public.databaseReader.listNotes);
          assertEquals(notes.length, 0);
        }).pipe(Effect.provide(TestConfect.layer())),
    );
  });

  describe("internal visibility", () => {
    it.effect(
      "QueryRunner decodes a typed error from an internal query into the typed E channel",
      () =>
        Effect.gen(function* () {
          const c = yield* TestConfect.TestConfect;
          const missingId = yield* insertAndDeleteNote;

          const result = yield* c.action(
            refs.public.groups.typedErrors.tryInternalGetNote,
            { noteId: missingId },
          );

          expect(result).toStrictEqual({ _tag: "NotFound", id: missingId });
        }).pipe(Effect.provide(TestConfect.layer())),
    );
  });

  describe("node action", () => {
    it.effect(
      "typed error from a publicNodeAction surfaces as the typed error",
      () =>
        Effect.gen(function* () {
          const c = yield* TestConfect.TestConfect;

          const result = yield* Effect.either(
            c.action(refs.public.node.typedErrorsNode.failingNodeAction, {
              id: "abc",
            }),
          );

          const error = expectFailure(result);
          expect(error).toBeInstanceOf(NodeNotFound);
          expect((error as NodeNotFound).id).toBe("abc");
        }).pipe(Effect.provide(TestConfect.layer())),
    );
  });
});
