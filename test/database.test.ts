import { describe, vi } from "@effect/vitest";
import { assertEquals, assertFailure, assertTrue } from "@effect/vitest/utils";
import { Cause, Effect, Exit, Option, Runtime, Schema, String } from "effect";
import {
  DocumentDecodeError,
  GetByIdFailure,
  GetByIndexFailure,
} from "../src/server/database";
import { api } from "./convex/_generated/api";
import { confectSchema } from "./convex/schema";
import { TestConvexService } from "./TestConvexService";
import { effect } from "./test_utils";

describe("ConfectDatabaseReader", () => {
  describe("getById", () => {
    effect("when document exists", () =>
      Effect.gen(function* () {
        const c = yield* TestConvexService;
        yield* Effect.sync(() => vi.useFakeTimers());

        const text = "Hello, world!";

        const noteId = yield* c.run(({ db }) => db.insert("notes", { text }));

        const note = yield* c.query(api.database.getById, {
          noteId,
        });

        assertEquals(note._id, noteId);
      }),
    );

    effect("when document no longer exists", () =>
      Effect.gen(function* () {
        const c = yield* TestConvexService;

        const noteId = yield* c.run(({ db }) =>
          db.insert("notes", { text: "Hello, world!" }),
        );

        yield* c.run(({ db }) => db.delete(noteId));

        const exit = yield* c
          .query(api.database.getById, {
            noteId,
          })
          .pipe(Effect.exit);

        assertFailure(
          exit,
          Cause.die(
            Runtime.makeFiberFailure(
              Cause.fail(
                new GetByIdFailure({
                  id: noteId,
                  tableName: "notes",
                }),
              ),
            ),
          ),
        );
      }),
    );

    effect("when document is invalid", () =>
      Effect.gen(function* () {
        const c = yield* TestConvexService;

        const invalidText = String.repeat(101)("a");

        const noteId = yield* c.run(({ db }) =>
          db.insert("notes", { text: invalidText }),
        );

        const exit = yield* c
          .query(api.database.getById, {
            noteId,
          })
          .pipe(Effect.exit);

        assertFailure(
          exit,
          Cause.die(
            Runtime.makeFiberFailure(
              Cause.fail(
                new DocumentDecodeError({
                  tableName: "notes",
                  id: noteId,
                  parseError: `{ readonly _id: string; readonly _creationTime: number; readonly userId?: string | undefined; readonly text: maxLength(100); readonly tag?: string | undefined; readonly author?: { readonly role: "admin" | "user"; readonly name: string } | undefined; readonly embedding?: ReadonlyArray<number> | undefined; readonly bigDecimal?: BigDecimal | undefined }
└─ ["text"]
   └─ maxLength(100)
      └─ Predicate refinement failure
         └─ Expected a string at most 100 character(s) long, actual "${invalidText}"`,
                }),
              ),
            ),
          ),
        );
      }),
    );
  });

  describe("getByIndex", () => {
    effect("when document exists", () =>
      Effect.gen(function* () {
        const c = yield* TestConvexService;

        const name = "John Doe";
        const role = "admin";
        const text = "Hello, world!";

        const noteId = yield* c.run(({ db }) =>
          db.insert("notes", {
            author: { name, role },
            text,
          }),
        );

        const note = yield* c.query(api.database.getByIndex, {
          name,
          role,
          text,
        });

        assertEquals(note._id, noteId);
      }),
    );

    effect("when document no longer exists", () =>
      Effect.gen(function* () {
        const c = yield* TestConvexService;

        const name = "John Doe";
        const role = "admin";
        const text = "Hello, world!";

        const noteId = yield* c.run(({ db }) =>
          db.insert("notes", { author: { name, role }, text }),
        );

        yield* c.run(({ db }) => db.delete(noteId));

        const exit = yield* c
          .query(api.database.getByIndex, {
            name,
            role,
            text,
          })
          .pipe(Effect.exit);

        assertFailure(
          exit,
          Cause.die(
            Runtime.makeFiberFailure(
              Cause.fail(
                new GetByIndexFailure({
                  tableName: "notes",
                  indexName: "by_name_and_role_and_text",
                  indexFieldValues: [name, role, text],
                }),
              ),
            ),
          ),
        );
      }),
    );
  });

  effect("first", () =>
    Effect.gen(function* () {
      const c = yield* TestConvexService;

      const [noteId1, _noteId2] = yield* c.run(({ db }) =>
        Promise.all([
          db.insert("notes", { text: "1" }),
          db.insert("notes", { text: "2" }),
        ]),
      );

      const note = yield* c
        .query(api.database.first, {})
        .pipe(
          Effect.andThen(
            Schema.decode(
              Schema.Option(confectSchema.tableSchemas.notes.withSystemFields),
            ),
          ),
          Effect.andThen(Option.getOrThrow),
        );

      assertEquals(note._id, noteId1);
    }),
  );

  effect("take", () =>
    Effect.gen(function* () {
      const c = yield* TestConvexService;

      const [noteId1, noteId2] = yield* c.run(({ db }) =>
        Promise.all([
          db.insert("notes", { text: "1" }),
          db.insert("notes", { text: "2" }),
        ]),
      );

      const notes = yield* c.query(api.database.take, {
        n: 3,
      });

      assertEquals(notes.length, 2);
      assertEquals(notes[0]?._id, noteId1);
      assertEquals(notes[1]?._id, noteId2);
    }),
  );

  effect("collect", () =>
    Effect.gen(function* () {
      const c = yield* TestConvexService;

      const [noteId1, noteId2] = yield* c.run(({ db }) =>
        Promise.all([
          db.insert("notes", { text: "1" }),
          db.insert("notes", { text: "2" }),
        ]),
      );

      const notes = yield* c.query(api.database.collect, {});

      assertEquals(notes.length, 2);
      assertEquals(notes[0]?._id, noteId1);
      assertEquals(notes[1]?._id, noteId2);
    }),
  );

  effect("paginate", () =>
    Effect.gen(function* () {
      const c = yield* TestConvexService;

      const [noteId1, noteId2] = yield* c.run(({ db }) =>
        Promise.all([
          db.insert("notes", { text: "1" }),
          db.insert("notes", { text: "2" }),
        ]),
      );

      const notes = yield* c.query(api.database.paginate, {
        cursor: null,
        numItems: 2,
      });

      assertEquals(notes.page.length, 2);
      assertEquals(notes.page[0]?._id, noteId1);
      assertEquals(notes.page[1]?._id, noteId2);
    }),
  );

  effect("stream", () =>
    Effect.gen(function* () {
      const c = yield* TestConvexService;

      const [noteId1, noteId2] = yield* c.run(({ db }) =>
        Promise.all([
          db.insert("notes", { text: "1" }),
          db.insert("notes", { text: "2" }),
          db.insert("notes", { text: "3" }),
        ]),
      );

      const notes = yield* c.query(api.database.stream, {
        until: "2",
      });

      assertEquals(notes.length, 2);
      assertEquals(notes[0]?._id, noteId1);
      assertEquals(notes[1]?._id, noteId2);
    }),
  );

  describe("withIndex", () => {
    effect("without query range without order", () =>
      Effect.gen(function* () {
        const c = yield* TestConvexService;

        const [noteId1, noteId2] = yield* c.run(({ db }) =>
          Promise.all([
            db.insert("notes", { text: "1" }),
            db.insert("notes", { text: "2" }),
            db.insert("notes", { text: "3" }),
          ]),
        );

        const notes = yield* c.query(
          api.database.withIndexWithQueryRangeWithOrder,
        );

        assertEquals(notes.length, 2);
        assertEquals(notes[0]?._id, noteId1);
        assertEquals(notes[1]?._id, noteId2);
      }),
    );

    effect("with query range without order", () =>
      Effect.gen(function* () {
        const c = yield* TestConvexService;

        const [_noteId1, noteId2, noteId3] = yield* c.run(({ db }) =>
          Promise.all([
            db.insert("notes", { text: "1" }),
            db.insert("notes", { text: "2" }),
            db.insert("notes", { text: "3" }),
          ]),
        );

        const notes = yield* c.query(
          api.database.withIndexWithQueryRangeWithoutOrder,
          {
            text: "2",
          },
        );

        assertEquals(notes.length, 2);
        assertEquals(notes[0]?._id, noteId2);
        assertEquals(notes[1]?._id, noteId3);
      }),
    );

    effect("with query range and order", () =>
      Effect.gen(function* () {
        const c = yield* TestConvexService;

        const [_noteId1, noteId2, noteId3] = yield* c.run(({ db }) =>
          Promise.all([
            db.insert("notes", { text: "1" }),
            db.insert("notes", { text: "2" }),
            db.insert("notes", { text: "3" }),
          ]),
        );

        const notes = yield* c.query(
          api.database.withIndexWithQueryRangeAndOrder,
          {
            text: "1",
          },
        );

        assertEquals(notes.length, 2);
        assertEquals(notes[0]?._id, noteId3);
        assertEquals(notes[1]?._id, noteId2);
      }),
    );

    effect("without query range with order", () =>
      Effect.gen(function* () {
        const c = yield* TestConvexService;

        const [_noteId1, noteId2, noteId3] = yield* c.run(({ db }) =>
          Promise.all([
            db.insert("notes", { text: "1" }),
            db.insert("notes", { text: "2" }),
            db.insert("notes", { text: "3" }),
          ]),
        );

        const notes = yield* c.query(
          api.database.withIndexWithoutQueryRangeWithOrder,
        );

        assertEquals(notes.length, 2);
        assertEquals(notes[0]?._id, noteId3);
        assertEquals(notes[1]?._id, noteId2);
      }),
    );

    effect("without query range without order", () =>
      Effect.gen(function* () {
        const c = yield* TestConvexService;

        const [noteId1, noteId2] = yield* c.run(({ db }) =>
          Promise.all([
            db.insert("notes", { text: "1" }),
            db.insert("notes", { text: "2" }),
            db.insert("notes", { text: "3" }),
          ]),
        );

        const notes = yield* c.query(
          api.database.withIndexWithoutQueryRangeWithoutOrder,
        );

        assertEquals(notes.length, 2);
        assertEquals(notes[0]?._id, noteId1);
        assertEquals(notes[1]?._id, noteId2);
      }),
    );

    effect("withSearchIndex", () =>
      Effect.gen(function* () {
        const c = yield* TestConvexService;

        const [_noteId1, noteId2] = yield* c.run(({ db }) =>
          Promise.all([
            db.insert("notes", { text: "Ocean blue" }),
            db.insert("notes", { text: "Ocean blue", tag: "colors" }),
            db.insert("notes", { text: "Sea green", tag: "colors" }),
          ]),
        );

        const notes = yield* c.query(api.database.withSearchIndex, {
          text: "blue",
        });

        assertEquals(notes.length, 1);
        assertEquals(notes[0]?._id, noteId2);
      }),
    );

    describe("system tables", () => {
      effect("get", () =>
        Effect.gen(function* () {
          const c = yield* TestConvexService;

          const storageId = yield* c.run(({ storage }) =>
            storage.store(new Blob(["Hello, world!"])),
          );

          const storageDoc = yield* c.query(api.database.systemGet, {
            id: storageId,
          });

          assertEquals(storageDoc._id, storageId);
        }),
      );

      effect("query", () =>
        Effect.gen(function* () {
          const c = yield* TestConvexService;

          const storageId = yield* c.run(({ storage }) =>
            storage.store(new Blob(["Hello, world!"])),
          );

          const storageDocs = yield* c.query(api.database.systemQuery);

          assertEquals(storageDocs.length, 1);
          assertEquals(storageDocs[0]?._id, storageId);
        }),
      );
    });
  });
});

describe("ConfectDatabaseWriter", () => {
  describe("patch", () => {
    effect("when invalid", () =>
      Effect.gen(function* () {
        const c = yield* TestConvexService;

        const noteId = yield* c.run(({ db }) =>
          db.insert("notes", { text: "Hello, world!" }),
        );

        const tooLongText = String.repeat(101)("a");

        const exit = yield* c
          .mutation(api.database.patch, {
            noteId,
            fields: {
              text: tooLongText,
            },
          })
          .pipe(Effect.exit);

        assertTrue(Exit.isFailure(exit));
      }),
    );

    effect("when valid", () =>
      Effect.gen(function* () {
        const c = yield* TestConvexService;

        const noteId = yield* c.run(({ db }) =>
          db.insert("notes", { text: "Hello, world!" }),
        );

        const author = { role: "user", name: "Joe" } as const;

        yield* c.mutation(api.database.patch, {
          noteId,
          fields: { author },
        });

        const patchedNote = yield* c.run(({ db }) => db.get(noteId));

        assertEquals(patchedNote?.author?.name, author.name);
        assertEquals(patchedNote?.author?.role, author.role);
      }),
    );

    effect("when document no longer exists", () =>
      Effect.gen(function* () {
        const c = yield* TestConvexService;

        const noteId = yield* c.run(({ db }) =>
          db.insert("notes", { text: "Hello, world!" }),
        );

        yield* c.run(({ db }) => db.delete(noteId));

        const exit = yield* c
          .mutation(api.database.patch, {
            noteId,
            fields: { text: "Hello, world!" },
          })
          .pipe(Effect.exit);

        assertTrue(Exit.isFailure(exit));
      }),
    );

    effect("when unsetting a field", () =>
      Effect.gen(function* () {
        const c = yield* TestConvexService;

        const tag = "greeting";

        const noteId = yield* c.run(({ db }) =>
          db.insert("notes", {
            text: "Hello, world!",
            tag,
            author: { role: "user", name: "Joe" },
          }),
        );

        yield* c.mutation(api.database.patchUnset, {
          noteId,
        });

        const patchedNote = yield* c.run(({ db }) => db.get(noteId));

        assertEquals(patchedNote?.author, undefined);
        assertEquals(patchedNote?.tag, tag);
      }),
    );
  });

  effect("replace", () =>
    Effect.gen(function* () {
      const c = yield* TestConvexService;

      const initialText = "Hello, Earth!";
      const updatedText = "Hello, Mars!";

      const noteId = yield* c.run(({ db }) =>
        db.insert("notes", { text: initialText }),
      );
      const note = yield* c.run(({ db }) => db.get(noteId));

      const updatedNoteFields = { ...note, text: updatedText };

      yield* c.mutation(api.database.replace, {
        noteId,
        fields: updatedNoteFields,
      });

      const replacedNote = yield* c.run(({ db }) => db.get(noteId));

      assertEquals(replacedNote?.text, updatedText);
    }),
  );

  describe("delete", () => {
    effect("when document exists", () =>
      Effect.gen(function* () {
        const c = yield* TestConvexService;

        const noteId = yield* c.run(({ db }) =>
          db.insert("notes", { text: "Hello, world!" }),
        );

        yield* c.mutation(api.database.delete_, {
          noteId,
        });

        const gottenNote = yield* c.run(({ db }) => db.get(noteId));

        assertEquals(gottenNote, null);
      }),
    );

    effect("when document no longer exists", () =>
      Effect.gen(function* () {
        const c = yield* TestConvexService;

        const noteId = yield* c.run(({ db }) =>
          db.insert("notes", { text: "Hello, world!" }),
        );

        yield* c.run(({ db }) => db.delete(noteId));

        const exit = yield* c
          .mutation(api.database.delete_, {
            noteId,
          })
          .pipe(Effect.exit);

        assertTrue(Exit.isFailure(exit));
      }),
    );
  });
});
