import { describe, expect } from "@effect/vitest";
import { Array, Effect, Exit, Order, String } from "effect";
import { api } from "~/test/convex/_generated/api";
import type { Id } from "~/test/convex/_generated/dataModel";
import { test } from "~/test/convex-effect-test";
import { TestConvexService } from "~/test/test-convex-service";

test("query get by id", () =>
  Effect.gen(function* () {
    const c = yield* TestConvexService;

    const text = "Hello world!";

    const noteId = yield* c.run(({ db }) => db.insert("notes", { text }));

    const note = yield* c.query(api.functions.queryGetById, {
      noteId,
    });

    expect(note).toMatchObject({ text });
  }));

test("query get many by id", () =>
  Effect.gen(function* () {
    const c = yield* TestConvexService;

    const text = "Hello world!";

    const noteId1 = yield* c.run(({ db }) => db.insert("notes", { text }));
    const noteId2 = yield* c.run(({ db }) => db.insert("notes", { text }));

    const notes = yield* c.query(api.functions.queryGetManyById, {
      noteIds: [noteId1, noteId2],
    });

    expect(notes.length).toEqual(2);
    expect(notes[0]).toMatchObject({ text });
    expect(notes[1]).toMatchObject({ text });
  }));

test("query get by index with one field", () =>
  Effect.gen(function* () {
    const c = yield* TestConvexService;

    const text = "Hello world!";

    const noteId = yield* c.run(({ db }) => db.insert("notes", { text }));

    const note = yield* c.query(api.functions.queryGetByIndexOneField, {
      text,
    });

    expect(note?._id).toEqual(noteId);
  }));

test("query get by index with three fields", () =>
  Effect.gen(function* () {
    const c = yield* TestConvexService;

    const text = "Hello world!";
    const name = "John";
    const role = "admin";

    const noteId = yield* c.run(({ db }) =>
      db.insert("notes", {
        text,
        author: { name, role },
      }),
    );

    const note = yield* c.query(api.functions.queryGetByIndexThreeFields, {
      name,
      role,
      text,
    });

    expect(note?._id).toEqual(noteId);
  }));

test("query ordered unique", () =>
  Effect.gen(function* () {
    const c = yield* TestConvexService;

    const noteId = yield* c.run(({ db }) =>
      db.insert("notes", { text: "Hello, world!" }),
    );

    const note = yield* c.query(api.functions.queryOrderedUnique, {});

    expect(note?._id).toEqual(noteId);
  }));

test("query ordered unique when not unique", () =>
  Effect.gen(function* () {
    const c = yield* TestConvexService;

    yield* Effect.all(
      Effect.replicate(
        c.run(({ db }) => db.insert("notes", { text: "Hello, world!" })),
        2,
      ),
    );

    const exit = yield* c
      .query(api.functions.queryOrderedUnique, {})
      .pipe(Effect.exit);

    expect(Exit.isFailure(exit)).toBe(true);
  }));

test("query ordered take", () =>
  Effect.gen(function* () {
    const c = yield* TestConvexService;

    const text = "Hello, world!";

    const noteId1 = yield* c.run(({ db }) => db.insert("notes", { text }));
    const noteId2 = yield* c.run(({ db }) => db.insert("notes", { text }));

    const notes = yield* c.query(api.functions.queryOrderedTake, {
      n: 2,
    });

    expect(notes.length).toEqual(2);
    expect(Array.map(notes, (n) => n._id)).toEqual(
      expect.arrayContaining([noteId1, noteId2]),
    );
  }));

test("mutation get", () =>
  Effect.gen(function* () {
    const c = yield* TestConvexService;

    const text = "Hello world!";

    const noteId = yield* c.run(({ db }) => db.insert("notes", { text }));

    const note = yield* c.mutation(api.functions.mutationGet, {
      noteId,
    });

    expect(note).toMatchObject({ text });
  }));

test("insert", () =>
  Effect.gen(function* () {
    const c = yield* TestConvexService;

    const text = "Hello, world!";

    const noteId: Id<"notes"> = yield* c.mutation(api.functions.insert, {
      text,
    });

    const note = yield* c.run(({ db }) => db.get(noteId));

    expect(note?.text).toEqual(text);
  }));

test("query collect", () =>
  Effect.gen(function* () {
    const c = yield* TestConvexService;

    const text = "Hello, world!";

    yield* c.run(({ db }) => db.insert("notes", { text }));

    const notes = yield* c.query(api.functions.queryCollect, {});

    expect(notes.length).toEqual(1);
    expect(notes[0]?.text).toEqual(text);
  }));

test("mutation collect", () =>
  Effect.gen(function* () {
    const c = yield* TestConvexService;

    const text = "Hello, world!";

    yield* c.run(({ db }) => db.insert("notes", { text }));

    const notes = yield* c.mutation(api.functions.mutationCollect, {});

    expect(notes.length).toEqual(1);
    expect(notes[0]?.text).toEqual(text);
  }));

test("withIndex + first", () =>
  Effect.gen(function* () {
    const c = yield* TestConvexService;

    const text = "Hello, world!";

    yield* c.run(({ db }) =>
      db.insert("notes", {
        text: text,
      }),
    );

    const note = yield* c.query(api.functions.withIndexFirst, {
      text: text,
    });

    expect(note).toMatchObject({ text });
  }));

test("order desc + collect", () =>
  Effect.gen(function* () {
    const c = yield* TestConvexService;

    const firstText = "A";
    const secondText = "B";
    const thirdText = "C";

    yield* c.run(({ db }) =>
      Promise.all([
        // Insert in reverse of desired sort order
        db.insert("notes", { text: thirdText }),
        db.insert("notes", { text: secondText }),
        db.insert("notes", { text: firstText }),
      ]),
    );

    const notes = yield* c.query(api.functions.orderDescCollect, {});

    expect(notes.length).toEqual(3);
    expect(Array.map(notes, ({ text }) => text)).toStrictEqual([
      firstText,
      secondText,
      thirdText,
    ]);
  }));

test("take", () =>
  Effect.gen(function* () {
    const c = yield* TestConvexService;

    yield* c.run(({ db }) =>
      Promise.all(
        Array.map(Array.range(1, 5), (n) =>
          db.insert("notes", { text: `Note ${n}` }),
        ),
      ),
    );

    const oneNote = yield* c.query(api.functions.take, {
      n: 1,
    });
    const twoNotes = yield* c.query(api.functions.take, {
      n: 2,
    });
    const threeNotes = yield* c.query(api.functions.take, {
      n: 3,
    });

    expect(oneNote.length).toEqual(1);
    expect(twoNotes.length).toEqual(2);
    expect(threeNotes.length).toEqual(3);
  }));

test("paginate", () =>
  Effect.gen(function* () {
    const c = yield* TestConvexService;

    yield* c.run(({ db }) =>
      Promise.all(
        Array.map(Array.range(1, 9), (n) =>
          db.insert("notes", { text: `Note ${n}` }),
        ),
      ),
    );

    const paginationResult = yield* c.query(api.functions.paginate, {
      cursor: null,
      numItems: 5,
    });

    expect(paginationResult.page.length).toEqual(5);
    expect(paginationResult.isDone).toEqual(false);

    const paginationResult2 = yield* c.query(api.functions.paginate, {
      cursor: paginationResult.continueCursor,
      numItems: 5,
    });

    expect(paginationResult2.page.length).toEqual(4);
    expect(paginationResult2.isDone).toEqual(true);
  }));

describe("unique", () => {
  test("when one note exists", () =>
    Effect.gen(function* () {
      const c = yield* TestConvexService;

      yield* c.run(({ db }) => db.insert("notes", { text: "Hello, world!" }));

      const note = yield* c.query(api.functions.unique, {});

      expect(note).toMatchObject({
        _tag: "Some",
        value: { text: "Hello, world!" },
      });
    }));

  test("when more than two notes exist", () =>
    Effect.gen(function* () {
      const c = yield* TestConvexService;

      const text = "Hello, world!";

      yield* c.run(({ db }) =>
        Promise.all([
          db.insert("notes", { text }),
          db.insert("notes", { text }),
        ]),
      );

      const exit = yield* c.query(api.functions.unique, {}).pipe(Effect.exit);

      expect(Exit.isFailure(exit)).toBe(true);
    }));

  test("when zero notes exist", () =>
    Effect.gen(function* () {
      const c = yield* TestConvexService;

      const note = yield* c.query(api.functions.unique, {});

      expect(note).toMatchObject({ _tag: "None" });
    }));
});

describe("first without filters", () => {
  test("when one note exists", () =>
    Effect.gen(function* () {
      const c = yield* TestConvexService;

      const text = "Hello, world!";

      yield* c.run(({ db }) => db.insert("notes", { text }));

      const note = yield* c.query(api.functions.onlyFirst, {});

      expect(note).toMatchObject({ _tag: "Some", value: { text } });
    }));

  test("when zero notes exist", () =>
    Effect.gen(function* () {
      const c = yield* TestConvexService;

      const note = yield* c.query(api.functions.onlyFirst, {});

      expect(note).toEqual({ _tag: "None" });
    }));
});

test("stream", () =>
  Effect.gen(function* () {
    const c = yield* TestConvexService;

    const notesText = ["Note 1", "Note 2"];

    yield* c.run(({ db }) =>
      Promise.all(Array.map(notesText, (text) => db.insert("notes", { text }))),
    );

    const notes = yield* c.query(api.functions.mapTextStream, {});

    expect(notes).toEqual(notesText);
  }));

test("search", () =>
  Effect.gen(function* () {
    const c = yield* TestConvexService;

    const text = "Hello, world!";

    yield* c.run(({ db }) =>
      Promise.all([
        db.insert("notes", {
          text,
          tag: "greeting",
        }),
        db.insert("notes", {
          text: "Mexican burrito recipe",
          tag: "recipe",
        }),
      ]),
    );

    const notes = yield* c.query(api.functions.search, {
      query: "Hello",
      tag: "greeting",
    });

    expect(notes.length).toEqual(1);
    expect(notes[0]).toEqual(text);
  }));

test("patch", () =>
  Effect.gen(function* () {
    const c = yield* TestConvexService;

    const originalText = "Hello, Mars!";

    const noteId = yield* c.run(({ db }) =>
      db.insert("notes", { text: originalText }),
    );

    const originalNote = yield* c.run(({ db }) => db.get(noteId));

    expect(originalNote?.text).toEqual(originalText);

    const updatedText = "Hello, world!";

    yield* c.mutation(api.functions.patch, {
      noteId,
      fields: { text: updatedText },
    });

    const updatedNote = yield* c.run(({ db }) => db.get(noteId));

    expect(updatedNote?.text).toEqual(updatedText);
  }));

test("validation", () =>
  Effect.gen(function* () {
    const c = yield* TestConvexService;

    const tooLongText = String.repeat(101)("a");

    const exit = yield* c
      .mutation(api.functions.insertTooLongText, {
        text: tooLongText,
      })
      .pipe(Effect.exit);

    expect(Exit.isFailure(exit)).toBe(true);
  }));

describe("patch", () => {
  test("invalid patch", () =>
    Effect.gen(function* () {
      const c = yield* TestConvexService;

      const noteId = yield* c.run(({ db }) =>
        db.insert("notes", { text: "Hello, world!" }),
      );

      const tooLongText = String.repeat(101)("a");

      const exit = yield* c
        .mutation(api.functions.patch, {
          noteId,
          fields: {
            text: tooLongText,
          },
        })
        .pipe(Effect.exit);

      expect(Exit.isFailure(exit)).toBe(true);
    }));

  test("valid patch", () =>
    Effect.gen(function* () {
      const c = yield* TestConvexService;

      const noteId = yield* c.run(({ db }) =>
        db.insert("notes", { text: "Hello, world!" }),
      );

      const author = { role: "user", name: "Joe" } as const;

      yield* c.mutation(api.functions.patch, {
        noteId,
        fields: { author },
      });

      const patchedNote = yield* c.run(({ db }) => db.get(noteId));

      expect(patchedNote?.author).toMatchObject(author);
    }));

  test("deleted doc", () =>
    Effect.gen(function* () {
      const c = yield* TestConvexService;

      const noteId = yield* c.run(({ db }) =>
        db.insert("notes", { text: "Hello, world!" }),
      );

      yield* c.run(({ db }) => db.delete(noteId));

      const exit = yield* c
        .mutation(api.functions.patch, {
          noteId,
          fields: { text: "Hello, world!" },
        })
        .pipe(Effect.exit);

      expect(Exit.isFailure(exit)).toBe(true);
    }));

  test("unset", () =>
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

      yield* c.mutation(api.functions.unsetAuthorPatch, {
        noteId,
      });

      const patchedNote = yield* c.run(({ db }) => db.get(noteId));

      expect(patchedNote?.author).toEqual(undefined);
      expect(patchedNote?.tag).toEqual(tag);
    }));
});

test("replace", () =>
  Effect.gen(function* () {
    const c = yield* TestConvexService;

    const initialText = "Hello, Earth!";
    const updatedText = "Hello, Mars!";

    const noteId = yield* c.run(({ db }) =>
      db.insert("notes", { text: initialText }),
    );
    const note = yield* c.run(({ db }) => db.get(noteId));

    const updatedNoteFields = { ...note, text: updatedText };

    yield* c.mutation(api.functions.replace, {
      noteId,
      fields: updatedNoteFields,
    });

    const replacedNote = yield* c.run(({ db }) => db.get(noteId));

    expect(replacedNote?.text).toEqual(updatedText);
  }));

describe("delete", () => {
  test("doc exists", () =>
    Effect.gen(function* () {
      const c = yield* TestConvexService;

      const noteId = yield* c.run(({ db }) =>
        db.insert("notes", { text: "Hello, world!" }),
      );

      yield* c.mutation(api.functions.deleteNote, {
        noteId,
      });

      const gottenNote = yield* c.run(({ db }) => db.get(noteId));

      expect(gottenNote).toEqual(null);
    }));

  test("doc doesn't exist", () =>
    Effect.gen(function* () {
      const c = yield* TestConvexService;

      const noteId = yield* c.run(({ db }) =>
        db.insert("notes", { text: "Hello, world!" }),
      );

      yield* c.run(({ db }) => db.delete(noteId));

      const exit = yield* c
        .mutation(api.functions.deleteNote, {
          noteId,
        })
        .pipe(Effect.exit);

      expect(Exit.isFailure(exit)).toBe(true);
    }));
});

describe("actions", () => {
  test("vector search", () =>
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
        const notes = yield* c.action(api.functions.executeVectorSearch, {
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
        const notes = yield* c.action(api.functions.executeVectorSearch, {
          vector: [1, 1, 1],
          tag: "Art",
          limit: 10,
        });

        expect(notes).toMatchObject([
          { tag: "Art", text: "convex" },
          { tag: "Art", text: "base" },
        ]);
      }
    }));
});

describe("http", () => {
  describe("/", () => {
    test("user-defined endpoint", () =>
      Effect.gen(function* () {
        const c = yield* TestConvexService;

        const response = yield* c.fetch("/get", { method: "GET" });

        // const jsonBody = yield* Effect.promise(() => response.json());
        const status = response.status;

        expect(status).toEqual(200);
        // expect(jsonBody).toEqual("Hello, world!");
      }));

    test("api docs", () =>
      Effect.gen(function* () {
        const c = yield* TestConvexService;

        const response = yield* c.fetch("/docs", { method: "GET" });

        const status = response.status;

        expect(status).toEqual(200);
      }));
  });

  describe("/path-prefix", () => {
    test("user-defined endpoint", () =>
      Effect.gen(function* () {
        const c = yield* TestConvexService;

        const response = yield* c.fetch("/path-prefix/get", { method: "GET" });

        // const jsonBody = yield* Effect.promise(() => response.json());
        const status = response.status;

        expect(status).toEqual(200);
        // expect(jsonBody).toEqual("Hello, world!");
      }));

    test("api docs", () =>
      Effect.gen(function* () {
        const c = yield* TestConvexService;

        const response = yield* c.fetch("/path-prefix/docs", { method: "GET" });

        const status = response.status;

        expect(status).toEqual(200);
      }));
  });
});

describe("system", () => {
  test("get", () =>
    Effect.gen(function* () {
      const c = yield* TestConvexService;

      const id = yield* c.run(({ storage }) => storage.store(new Blob()));
      const storageDoc = yield* c.query(api.functions.systemGet, {
        id,
      });

      expect(storageDoc).toMatchObject({ _id: id });
    }));

  test("query", () =>
    Effect.gen(function* () {
      const c = yield* TestConvexService;

      const ids = yield* c.run(({ storage }) =>
        Promise.all([storage.store(new Blob()), storage.store(new Blob())]),
      );
      const storageDocs = yield* c.query(api.functions.systemQuery);

      const storageIds = Array.map(storageDocs, ({ _id }) => _id);

      expect(storageDocs.length).toEqual(2);
      expect(Array.sort(Order.string)(storageIds)).toEqual(
        Array.sort(Order.string)(ids),
      );
    }));
});
