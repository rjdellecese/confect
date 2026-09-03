import { type Document, QueryStream } from "@confect/server";
import { assert, describe, expect, expectTypeOf, it } from "@effect/vitest";
import { assertEquals } from "@effect/vitest/utils";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Result from "effect/Result";
import * as Stream from "effect/Stream";
import {
  DatabaseReader,
  DatabaseWriter,
} from "./fixtures/confect/_generated/services";
import * as TestConfect from "./TestConfect";

const collectTexts = <E, R>(
  stream: Stream.Stream<{ text: string }, E, R>,
): Effect.Effect<ReadonlyArray<string>, E, R> =>
  Stream.runCollect(stream).pipe(
    Effect.map((docs) => docs.map((doc) => doc.text)),
  );

const insertNotes = (texts: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;

    yield* Effect.forEach(texts, (text) =>
      writer.table("notes").insert({ text }),
    );
  });

describe("QueryStream", () => {
  it.effect("emits documents in index order", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      yield* c.run(
        Effect.gen(function* () {
          yield* insertNotes(["banana", "apple", "cherry"]);

          const reader = yield* DatabaseReader;

          const ascending = yield* collectTexts(
            reader.table("notes").stream("by_text"),
          );
          expect(ascending).toEqual(["apple", "banana", "cherry"]);

          const descending = yield* collectTexts(
            reader.table("notes").stream("by_text", "desc"),
          );
          expect(descending).toEqual(["cherry", "banana", "apple"]);
        }),
      );
    }).pipe(Effect.provide(TestConfect.layer)),
  );

  it.effect("is a reusable description backed by leaf reflection", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      yield* c.run(
        Effect.gen(function* () {
          yield* insertNotes(["banana", "apple"]);

          const reader = yield* DatabaseReader;

          const stream = reader
            .table("notes")
            .stream("by_text", (q) => q.gte("text", "a"));

          // The leaf stores the query recipe, not a (one-shot) Convex
          // query object…
          expect(stream.reflection?.tableName).toBe("notes");
          expect(stream.reflection?.indexName).toBe("by_text");
          expect(stream.reflection?.indexFields).toEqual([
            "text",
            "_creationTime",
          ]);
          expect(stream.reflection?.spec.eqCount).toBe(0);
          expect(stream.reflection?.spec.ops).toEqual([
            { _tag: "gte", field: "text", value: "a" },
          ]);

          // …so one stream value can be run any number of times.
          const first = yield* collectTexts(stream);
          const second = yield* collectTexts(stream);
          expect(first).toEqual(["apple", "banana"]);
          expect(second).toEqual(first);
        }),
      );
    }).pipe(Effect.provide(TestConfect.layer)),
  );

  it.effect("supports plain Stream combinators", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      yield* c.run(
        Effect.gen(function* () {
          yield* insertNotes(["banana", "apple", "cherry"]);

          const reader = yield* DatabaseReader;

          const firstTwo = yield* reader
            .table("notes")
            .stream("by_text")
            .pipe(
              Stream.map((note) => note.text),
              Stream.take(2),
              Stream.runCollect,
            );
          expect(firstTwo).toEqual(["apple", "banana"]);
        }),
      );
    }).pipe(Effect.provide(TestConfect.layer)),
  );

  it.effect("applies typed index range bounds", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      yield* c.run(
        Effect.gen(function* () {
          yield* insertNotes(["banana", "apple", "cherry"]);

          const reader = yield* DatabaseReader;

          const fromB = yield* collectTexts(
            reader.table("notes").stream("by_text", (q) => q.gte("text", "b")),
          );
          expect(fromB).toEqual(["banana", "cherry"]);

          const bOnly = yield* collectTexts(
            reader
              .table("notes")
              .stream("by_text", (q) => q.gte("text", "b").lt("text", "c")),
          );
          expect(bOnly).toEqual(["banana"]);

          const exactly = yield* collectTexts(
            reader
              .table("notes")
              .stream("by_text", (q) => q.eq("text", "apple")),
          );
          expect(exactly).toEqual(["apple"]);
        }),
      );
    }).pipe(Effect.provide(TestConfect.layer)),
  );

  it.effect("merge interleaves streams in order-key order", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      yield* c.run(
        Effect.gen(function* () {
          const writer = yield* DatabaseWriter;
          const reader = yield* DatabaseReader;

          // Insertion order fixes `_creationTime` order (convex-test bumps
          // the clock on collisions), so the merged sequence is exactly the
          // alternating insertion order.
          for (const [text, tag] of [
            ["a", "1"],
            ["b", "2"],
            ["a", "3"],
            ["b", "4"],
          ] as const) {
            yield* writer.table("notes").insert({ text, tag });
          }

          const streamFor = (text: string, order: "asc" | "desc") =>
            reader
              .table("notes")
              .stream("by_text", (q) => q.eq("text", text), order);

          const merged = QueryStream.merge([
            streamFor("a", "asc"),
            streamFor("b", "asc"),
          ]);
          const tags = yield* Stream.runCollect(merged).pipe(
            Effect.map((docs) => docs.map((doc) => doc.tag)),
          );
          expect(tags).toEqual(["1", "2", "3", "4"]);

          const mergedDesc = QueryStream.merge([
            streamFor("a", "desc"),
            streamFor("b", "desc"),
          ]);
          const tagsDesc = yield* Stream.runCollect(mergedDesc).pipe(
            Effect.map((docs) => docs.map((doc) => doc.tag)),
          );
          expect(tagsDesc).toEqual(["4", "3", "2", "1"]);
        }),
      );
    }).pipe(Effect.provide(TestConfect.layer)),
  );

  it.effect("filterEffect filters with an effectful predicate", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      yield* c.run(
        Effect.gen(function* () {
          yield* insertNotes(["banana", "apple", "cherry"]);

          const reader = yield* DatabaseReader;

          const filtered = yield* collectTexts(
            reader
              .table("notes")
              .stream("by_text")
              .pipe(
                QueryStream.filterEffect((note) =>
                  Effect.succeed(note.text !== "banana"),
                ),
              ),
          );
          expect(filtered).toEqual(["apple", "cherry"]);
        }),
      );
    }).pipe(Effect.provide(TestConfect.layer)),
  );

  it.effect("paginates a merged, filtered stream with cursors", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      yield* c.run(
        Effect.gen(function* () {
          const writer = yield* DatabaseWriter;
          const reader = yield* DatabaseReader;

          for (const [text, tag] of [
            ["a", "1"],
            ["b", "2"],
            ["a", "3"],
            ["b", "4"],
            ["a", "5"],
            ["b", "6"],
          ] as const) {
            yield* writer.table("notes").insert({ text, tag });
          }

          // One stream value serves every page: a QueryStream is a
          // description, and leaves rebuild their (one-shot) Convex query
          // from stored reflection data on each run.
          const composed = QueryStream.merge([
            reader.table("notes").stream("by_text", (q) => q.eq("text", "a")),
            reader.table("notes").stream("by_text", (q) => q.eq("text", "b")),
          ]).pipe(
            QueryStream.filterEffect((note) =>
              Effect.succeed(note.tag !== "3"),
            ),
          );

          const tagsOf = (page: ReadonlyArray<{ tag?: string }>) =>
            page.map((doc) => doc.tag);

          const page1 = yield* QueryStream.paginate(composed, {
            numItems: 2,
            cursor: null,
          });
          expect(tagsOf(page1.page)).toEqual(["1", "2"]);
          assertEquals(page1.isDone, false);

          // The second page starts after the first page's cursor and skips
          // the filtered-out element (which still advanced the cursor).
          const page2 = yield* QueryStream.paginate(composed, {
            numItems: 2,
            cursor: page1.continueCursor,
          });
          expect(tagsOf(page2.page)).toEqual(["4", "5"]);
          assertEquals(page2.isDone, false);

          const page3 = yield* QueryStream.paginate(composed, {
            numItems: 2,
            cursor: page2.continueCursor,
          });
          expect(tagsOf(page3.page)).toEqual(["6"]);
          assertEquals(page3.isDone, true);
          assertEquals(page3.continueCursor, QueryStream.END_CURSOR);
        }),
      );
    }).pipe(Effect.provide(TestConfect.layer)),
  );

  it.effect("paginate honors endCursor for gap-free adjacent pages", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      yield* c.run(
        Effect.gen(function* () {
          yield* insertNotes(["a", "b", "c", "d"]);

          const reader = yield* DatabaseReader;
          const stream = reader.table("notes").stream("by_text");

          const page1 = yield* QueryStream.paginate(stream, {
            numItems: 2,
            cursor: null,
          });
          expect(page1.page.map((doc) => doc.text)).toEqual(["a", "b"]);

          // Re-request the same page pinned to its end cursor: `numItems`
          // is ignored and the page runs exactly to the pinned endpoint —
          // the range-defined page the reactive pagination articles call
          // for.
          const pinned = yield* QueryStream.paginate(stream, {
            numItems: 1,
            cursor: null,
            endCursor: page1.continueCursor,
          });
          expect(pinned.page.map((doc) => doc.text)).toEqual(["a", "b"]);
          assertEquals(pinned.isDone, false);
          assertEquals(pinned.continueCursor, page1.continueCursor);
        }),
      );
    }).pipe(Effect.provide(TestConfect.layer)),
  );

  it.effect("paginate reports SplitRequired when maximumRowsRead is hit", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      yield* c.run(
        Effect.gen(function* () {
          yield* insertNotes(["a", "b", "c", "d"]);

          const reader = yield* DatabaseReader;

          const result = yield* QueryStream.paginate(
            reader
              .table("notes")
              .stream("by_text")
              .pipe(QueryStream.filterEffect(() => Effect.succeed(false))),
            { numItems: 3, cursor: null, maximumRowsRead: 2 },
          );

          assertEquals(result.page.length, 0);
          assertEquals(result.isDone, false);
          assertEquals(result.pageStatus, "SplitRequired");
          expect(result.splitCursor).toBeDefined();
        }),
      );
    }).pipe(Effect.provide(TestConfect.layer)),
  );

  it.effect("fails with the InvalidCursor signal on a malformed cursor", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      yield* c.run(
        Effect.gen(function* () {
          yield* insertNotes(["a"]);

          const reader = yield* DatabaseReader;
          const stream = reader.table("notes").stream("by_text");

          const fromCursor = (cursor: string) =>
            QueryStream.paginate(stream, { numItems: 1, cursor }).pipe(
              Effect.catchDefect((defect) => Effect.succeed(defect)),
            );

          // Malformed JSON, and a stale cursor with the wrong key arity
          // (`by_text` keys have three components: text, _creationTime,
          // _id).
          for (const cursor of ["_notjson", "[1, 2]"]) {
            const defect = yield* fromCursor(cursor);
            assert(Predicate.hasProperty(defect, "data"));
            expect(
              (defect.data as { paginationError?: string }).paginationError,
            ).toBe("InvalidCursor");
          }
        }),
      );
    }).pipe(Effect.provide(TestConfect.layer)),
  );

  it.effect("filter and map keep the stream paginable", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      yield* c.run(
        Effect.gen(function* () {
          yield* insertNotes(["a", "b", "c", "d"]);

          const reader = yield* DatabaseReader;

          const shouted = reader
            .table("notes")
            .stream("by_text")
            .pipe(
              QueryStream.filter((note) => note.text !== "b"),
              QueryStream.map((note) => note.text.toUpperCase()),
            );

          const page1 = yield* QueryStream.paginate(shouted, {
            numItems: 2,
            cursor: null,
          });
          expect(page1.page).toEqual(["A", "C"]);

          // The filtered-out "b" still advanced the cursor.
          const page2 = yield* QueryStream.paginate(shouted, {
            numItems: 2,
            cursor: page1.continueCursor,
          });
          expect(page2.page).toEqual(["D"]);
          assertEquals(page2.isDone, true);
        }),
      );
    }).pipe(Effect.provide(TestConfect.layer)),
  );

  it.effect("unique succeeds on zero or one and fails on two", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect;

      yield* c.run(
        Effect.gen(function* () {
          yield* insertNotes(["apple", "banana", "banana"]);

          const reader = yield* DatabaseReader;
          const byText = (text: string) =>
            reader.table("notes").stream("by_text", (q) => q.eq("text", text));

          const none = yield* QueryStream.unique(byText("missing"));
          assertEquals(Option.isNone(none), true);

          const one = yield* QueryStream.unique(byText("apple"));
          assertEquals(
            Option.map(one, (doc) => doc.text),
            Option.some("apple"),
          );

          const two = yield* Effect.result(
            QueryStream.unique(byText("banana")),
          );
          assertEquals(
            Result.match(two, {
              onFailure: (error) => error._tag,
              onSuccess: () => "unexpected success",
            }),
            "NotUniqueError",
          );
        }),
      );
    }).pipe(Effect.provide(TestConfect.layer)),
  );
});

describe("QueryStream types", () => {
  type KeyOf<S> =
    S extends QueryStream.QueryStream<
      any,
      infer K extends ReadonlyArray<string>,
      any,
      any
    >
      ? K
      : never;

  class SomeService extends Context.Service<
    SomeService,
    { readonly check: (text: string) => Effect.Effect<boolean> }
  >()("@confect/server/test/mock-backend/queryStream.test/SomeService") {}

  it("infers the remaining order key from eq pinning", () => {
    const _typeChecks = Effect.gen(function* () {
      const reader = yield* DatabaseReader;

      const full = reader.table("notes").stream("by_text");
      expectTypeOf<KeyOf<typeof full>>().toEqualTypeOf<
        ["text", "_creationTime"]
      >();

      const pinned = reader
        .table("notes")
        .stream("by_text", (q) => q.eq("text", "x"));
      expectTypeOf<KeyOf<typeof pinned>>().toEqualTypeOf<["_creationTime"]>();

      // Bounded fields still vary, so they are not consumed.
      const bounded = reader
        .table("notes")
        .stream("by_text", (q) => q.gte("text", "a"));
      expectTypeOf<KeyOf<typeof bounded>>().toEqualTypeOf<
        ["text", "_creationTime"]
      >();

      const byCreationTime = reader.table("notes").stream("by_creation_time");
      expectTypeOf<KeyOf<typeof byCreationTime>>().toEqualTypeOf<
        ["_creationTime"]
      >();

      // A QueryStream is a genuine Stream…
      const asStream: Stream.Stream<
        { text: string },
        Document.DocumentDecodeError
      > = pinned;
      void asStream;

      // …and generic Stream combinators degrade it to a plain Stream.
      const degraded = Stream.map(pinned, (note) => note.text);
      expectTypeOf<typeof degraded>().toEqualTypeOf<
        Stream.Stream<string, Document.DocumentDecodeError>
      >();

      // Streams pinned the same way merge; the pinned values may differ.
      const mergedPinned = QueryStream.merge([pinned, pinned]);
      void mergedPinned;
      // Streams over the same index remain mergeable with
      // `by_creation_time` streams: both are ordered by the same remaining
      // key.
      const mergedAcrossIndexes = QueryStream.merge([pinned, byCreationTime]);
      void mergedAcrossIndexes;

      // @ts-expect-error — order keys differ: ["text", "_creationTime"]
      const mergedMismatched = QueryStream.merge([pinned, full]);
      void mergedMismatched;

      const wrongField = reader
        .table("notes")
        // @ts-expect-error — `eq` must target the next index field.
        .stream("by_text", (q) => q.eq("tag", "x"));
      void wrongField;

      const wrongValue = reader
        .table("notes")
        // @ts-expect-error — the value must match the field's type.
        .stream("by_text", (q) => q.eq("text", 42));
      void wrongValue;

      const afterBound = reader.table("notes").stream("by_text", (q) => {
        const lowerBounded = q.gte("text", "a");
        // @ts-expect-error — after a lower bound, `eq` is gone.
        void lowerBounded.eq;
        return lowerBounded;
      });
      void afterBound;

      // Pure `filter`/`map` keep the order key and leave E/R untouched.
      const pureFiltered = QueryStream.filter(
        pinned,
        (note) => note.text !== "",
      );
      expectTypeOf<KeyOf<typeof pureFiltered>>().toEqualTypeOf<
        ["_creationTime"]
      >();
      const pureMapped = QueryStream.map(pinned, (note) => note.text);
      expectTypeOf<typeof pureMapped>().toEqualTypeOf<
        QueryStream.QueryStream<
          string,
          ["_creationTime"],
          Document.DocumentDecodeError
        >
      >();

      // The predicate's error and requirement channels surface in the
      // stream's channels.
      const filtered = QueryStream.filterEffect(pinned, (note) =>
        Effect.flatMap(SomeService, (service) => service.check(note.text)),
      );
      expectTypeOf<
        typeof filtered extends QueryStream.QueryStream<any, any, any, infer R>
          ? R
          : never
      >().toEqualTypeOf<SomeService>();
    });
    void _typeChecks;
  });
});
