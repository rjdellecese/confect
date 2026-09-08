import { QueryStream } from "@confect/server";
import { assert, describe, expect, it } from "@effect/vitest";
import { getDocumentSize } from "convex/values";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import {
  DatabaseReader,
  DatabaseWriter,
} from "./fixtures/confect/_generated/services";
import * as TestConfect from "./TestConfect";

const run = <E>(
  body: Effect.Effect<void, E, DatabaseReader | DatabaseWriter>,
) =>
  Effect.gen(function* () {
    const c = yield* TestConfect.TestConfect;
    yield* c.run(body);
  }).pipe(Effect.provide(TestConfect.layer));

const insert = Effect.fnUntraced(function* (
  rows: ReadonlyArray<readonly [text: string, tag: string]>,
) {
  const writer = yield* DatabaseWriter;
  for (const [text, tag] of rows) {
    yield* writer.table("notes").insert({ text, tag });
  }
});

const fixture = Effect.gen(function* () {
  yield* insert([
    ["a", "a1"],
    ["a", "a2"],
    ["a", "a3"],
    ["b", "b1"],
    ["b", "b2"],
    ["c", "c1"],
  ]);
  const reader = yield* DatabaseReader;
  const source = reader.table("notes").stream("by_text");
  const rows = yield* Stream.runCollect(source);
  return { reader, source, rows };
});

const tags = <E, R>(stream: Stream.Stream<{ tag?: string }, E, R>) =>
  Stream.runCollect(stream).pipe(
    Effect.map((rows) => rows.map((row) => row.tag)),
  );

const pageTags = Effect.fnUntraced(function* <
  Doc extends { tag?: string },
  Key extends ReadonlyArray<string>,
  E,
  R,
>(stream: QueryStream.QueryStream<Doc, Key, E, R>, numItems = 1) {
  const pages: Array<Array<string | undefined>> = [];
  let cursor: string | null = null;
  for (let index = 0; index < 20; index++) {
    const result: QueryStream.PaginationResult<Doc> =
      yield* QueryStream.paginate(stream, { numItems, cursor });
    if (result.page.length > 0) {
      pages.push(result.page.map((row) => row.tag));
    }
    if (result.isDone) return pages;
    expect(result.continueCursor).not.toBe(cursor);
    cursor = result.continueCursor;
  }
  return expect.unreachable("Pagination did not finish within 20 pages");
});

describe("QueryStream distinct representatives", () => {
  it.effect(
    "treats an empty prefix as one group and preserves its representative",
    () =>
      run(
        Effect.gen(function* () {
          const { reader, source, rows } = yield* fixture;
          const distinct = source.pipe(QueryStream.distinct([]));
          expect(yield* tags(distinct)).toEqual(["a1"]);
          expect(yield* tags(QueryStream.reverse(distinct))).toEqual(["a1"]);
          expect(
            yield* tags(
              distinct.pipe(QueryStream.reverse, QueryStream.reverse),
            ),
          ).toEqual(["a1"]);
          expect(
            yield* tags(
              source.pipe(QueryStream.reverse, QueryStream.distinct([])),
            ),
          ).toEqual(["c1"]);
          expect(yield* pageTags(distinct)).toEqual([["a1"]]);
          expect(yield* pageTags(QueryStream.reverse(distinct))).toEqual([
            ["a1"],
          ]);

          const a2 = rows.find((row) => row.tag === "a2");
          assert(a2 !== undefined);
          const key = [a2.text, a2._creationTime, a2._id];
          expect(
            yield* tags(
              QueryStream.narrow(distinct, { start: { key, inclusive: true } }),
            ),
          ).toEqual([]);
          expect(
            yield* tags(
              QueryStream.narrow(distinct, { end: { key, inclusive: true } }),
            ),
          ).toEqual(["a1"]);

          const empty = reader
            .table("notes")
            .stream("by_text", (q) => q.gt("text", "z"))
            .pipe(QueryStream.distinct([]));
          expect(yield* tags(empty)).toEqual([]);
          expect(yield* pageTags(QueryStream.reverse(empty))).toEqual([]);
        }),
      ),
  );

  it.effect("reverses representatives without changing their IDs or tags", () =>
    run(
      Effect.gen(function* () {
        const { source } = yield* fixture;
        const distinct = source.pipe(QueryStream.distinct(["text"]));
        const forward = yield* Stream.runCollect(distinct);
        const backward = yield* Stream.runCollect(
          QueryStream.reverse(distinct),
        );
        const twice = yield* Stream.runCollect(
          distinct.pipe(QueryStream.reverse, QueryStream.reverse),
        );

        expect(forward.map((row) => row.tag)).toEqual(["a1", "b1", "c1"]);
        expect(backward.map((row) => row.tag)).toEqual(["c1", "b1", "a1"]);
        expect(backward.map((row) => row._id)).toEqual(
          forward.map((row) => row._id).toReversed(),
        );
        expect(twice).toEqual(forward);
      }),
    ),
  );

  it.effect(
    "selects last representatives only when its input is reversed",
    () =>
      run(
        Effect.gen(function* () {
          const { source } = yield* fixture;
          const last = source.pipe(
            QueryStream.reverse,
            QueryStream.distinct(["text"]),
          );
          expect(yield* tags(last)).toEqual(["c1", "b2", "a3"]);
          expect(yield* tags(QueryStream.reverse(last))).toEqual([
            "a3",
            "b2",
            "c1",
          ]);
        }),
      ),
  );

  it.effect("paginates the same representatives forward and backward", () =>
    run(
      Effect.gen(function* () {
        const { source } = yield* fixture;
        const distinct = source.pipe(QueryStream.distinct(["text"]));
        expect(yield* pageTags(distinct)).toEqual([["a1"], ["b1"], ["c1"]]);
        expect(yield* pageTags(QueryStream.reverse(distinct))).toEqual([
          ["c1"],
          ["b1"],
          ["a1"],
        ]);
        expect(yield* pageTags(distinct, 2)).toEqual([["a1", "b1"], ["c1"]]);
      }),
    ),
  );

  it.effect(
    "keeps a distinct representative after another merge branch ends inside its group",
    () =>
      run(
        Effect.gen(function* () {
          const { source } = yield* fixture;
          const plain = source.pipe(
            QueryStream.filter((row) => row.tag === "a1"),
          );
          const distinct = source.pipe(
            QueryStream.filter((row) => row.tag !== "a1"),
            QueryStream.distinct(["text"]),
          );
          const merged = QueryStream.merge([plain, distinct]);

          expect(yield* pageTags(merged)).toEqual([
            ["a1"],
            ["a2"],
            ["b1"],
            ["c1"],
          ]);
          expect(yield* pageTags(QueryStream.reverse(merged))).toEqual([
            ["c1"],
            ["b1"],
            ["a2"],
            ["a1"],
          ]);
        }),
      ),
  );

  it.effect(
    "narrow filters original representatives rather than selecting a new one",
    () =>
      run(
        Effect.gen(function* () {
          const { source, rows } = yield* fixture;
          const a2 = rows.find((row) => row.tag === "a2");
          const a3 = rows.find((row) => row.tag === "a3");
          assert(a2 !== undefined && a3 !== undefined);
          const key2 = [a2.text, a2._creationTime, a2._id];
          const key3 = [a3.text, a3._creationTime, a3._id];
          const distinct = source.pipe(QueryStream.distinct(["text"]));

          for (const inclusive of [false, true]) {
            expect(
              yield* tags(
                QueryStream.narrow(distinct, {
                  start: { key: key2, inclusive },
                }),
              ),
            ).toEqual(["b1", "c1"]);
            expect(
              yield* tags(
                QueryStream.narrow(distinct, { end: { key: key2, inclusive } }),
              ),
            ).toEqual(["a1"]);
            expect(
              yield* tags(
                QueryStream.narrow(distinct, {
                  start: { key: key2, inclusive },
                  end: { key: key3, inclusive },
                }),
              ),
            ).toEqual([]);
            expect(
              yield* tags(
                QueryStream.narrow(QueryStream.reverse(distinct), {
                  start: { key: key3, inclusive },
                  end: { key: key2, inclusive },
                }),
              ),
            ).toEqual([]);
          }
        }),
      ),
  );

  it.effect(
    "honors inclusive and exclusive bounds on the representative itself",
    () =>
      run(
        Effect.gen(function* () {
          const { source, rows } = yield* fixture;
          const a1 = rows.find((row) => row.tag === "a1");
          assert(a1 !== undefined);
          const key = [a1.text, a1._creationTime, a1._id];
          const distinct = source.pipe(QueryStream.distinct(["text"]));

          expect(
            yield* tags(
              QueryStream.narrow(distinct, { start: { key, inclusive: true } }),
            ),
          ).toEqual(["a1", "b1", "c1"]);
          expect(
            yield* tags(
              QueryStream.narrow(distinct, {
                start: { key, inclusive: false },
              }),
            ),
          ).toEqual(["b1", "c1"]);
          expect(
            yield* tags(
              QueryStream.narrow(distinct, { end: { key, inclusive: true } }),
            ),
          ).toEqual(["a1"]);
          expect(
            yield* tags(
              QueryStream.narrow(distinct, { end: { key, inclusive: false } }),
            ),
          ).toEqual([]);
        }),
      ),
  );

  it.effect(
    "preserves original index bounds and bounds applied before distinct",
    () =>
      run(
        Effect.gen(function* () {
          const { reader, rows } = yield* fixture;
          const a2 = rows.find((row) => row.tag === "a2");
          assert(a2 !== undefined);
          const distinct = reader
            .table("notes")
            .stream("by_text", (q) => q.gte("text", "a").lte("text", "b"))
            .pipe(
              QueryStream.narrow({
                start: {
                  key: [a2.text, a2._creationTime, a2._id],
                  inclusive: true,
                },
              }),
              QueryStream.distinct(["text"]),
            );

          expect(yield* tags(distinct)).toEqual(["a2", "b1"]);
          expect(yield* tags(QueryStream.reverse(distinct))).toEqual([
            "b1",
            "a2",
          ]);
          expect(yield* pageTags(QueryStream.reverse(distinct))).toEqual([
            ["b1"],
            ["a2"],
          ]);
        }),
      ),
  );

  it.effect(
    "preserves pre-filter selection and post-filter exclusion when reversed",
    () =>
      run(
        Effect.gen(function* () {
          const { source } = yield* fixture;
          const selected = source.pipe(
            QueryStream.filterEffect((row) => Effect.succeed(row.tag !== "a1")),
            QueryStream.distinct(["text"]),
          );
          const filtered = selected.pipe(
            QueryStream.filter((row) => row.tag !== "b1"),
          );

          expect(yield* tags(QueryStream.reverse(selected))).toEqual([
            "c1",
            "b1",
            "a2",
          ]);
          expect(yield* tags(filtered)).toEqual(["a2", "c1"]);
          expect(yield* pageTags(QueryStream.reverse(filtered))).toEqual([
            ["c1"],
            ["a2"],
          ]);
        }),
      ),
  );

  it.effect(
    "preserves representatives through nested distinct and renamed keys",
    () =>
      run(
        Effect.gen(function* () {
          const { source } = yield* fixture;
          const nested = source.pipe(
            QueryStream.distinct(["text", "_creationTime"]),
            QueryStream.distinct(["text"]),
            QueryStream.renameKey(["label", "created"]),
            QueryStream.distinct(["label"]),
          );
          expect(yield* tags(nested)).toEqual(["a1", "b1", "c1"]);
          expect(yield* pageTags(QueryStream.reverse(nested))).toEqual([
            ["c1"],
            ["b1"],
            ["a1"],
          ]);
        }),
      ),
  );

  it.effect(
    "preserves distinct outer and inner representatives with onEmpty",
    () =>
      run(
        Effect.gen(function* () {
          const { reader } = yield* fixture;
          yield* insert([
            ["x1", "a"],
            ["x1", "b"],
            ["x2", "none"],
            ["x2", "b"],
          ]);
          const joined = reader
            .table("notes")
            .stream("by_text", (q) => q.gte("text", "x"))
            .pipe(
              QueryStream.distinct(["text"]),
              QueryStream.flatMap(
                (row) =>
                  reader
                    .table("notes")
                    .stream("by_text", (q) =>
                      q.gte("text", row.tag ?? "").lte("text", row.tag ?? ""),
                    )
                    .pipe(QueryStream.distinct(["text"])),
                {
                  innerKey: ["text", "_creationTime"],
                  onEmpty: (row) => ({ tag: `none for ${row.text}` }),
                },
              ),
            );

          expect(yield* tags(joined)).toEqual(["a1", "none for x2"]);
          expect(yield* pageTags(QueryStream.reverse(joined))).toEqual([
            ["none for x2"],
            ["a1"],
          ]);
          expect(
            yield* tags(joined.pipe(QueryStream.reverse, QueryStream.reverse)),
          ).toEqual(["a1", "none for x2"]);
        }),
      ),
  );

  it.effect(
    "reverses distinct over flatMap without selecting the last inner row",
    () =>
      run(
        Effect.gen(function* () {
          const { reader } = yield* fixture;
          yield* insert([
            ["x1", "a"],
            ["x2", "b"],
            ["x3", "none"],
          ]);
          const joined = reader
            .table("notes")
            .stream("by_text", (q) => q.gte("text", "x"))
            .pipe(
              QueryStream.flatMap(
                (row) =>
                  reader
                    .table("notes")
                    .stream("by_text", (q) => q.eq("text", row.tag ?? "")),
                {
                  innerKey: ["_creationTime"],
                  onEmpty: (row) => ({ tag: `none for ${row.text}` }),
                },
              ),
              QueryStream.distinct(["text"]),
              QueryStream.renameKey(["outer", "outerCreated", "innerCreated"]),
            );

          expect(yield* tags(joined)).toEqual(["a1", "b1", "none for x3"]);
          expect(yield* pageTags(QueryStream.reverse(joined))).toEqual([
            ["none for x3"],
            ["b1"],
            ["a1"],
          ]);
        }),
      ),
  );

  it.effect(
    "replays adjacent pinned pages after deleting an original representative",
    () =>
      run(
        Effect.gen(function* () {
          const { source, rows } = yield* fixture;
          const writer = yield* DatabaseWriter;
          const distinct = source.pipe(QueryStream.distinct(["text"]));
          const first = yield* QueryStream.paginate(distinct, {
            numItems: 1,
            cursor: null,
          });
          const second = yield* QueryStream.paginate(distinct, {
            numItems: 1,
            cursor: first.continueCursor,
          });
          const a1 = rows.find((row) => row.tag === "a1");
          assert(a1 !== undefined);
          yield* writer.table("notes").delete(a1._id);

          const firstReplay = yield* QueryStream.paginate(distinct, {
            numItems: 1,
            cursor: null,
            endCursor: first.continueCursor,
          });
          const secondReplay = yield* QueryStream.paginate(distinct, {
            numItems: 1,
            cursor: first.continueCursor,
            endCursor: second.continueCursor,
          });
          expect(firstReplay.page.map((row) => row.tag)).toEqual([]);
          expect(secondReplay.page.map((row) => row.tag)).toEqual(["a2", "b1"]);
          expect(firstReplay.continueCursor).toBe(first.continueCursor);
          expect(secondReplay.continueCursor).toBe(second.continueCursor);
        }),
      ),
  );

  it.effect(
    "replays pinned pages when an earlier indexed row becomes the representative",
    () =>
      run(
        Effect.gen(function* () {
          const writer = yield* DatabaseWriter;
          const earlier = yield* writer
            .table("notes")
            .insert({ text: "0", tag: "earlier" });
          const { reader } = yield* fixture;
          const distinct = reader
            .table("notes")
            .stream("by_text", (q) => q.gte("text", "a"))
            .pipe(QueryStream.distinct(["text"]));
          const first = yield* QueryStream.paginate(distinct, {
            numItems: 1,
            cursor: null,
          });
          const second = yield* QueryStream.paginate(distinct, {
            numItems: 1,
            cursor: first.continueCursor,
          });
          yield* writer.table("notes").patch(earlier, { text: "a" });

          const firstReplay = yield* QueryStream.paginate(distinct, {
            numItems: 1,
            cursor: null,
            endCursor: first.continueCursor,
          });
          const secondReplay = yield* QueryStream.paginate(distinct, {
            numItems: 1,
            cursor: first.continueCursor,
            endCursor: second.continueCursor,
          });
          expect(firstReplay.page.map((row) => row.tag)).toEqual(["earlier"]);
          expect(secondReplay.page.map((row) => row.tag)).toEqual(["b1"]);
          expect(firstReplay.continueCursor).toBe(first.continueCursor);
          expect(secondReplay.continueCursor).toBe(second.continueCursor);
        }),
      ),
  );

  it.effect(
    "replays descending pinned pages after inserting an earlier representative",
    () =>
      run(
        Effect.gen(function* () {
          const { reader } = yield* fixture;
          const writer = yield* DatabaseWriter;
          const distinct = reader
            .table("notes")
            .stream("by_text", "desc")
            .pipe(QueryStream.distinct(["text"]));
          const first = yield* QueryStream.paginate(distinct, {
            numItems: 2,
            cursor: null,
          });
          const second = yield* QueryStream.paginate(distinct, {
            numItems: 1,
            cursor: first.continueCursor,
          });
          expect(first.page.map((row) => row.tag)).toEqual(["c1", "b2"]);
          expect(second.page.map((row) => row.tag)).toEqual(["a3"]);
          yield* writer.table("notes").insert({ text: "b", tag: "b3" });

          const firstReplay = yield* QueryStream.paginate(distinct, {
            numItems: 1,
            cursor: null,
            endCursor: first.continueCursor,
          });
          const secondReplay = yield* QueryStream.paginate(distinct, {
            numItems: 1,
            cursor: first.continueCursor,
            endCursor: second.continueCursor,
          });
          expect(firstReplay.page.map((row) => row.tag)).toEqual(["c1", "b3"]);
          expect(secondReplay.page.map((row) => row.tag)).toEqual(["a3"]);
          expect(firstReplay.continueCursor).toBe(first.continueCursor);
          expect(secondReplay.continueCursor).toBe(second.continueCursor);
        }),
      ),
  );
});

describe("QueryStream distinct read budgets", () => {
  it.effect(
    "rejects a pinned budget stop when its only split boundary equals the endpoint",
    () =>
      run(
        Effect.gen(function* () {
          const { source } = yield* fixture;
          const distinct = source.pipe(
            QueryStream.distinct(["text"]),
            QueryStream.reverse,
          );
          const first = yield* QueryStream.paginate(distinct, {
            numItems: 1,
            cursor: null,
          });
          expect(first.page.map((row) => row.tag)).toEqual(["c1"]);

          const exhausted = yield* QueryStream.paginate(distinct, {
            numItems: 1,
            cursor: null,
            endCursor: first.continueCursor,
            maximumRowsRead: 2,
          }).pipe(Effect.result);
          assert(Result.isFailure(exhausted));
          assert(
            Schema.is(QueryStream.ReadBudgetExceededError)(exhausted.failure),
          );
          expect(exhausted.failure.rowsRead).toBe(2);

          const enough = yield* QueryStream.paginate(distinct, {
            numItems: 1,
            cursor: null,
            endCursor: first.continueCursor,
            maximumRowsRead: 3,
          });
          expect(enough.page.map((row) => row.tag)).toEqual(["c1"]);
          expect(enough.continueCursor).toBe(first.continueCursor);
          expect(enough.isDone).toBe(false);
          expect(enough.pageStatus).not.toBe("SplitRequired");
          expect(enough.splitCursor).toBeUndefined();
        }),
      ),
  );

  describe.each([2, "unbounded"] as const)(
    "mapEffect concurrency %s",
    (concurrency) => {
      it.effect(
        "keeps completed first outputs when concurrent prefetch exhausts the budget",
        () =>
          run(
            Effect.gen(function* () {
              const { source } = yield* fixture;
              const mapped = source.pipe(
                QueryStream.mapEffect(
                  (row) => Effect.yieldNow.pipe(Effect.as(row)),
                  { concurrency },
                ),
              );
              const distinctThenMapped = source.pipe(
                QueryStream.distinct(["text"]),
                QueryStream.mapEffect(
                  (row) => Effect.yieldNow.pipe(Effect.as(row)),
                  { concurrency },
                ),
              );
              for (const stream of [
                mapped,
                mapped.pipe(QueryStream.distinct(["text"])),
                distinctThenMapped,
              ]) {
                const result = yield* QueryStream.paginate(stream, {
                  numItems: 1,
                  cursor: null,
                  maximumRowsRead: 1,
                });
                expect(result.page.map((row) => row.tag)).toEqual(["a1"]);
                expect(result.isDone).toBe(false);
                expect(result.pageStatus).toBe("SplitRequired");
              }
            }),
          ),
      );

      it.effect(
        "retains the first reversed representative while later work is prefetched",
        () =>
          run(
            Effect.gen(function* () {
              const { source } = yield* fixture;
              const stream = source.pipe(
                QueryStream.distinct(["text"]),
                QueryStream.reverse,
                QueryStream.mapEffect(
                  (row) => Effect.yieldNow.pipe(Effect.as(row)),
                  { concurrency },
                ),
              );
              const result = yield* QueryStream.paginate(stream, {
                numItems: 1,
                cursor: null,
                maximumRowsRead: 2,
              });
              expect(result.page.map((row) => row.tag)).toEqual(["c1"]);
              expect(result.isDone).toBe(false);
              expect(result.pageStatus).toBe("SplitRequired");
            }),
          ),
      );
    },
  );

  it.effect(
    "counts reverse group discovery and representative seeks as physical reads",
    () =>
      run(
        Effect.gen(function* () {
          const { source } = yield* fixture;
          const distinct = source.pipe(
            QueryStream.distinct(["text"]),
            QueryStream.reverse,
          );
          const result = yield* QueryStream.paginate(distinct, {
            numItems: 1,
            cursor: null,
            maximumRowsRead: 1,
          }).pipe(Effect.result);
          assert(Result.isFailure(result));
          expect(result.failure).toBeInstanceOf(
            QueryStream.ReadBudgetExceededError,
          );
          assert(
            Schema.is(QueryStream.ReadBudgetExceededError)(result.failure),
          );
          expect(result.failure.rowsRead).toBe(1);
        }),
      ),
  );

  it.effect(
    "charges encoded bytes for a reverse discovery before a representative is known",
    () =>
      run(
        Effect.gen(function* () {
          const { source, rows } = yield* fixture;
          const c1 = rows.find((row) => row.tag === "c1");
          assert(c1 !== undefined && c1.tag !== undefined);
          const result = yield* QueryStream.paginate(
            source.pipe(QueryStream.distinct(["text"]), QueryStream.reverse),
            { numItems: 1, cursor: null, maximumBytesRead: 1 },
          ).pipe(Effect.result);
          assert(Result.isFailure(result));
          assert(
            Schema.is(QueryStream.ReadBudgetExceededError)(result.failure),
          );
          expect(result.failure.rowsRead).toBe(1);
          expect(result.failure.bytesRead).toBe(
            getDocumentSize({
              _id: c1._id,
              _creationTime: c1._creationTime,
              text: c1.text,
              tag: c1.tag,
            }),
          );
        }),
      ),
  );

  it.effect(
    "counts rejected rows while seeking the original representative",
    () =>
      run(
        Effect.gen(function* () {
          const { reader } = yield* fixture;
          const distinct = reader
            .table("notes")
            .stream("by_text", (q) => q.gte("text", "a").lte("text", "a"))
            .pipe(
              QueryStream.filter((row) => row.tag === "a3"),
              QueryStream.distinct(["text"]),
              QueryStream.reverse,
            );
          const result = yield* QueryStream.paginate(distinct, {
            numItems: 1,
            cursor: null,
            maximumRowsRead: 3,
          }).pipe(Effect.result);
          assert(Result.isFailure(result));
          assert(
            Schema.is(QueryStream.ReadBudgetExceededError)(result.failure),
          );
          expect(result.failure.rowsRead).toBe(3);

          const enough = yield* QueryStream.paginate(distinct, {
            numItems: 1,
            cursor: null,
            maximumRowsRead: 4,
          });
          expect(enough.page.map((row) => row.tag)).toEqual(["a3"]);
        }),
      ),
  );

  it.effect(
    "returns only a safe partial page when the next representative exceeds the budget",
    () =>
      run(
        Effect.gen(function* () {
          const { source } = yield* fixture;
          const distinct = source.pipe(
            QueryStream.distinct(["text"]),
            QueryStream.reverse,
          );
          const partial = yield* QueryStream.paginate(distinct, {
            numItems: 3,
            cursor: null,
            maximumRowsRead: 3,
          });
          expect(partial.page.map((row) => row.tag)).toEqual(["c1"]);
          expect(partial.isDone).toBe(false);
          expect(partial.pageStatus).toBe("SplitRequired");
          expect(partial.splitCursor).toBeDefined();
          const rest = yield* QueryStream.paginate(distinct, {
            numItems: 3,
            cursor: partial.continueCursor,
          });
          expect(rest.page.map((row) => row.tag)).toEqual(["b1", "a1"]);
          expect(rest.isDone).toBe(true);
        }),
      ),
  );

  it.effect("shares a physical read budget across merge branches", () =>
    run(
      Effect.gen(function* () {
        const { reader } = yield* fixture;
        const first = reader
          .table("notes")
          .stream("by_text", (q) => q.gte("text", "a").lte("text", "a"))
          .pipe(QueryStream.distinct(["text"]));
        const second = reader
          .table("notes")
          .stream("by_text", (q) => q.gte("text", "b").lte("text", "b"))
          .pipe(QueryStream.distinct(["text"]));
        const result = yield* QueryStream.paginate(
          QueryStream.merge([first, second]),
          {
            numItems: 1,
            cursor: null,
            maximumRowsRead: 1,
          },
        ).pipe(Effect.result);
        assert(Result.isFailure(result));
        assert(Schema.is(QueryStream.ReadBudgetExceededError)(result.failure));
        expect(result.failure.rowsRead).toBe(1);
      }),
    ),
  );

  it.effect(
    "shares the budget with inner distinct without treating exhaustion as onEmpty",
    () =>
      run(
        Effect.gen(function* () {
          const { reader } = yield* fixture;
          yield* insert([["x", "a"]]);
          const joined = reader
            .table("notes")
            .stream("by_text", (q) => q.gte("text", "x"))
            .pipe(
              QueryStream.distinct(["text"]),
              QueryStream.flatMap(
                (row) =>
                  reader
                    .table("notes")
                    .stream("by_text", (q) =>
                      q.gte("text", row.tag ?? "").lte("text", row.tag ?? ""),
                    )
                    .pipe(QueryStream.distinct(["text"])),
                {
                  innerKey: ["text", "_creationTime"],
                  onEmpty: () => ({ tag: "missing" }),
                },
              ),
            );
          const result = yield* QueryStream.paginate(joined, {
            numItems: 1,
            cursor: null,
            maximumRowsRead: 1,
          }).pipe(Effect.result);
          assert(Result.isFailure(result));
          assert(
            Schema.is(QueryStream.ReadBudgetExceededError)(result.failure),
          );
          expect(result.failure.rowsRead).toBe(1);

          const enough = yield* QueryStream.paginate(joined, {
            numItems: 1,
            cursor: null,
            maximumRowsRead: 2,
          });
          expect(enough.page.map((row) => row.tag)).toEqual(["a1"]);
        }),
      ),
  );
});
