import { assert, describe, expect, expectTypeOf, it } from "@effect/vitest";
import { assertEquals } from "@effect/vitest/utils";
import { FunctionSpec } from "@confect/core";
import * as FunctionRegistryItem from "@confect/server/FunctionRegistryItem";
import * as RegisteredConvexFunction from "@confect/server/RegisteredConvexFunction";
import { RegisteredNodeFunction } from "@confect/server/node";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import * as Console from "effect/Console";
import * as TestConsole from "effect/testing/TestConsole";
import { vi } from "vitest";
import confectSchema from "./fixtures/confect/_generated/schema";
import convexSchema from "./fixtures/confect/_generated/convexSchema";
import type * as CompilerOptions from "confect-test-types/CompilerOptions";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as SchemaParser from "effect/SchemaParser";
import * as SchemaCompiler from "effect/unstable/schema/SchemaCompiler";
import * as Stream from "effect/Stream";
import * as Option from "effect/Option";
import * as DatabaseReader_ from "@confect/server/DatabaseReader";
import * as DatabaseWriter_ from "@confect/server/DatabaseWriter";
import * as DatabaseSchema from "@confect/server/DatabaseSchema";
import * as QueryStream from "@confect/server/QueryStream";
import * as Table from "@confect/server/Table";
import refs from "./fixtures/confect/_generated/refs";
import {
  DatabaseWriter,
  MutationCtx,
} from "./fixtures/confect/_generated/services";
import { Id } from "./fixtures/confect/_generated/id";
import type notes from "./fixtures/confect/_generated/tables/notes";
import { PaginationDenied } from "./fixtures/confect/databaseReader.spec";
import {
  Forbidden,
  NotFound,
} from "./fixtures/confect/groups/typedErrors.spec";
import { NodeNotFound } from "./fixtures/confect/typedErrorsNode.spec";
import * as TestConfect from "./TestConfect";

describe("function logging", () => {
  const cases = [
    {
      name: "query",
      spec: FunctionSpec.publicQuery({
        name: "run",
        returns: () => Schema.Null,
      }),
      register: RegisteredConvexFunction.make,
      invoke: (t: ReturnType<typeof convexTest>) =>
        t.query(makeFunctionReference<"query">("logging:run"), {}),
    },
    {
      name: "mutation",
      spec: FunctionSpec.publicMutation({
        name: "run",
        returns: () => Schema.Null,
      }),
      register: RegisteredConvexFunction.make,
      invoke: (t: ReturnType<typeof convexTest>) =>
        t.mutation(makeFunctionReference<"mutation">("logging:run"), {}),
    },
    {
      name: "action",
      spec: FunctionSpec.publicAction({
        name: "run",
        returns: () => Schema.Null,
      }),
      register: RegisteredConvexFunction.make,
      invoke: (t: ReturnType<typeof convexTest>) =>
        t.action(makeFunctionReference<"action">("logging:run"), {}),
    },
    {
      name: "Node action",
      spec: FunctionSpec.publicNodeAction({
        name: "run",
        returns: () => Schema.Null,
      }),
      register: RegisteredNodeFunction.make,
      invoke: (t: ReturnType<typeof convexTest>) =>
        t.action(makeFunctionReference<"action">("logging:run"), {}),
    },
  ];

  for (const { name, spec, register, invoke } of cases) {
    it.effect(`installs the default logger for a registered ${name}`, () =>
      Effect.gen(function* () {
        const console = {
          ...(yield* TestConsole.make),
          warn: vi.fn(),
          log: vi.fn(),
        };
        const item = FunctionRegistryItem.make({
          functionSpec: spec,
          groupMiddlewareAttachments: [],
          handler: () =>
            Effect.logWarning(name).pipe(
              Effect.as(null),
              Effect.provideService(Console.Console, console),
            ),
        });
        assert(item._tag === "Confect");
        const registered = register(confectSchema, item);
        const t = convexTest(convexSchema, {
          ...import.meta.glob("./fixtures/convex/_generated/*.js"),
          "./fixtures/convex/logging.ts": () =>
            Promise.resolve({ run: registered }),
        });
        expect(yield* Effect.promise(() => invoke(t))).toBeNull();
        expect(console.warn).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ level: "WARN", message: name }),
        );
        expect(console.log).not.toHaveBeenCalled();
      }),
    );
  }
});

describe("DatabaseReader", () => {
  it.effect("uses the canonical Doc decoder across database read paths", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      yield* c.run(
        Effect.gen(function* () {
          const ctx = yield* MutationCtx;
          const id = yield* Effect.promise(() =>
            ctx.db.insert("notes", { text: "hello" }),
          );
          let evaluations = 0;
          const table = Table.make(() => {
            evaluations++;
            return Schema.Struct({ text: Schema.String });
          })
            .index("by_text", ["text"])
            .searchIndex("text", { searchField: "text" })("notes");
          const schema = DatabaseSchema.make({ notes: table });
          const reader = DatabaseReader_.make<typeof schema>(
            schema,
            ctx.db,
          ).table("notes");
          const writer = DatabaseWriter_.make<typeof schema>(
            schema,
            ctx.db,
          ).table("notes");
          const get = reader.get(id);
          const getByIndex = reader.get("by_text", "hello");
          const first = reader.index("by_text").first();
          const take = reader.index("by_text").take(1);
          const collect = reader.index("by_text").collect();
          const orderedStream = reader.index("by_text").stream();
          const paginate = reader
            .index("by_text")
            .paginate({ numItems: 1, cursor: null });
          const search = reader.search("text", (q) =>
            q.search("text", "hello"),
          );
          const stream = reader.stream("by_text");

          expect(evaluations).toBe(0);

          const encoded = yield* Effect.promise(() => ctx.db.get(id));
          const doc = table.Doc;
          const interpreted = SchemaParser.decodeUnknownEffect(doc);
          yield* interpreted(encoded);
          let calls = 0;
          SchemaCompiler.set(doc.ast, {
            decodeEffect: (input, options) => {
              calls++;
              return interpreted(input, options);
            },
          });

          expect(yield* get).toEqual(encoded);
          expect(yield* getByIndex).toEqual(encoded);
          expect(yield* first).toEqual(Option.some(encoded));
          expect(yield* take).toEqual([encoded]);
          expect(yield* collect).toEqual([encoded]);
          expect(yield* Stream.runCollect(orderedStream)).toEqual([encoded]);
          expect((yield* paginate).page).toEqual([encoded]);
          expect(yield* search.collect()).toEqual([encoded]);
          expect(yield* Stream.runCollect(stream)).toEqual([encoded]);
          expect(
            (yield* QueryStream.paginate(stream, { numItems: 1, cursor: null }))
              .page,
          ).toEqual([encoded]);
          expect(calls).toBe(10);

          yield* writer.patch(id, { text: "patched" });
          expect(calls).toBe(11);
          expect(evaluations).toBe(1);
          expect(table.Doc).toBe(doc);
          expect(encoded?.text).toBe("hello");
          expect((yield* Effect.promise(() => ctx.db.get(id)))?.text).toBe(
            "patched",
          );
        }),
      );
    }).pipe(Effect.provide(TestConfect.layer)),
  );

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
        Id("notes"),
      );

      const retrievedText = yield* c
        .query(refs.public.databaseReader.getNote, { noteId: noteId })
        .pipe(Effect.map((note) => note.text));

      assertEquals(retrievedText, text);
    }).pipe(Effect.provide(TestConfect.layer)),
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
    }).pipe(Effect.provide(TestConfect.layer)),
  );
});

describe("DatabaseWriter", () => {
  it.effect("patch unsets optional fields set to undefined", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      const noteId = yield* c.run(
        Effect.gen(function* () {
          const writer = yield* DatabaseWriter;

          const id = yield* writer
            .table("notes")
            .insert({ text: "original", tag: "draft" });

          yield* writer
            .table("notes")
            .patch(id, { text: "patched", tag: undefined });

          return id;
        }),
        Id("notes"),
      );

      const note = yield* c.query(refs.public.databaseReader.getNote, {
        noteId,
      });

      assertEquals(note.text, "patched");
      assert.isFalse(Object.hasOwn(note, "tag"));
    }).pipe(Effect.provide(TestConfect.layer)),
  );

  it("patch accepts undefined according to field types and compiler optionality", () => {
    const patchNote = (writer: DatabaseWriter) => writer.table("notes").patch;
    type Patch = Parameters<ReturnType<typeof patchNote>>[1];

    expectTypeOf<{ tag: undefined }>().toExtend<Patch>();
    expectTypeOf<{ author: undefined }>().toExtend<Patch>();
    expectTypeOf<
      { text: undefined } extends Patch ? true : false
    >().toEqualTypeOf<CompilerOptions.AllowsExplicitUndefined>();
    expectTypeOf<{ text: string }>().toExtend<Patch>();
  });
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
      expectTypeOf(note).toEqualTypeOf<(typeof notes.Doc)["Type"]>();
      assertEquals(note.text, text);
    }).pipe(Effect.provide(TestConfect.layer)),
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
    }).pipe(Effect.provide(TestConfect.layer)),
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
    }).pipe(Effect.provide(TestConfect.layer)),
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
        paginationOpts: { cursor: null, numItems: 3 },
      });

      assertEquals(result.page.length, 3);
      assertEquals(result.isDone, false);

      const result2 = yield* c.query(refs.public.databaseReader.paginateNotes, {
        paginationOpts: { cursor: result.continueCursor, numItems: 3 },
      });

      assertEquals(result2.page.length, 2);
      assertEquals(result2.isDone, true);
    }).pipe(Effect.provide(TestConfect.layer)),
  );

  it.effect("accepts the protocol fields Convex's client sends", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      yield* c.run(
        Effect.gen(function* () {
          const writer = yield* DatabaseWriter;

          yield* Effect.forEach(Array.range(1, 3), (i) =>
            writer.table("notes").insert({ text: `note ${i}` }),
          );
        }),
      );

      // `usePaginatedQuery` from `convex/react` always includes `id`; the
      // composed args schema must accept it (and the other optional protocol
      // fields) for real requests to pass validation.
      const result = yield* c.query(refs.public.databaseReader.paginateNotes, {
        paginationOpts: { cursor: null, numItems: 10, id: 1 },
      });

      assertEquals(result.page.length, 3);
      assertEquals(result.isDone, true);
    }).pipe(Effect.provide(TestConfect.layer)),
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
        { paginationOpts: { cursor: null, numItems: 10 }, tag: "important" },
      );

      assertEquals(result.page.length, 3);
      assertEquals(result.isDone, true);

      const texts = new Set(result.page.map((n) => n.text));
      assertEquals(texts.has("a"), true);
      assertEquals(texts.has("c"), true);
      assertEquals(texts.has("e"), true);
    }).pipe(Effect.provide(TestConfect.layer)),
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
        { paginationOpts: { cursor: null, numItems: 10 }, tag: "important" },
      );

      assertEquals(result.page.length, 0);
      assertEquals(result.isDone, true);
    }).pipe(Effect.provide(TestConfect.layer)),
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
        { paginationOpts: { cursor: null, numItems: 2 }, tag: "even" },
      );

      assertEquals(page1.page.length, 2);

      for (const note of page1.page) {
        assertEquals(note.tag, "even");
      }
    }).pipe(Effect.provide(TestConfect.layer)),
  );

  it.effect("surfaces the declared typed error", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      const failure = yield* c
        .query(refs.public.databaseReader.paginateNotesOrFail, {
          paginationOpts: { cursor: null, numItems: 3 },
          shouldFail: true,
        })
        .pipe(Effect.result, Effect.map(expectFailure));

      assert(Schema.is(PaginationDenied)(failure));
      assertEquals(failure.reason, "denied");

      const result = yield* c.query(
        refs.public.databaseReader.paginateNotesOrFail,
        {
          paginationOpts: { cursor: null, numItems: 3 },
          shouldFail: false,
        },
      );

      assertEquals(result.page.length, 0);
      assertEquals(result.isDone, true);
    }).pipe(Effect.provide(TestConfect.layer)),
  );
});

const expectFailure = <A, E>(result: Result.Result<A, E>): E => {
  assert(Result.isFailure(result));
  return result.failure;
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
    Id("notes"),
  );
}).pipe(Effect.orDie);

describe("typed errors", () => {
  describe("server-side encoding", () => {
    it.effect("query handler typed error surfaces as the typed error", () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;
        const missingId = yield* insertAndDeleteNote;

        const result = yield* Effect.result(
          c.query(refs.public.groups.typedErrors.getNoteOrFail, {
            noteId: missingId,
          }),
        );

        const error = expectFailure(result);
        assert(Schema.is(NotFound)(error));
        expect(error.id).toBe(missingId);
      }).pipe(Effect.provide(TestConfect.layer)),
    );

    it.effect(
      "mutation handler typed error (NotFound) surfaces as the typed error",
      () =>
        Effect.gen(function* () {
          const c = yield* TestConfect.TestConfect;
          const missingId = yield* insertAndDeleteNote;

          const result = yield* Effect.result(
            c.mutation(refs.public.groups.typedErrors.deleteNoteOrFail, {
              noteId: missingId,
              asAdmin: true,
            }),
          );

          const error = expectFailure(result);
          assert(Schema.is(NotFound)(error));
          expect(error.id).toBe(missingId);
        }).pipe(Effect.provide(TestConfect.layer)),
    );

    it.effect(
      "mutation handler typed error (Forbidden) surfaces as the typed error",
      () =>
        Effect.gen(function* () {
          const c = yield* TestConfect.TestConfect;
          const missingId = yield* insertAndDeleteNote;

          const result = yield* Effect.result(
            c.mutation(refs.public.groups.typedErrors.deleteNoteOrFail, {
              noteId: missingId,
              asAdmin: false,
            }),
          );

          const error = expectFailure(result);
          assert(Schema.is(Forbidden)(error));
          expect(error.reason).toBe("admin required");
        }).pipe(Effect.provide(TestConfect.layer)),
    );

    it.effect("action handler typed error surfaces as the typed error", () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;

        const result = yield* Effect.result(
          c.action(refs.public.groups.typedErrors.failingAction, {
            kind: "forbidden",
          }),
        );

        const error = expectFailure(result);
        assert(Schema.is(Forbidden)(error));
        expect(error.reason).toBe("no access");
      }).pipe(Effect.provide(TestConfect.layer)),
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
      }).pipe(Effect.provide(TestConfect.layer)),
    );

    it.effect("QueryRunner Ok path: returns the decoded note text", () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;

        const noteId = yield* c.run(
          Effect.gen(function* () {
            const writer = yield* DatabaseWriter;
            return yield* writer.table("notes").insert({ text: "hello" });
          }),
          Id("notes"),
        );

        const result = yield* c.query(
          refs.public.groups.typedErrors.tryGetNote,
          { noteId },
        );

        expect(result).toStrictEqual({ _tag: "Ok", text: "hello" });
      }).pipe(Effect.provide(TestConfect.layer)),
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
      }).pipe(Effect.provide(TestConfect.layer)),
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
      }).pipe(Effect.provide(TestConfect.layer)),
    );

    it.effect("MutationRunner Ok path: deletes the existing note", () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;

        const noteId = yield* c.run(
          Effect.gen(function* () {
            const writer = yield* DatabaseWriter;
            return yield* writer.table("notes").insert({ text: "to delete" });
          }),
          Id("notes"),
        );

        const result = yield* c.action(
          refs.public.groups.typedErrors.tryDeleteNote,
          { noteId, asAdmin: true },
        );

        expect(result).toStrictEqual({ _tag: "Ok" });

        const remaining = yield* c.query(refs.public.databaseReader.listNotes);
        assertEquals(remaining.length, 0);
      }).pipe(Effect.provide(TestConfect.layer)),
    );

    it.effect("ActionRunner decodes NotFound to tagged result", () =>
      Effect.gen(function* () {
        const c = yield* TestConfect.TestConfect;

        const result = yield* c.action(
          refs.public.groups.typedErrors.tryFailingAction,
          { kind: "notFound" },
        );

        expect(result).toStrictEqual({ _tag: "NotFound", id: "missing" });
      }).pipe(Effect.provide(TestConfect.layer)),
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
      }).pipe(Effect.provide(TestConfect.layer)),
    );
  });

  describe("round-trip identity", () => {
    it.effect(
      "decoded error data round-trips into the original TaggedError class",
      () =>
        Effect.gen(function* () {
          const c = yield* TestConfect.TestConfect;
          const missingId = yield* insertAndDeleteNote;

          const queryResult = yield* Effect.result(
            c.query(refs.public.groups.typedErrors.getNoteOrFail, {
              noteId: missingId,
            }),
          );
          const notFound = expectFailure(queryResult);
          assert(Schema.is(NotFound)(notFound));
          expect(notFound.id).toBe(missingId);

          const mutationResult = yield* Effect.result(
            c.mutation(refs.public.groups.typedErrors.deleteNoteOrFail, {
              noteId: missingId,
              asAdmin: false,
            }),
          );
          const forbidden = expectFailure(mutationResult);
          assert(Schema.is(Forbidden)(forbidden));
          expect(forbidden.reason).toBe("admin required");
        }).pipe(Effect.provide(TestConfect.layer)),
    );
  });

  describe("mutation rollback", () => {
    it.effect(
      "throwing typed error from a mutation rolls back inserted rows",
      () =>
        Effect.gen(function* () {
          const c = yield* TestConfect.TestConfect;

          const result = yield* Effect.result(
            c.mutation(refs.public.groups.typedErrors.insertThenFail, {
              text: "should not persist",
            }),
          );

          const error = expectFailure(result);
          assert(Schema.is(NotFound)(error));
          expect(error.id).toBe("rolled-back");

          const notes = yield* c.query(refs.public.databaseReader.listNotes);
          assertEquals(notes.length, 0);
        }).pipe(Effect.provide(TestConfect.layer)),
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
        }).pipe(Effect.provide(TestConfect.layer)),
    );
  });

  describe("node action", () => {
    it.effect(
      "typed error from a publicNodeAction surfaces as the typed error",
      () =>
        Effect.gen(function* () {
          const c = yield* TestConfect.TestConfect;

          const result = yield* Effect.result(
            c.action(refs.public.typedErrorsNode.failingNodeAction, {
              id: "abc",
            }),
          );

          const error = expectFailure(result);
          assert(Schema.is(NodeNotFound)(error));
          expect(error.id).toBe("abc");
        }).pipe(Effect.provide(TestConfect.layer)),
    );
  });
});
