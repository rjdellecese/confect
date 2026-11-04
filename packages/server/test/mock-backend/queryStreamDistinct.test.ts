import * as Option from "effect/Option";
import * as Arr from "effect/Array";
import type * as QueryStreamKeyLabels from "@confect/server/QueryStreamKeyLabels";
import { identity } from "effect/Function";
import * as QueryStreamKeyLayout from "@confect/server/QueryStreamKeyLayout";
import type * as QueryStreamOrderDirection from "@confect/server/QueryStreamOrderDirection";
import { QueryStream } from "@confect/server";
import { assert, describe, expect, it } from "@effect/vitest";
import { getDocumentSize } from "convex/values";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Ref from "effect/Ref";
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
  });

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
    Effect.map((rows) => Arr.map(rows, (row) => row.tag)),
  );

const observeUpstreamEnd = <
  Doc,
  Labels extends QueryStreamKeyLabels.QueryStreamKeyLabels,
  E,
  R,
  Direction extends QueryStreamOrderDirection.QueryStreamOrderDirection,
>(
  stream: QueryStream.QueryStream<Doc, Labels, Direction, E, R>,
  onEnd: Effect.Effect<void>,
): QueryStream.QueryStream<Doc, Labels, Direction, E, R> =>
  new QueryStream.QueryStream(
    stream.orderDirection,
    stream.keyLayout,
    stream.annotated.pipe(
      Stream.concat(Stream.fromEffect(onEnd).pipe(Stream.drain)),
    ),
    stream.reflection,
    stream.narrowWith,
    stream.reverseWith,
  );

const pageTags = Effect.fnUntraced(function* <
  Doc extends { tag?: string },
  Labels extends QueryStreamKeyLabels.QueryStreamKeyLabels,
  E,
  R,
>(
  stream: QueryStream.QueryStream<
    Doc,
    Labels,
    QueryStreamOrderDirection.QueryStreamOrderDirection,
    E,
    R
  >,
  numItems = 1,
) {
  const pages: Array<Array<string | undefined>> = [];
  let cursor: string | null = null;
  for (let index = 0; index < 20; index++) {
    const result: QueryStream.PaginationResult<Doc> =
      yield* QueryStream.paginate(stream, { numItems, cursor });
    if (result.page.length > 0) {
      pages.push(Arr.map(result.page, (row) => row.tag));
    }
    if (result.isDone) return pages;
    expect(result.continueCursor).not.toBe(cursor);
    cursor = result.continueCursor;
  }
  return expect.unreachable("Pagination did not finish within 20 pages");
});

it.layer(TestConfect.layer, { buildPerTest: true })(
  "QueryStream distinct representatives",
  (test) => {
    test.effect(
      "treats an empty prefix as one group and preserves its representative",
      () =>
        run(
          Effect.gen(function* () {
            const { reader, source, rows } = yield* fixture;
            const distinct = source.pipe(QueryStream.distinct([]));
            const tagsResult = yield* tags(distinct);
            expect(tagsResult).toEqual(["a1"]);
            const tagsResult2 = yield* tags(QueryStream.reverse(distinct));
            expect(tagsResult2).toEqual(["a1"]);
            const tagsResult3 = yield* tags(
              distinct.pipe(QueryStream.reverse, QueryStream.reverse),
            );
            expect(tagsResult3).toEqual(["a1"]);
            const tagsResult4 = yield* tags(
              source.pipe(QueryStream.reverse, QueryStream.distinct([])),
            );
            expect(tagsResult4).toEqual(["c1"]);
            const pageTagsResult = yield* pageTags(distinct);
            expect(pageTagsResult).toEqual([["a1"]]);
            const pageTagsResult2 = yield* pageTags(
              QueryStream.reverse(distinct),
            );
            expect(pageTagsResult2).toEqual([["a1"]]);

            const a2 = Option.getOrUndefined(
              Arr.findFirst(rows, (row) => row.tag === "a2"),
            );
            assert(a2 !== undefined);
            const keyValues = [a2.text, a2._creationTime, a2._id];
            const tagsResult5 = yield* tags(
              QueryStream.narrow(distinct, {
                start: { keyValues: keyValues, inclusive: true },
              }),
            );
            expect(tagsResult5).toEqual([]);
            const tagsResult6 = yield* tags(
              QueryStream.narrow(distinct, {
                end: { keyValues: keyValues, inclusive: true },
              }),
            );
            expect(tagsResult6).toEqual(["a1"]);

            const empty = reader
              .table("notes")
              .stream("by_text", (q) => q.gt("text", "z"))
              .pipe(QueryStream.distinct([]));
            const tagsResult7 = yield* tags(empty);
            expect(tagsResult7).toEqual([]);
            const pageTagsResult3 = yield* pageTags(QueryStream.reverse(empty));
            expect(pageTagsResult3).toEqual([]);
          }),
        ),
    );

    test.effect(
      "reverses representatives without changing their IDs or tags",
      () =>
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

            expect(Arr.map(forward, (row) => row.tag)).toEqual([
              "a1",
              "b1",
              "c1",
            ]);
            expect(Arr.map(backward, (row) => row.tag)).toEqual([
              "c1",
              "b1",
              "a1",
            ]);
            expect(Arr.map(backward, (row) => row._id)).toEqual(
              Arr.reverse(Arr.map(forward, (row) => row._id)),
            );
            expect(twice).toEqual(forward);
          }),
        ),
    );

    test.effect(
      "selects last representatives only when its input is reversed",
      () =>
        run(
          Effect.gen(function* () {
            const { source } = yield* fixture;
            const last = source.pipe(
              QueryStream.reverse,
              QueryStream.distinct(["text"]),
            );
            const tagsResult8 = yield* tags(last);
            expect(tagsResult8).toEqual(["c1", "b2", "a3"]);
            const tagsResult9 = yield* tags(QueryStream.reverse(last));
            expect(tagsResult9).toEqual(["a3", "b2", "c1"]);
          }),
        ),
    );

    test.effect("paginates the same representatives forward and backward", () =>
      run(
        Effect.gen(function* () {
          const { source } = yield* fixture;
          const distinct = source.pipe(QueryStream.distinct(["text"]));
          const pageTagsResult4 = yield* pageTags(distinct);
          expect(pageTagsResult4).toEqual([["a1"], ["b1"], ["c1"]]);
          const pageTagsResult5 = yield* pageTags(
            QueryStream.reverse(distinct),
          );
          expect(pageTagsResult5).toEqual([["c1"], ["b1"], ["a1"]]);
          const pageTagsResult6 = yield* pageTags(distinct, 2);
          expect(pageTagsResult6).toEqual([["a1", "b1"], ["c1"]]);
        }),
      ),
    );

    test.effect(
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

            const pageTagsResult7 = yield* pageTags(merged);
            expect(pageTagsResult7).toEqual([["a1"], ["a2"], ["b1"], ["c1"]]);
            const pageTagsResult8 = yield* pageTags(
              QueryStream.reverse(merged),
            );
            expect(pageTagsResult8).toEqual([["c1"], ["b1"], ["a2"], ["a1"]]);
          }),
        ),
    );

    test.effect(
      "narrow filters original representatives rather than selecting a new one",
      () =>
        run(
          Effect.gen(function* () {
            const { source, rows } = yield* fixture;
            const a2 = Option.getOrUndefined(
              Arr.findFirst(rows, (row) => row.tag === "a2"),
            );
            const a3 = Option.getOrUndefined(
              Arr.findFirst(rows, (row) => row.tag === "a3"),
            );
            assert(a2 !== undefined && a3 !== undefined);
            const key2 = [a2.text, a2._creationTime, a2._id];
            const key3 = [a3.text, a3._creationTime, a3._id];
            const distinct = source.pipe(QueryStream.distinct(["text"]));

            for (const inclusive of [false, true]) {
              const tagsResult10 = yield* tags(
                QueryStream.narrow(distinct, {
                  start: { keyValues: key2, inclusive },
                }),
              );
              expect(tagsResult10).toEqual(["b1", "c1"]);
              const tagsResult11 = yield* tags(
                QueryStream.narrow(distinct, {
                  end: { keyValues: key2, inclusive },
                }),
              );
              expect(tagsResult11).toEqual(["a1"]);
              const tagsResult12 = yield* tags(
                QueryStream.narrow(distinct, {
                  start: { keyValues: key2, inclusive },
                  end: { keyValues: key3, inclusive },
                }),
              );
              expect(tagsResult12).toEqual([]);
              const tagsResult13 = yield* tags(
                QueryStream.narrow(QueryStream.reverse(distinct), {
                  start: { keyValues: key3, inclusive },
                  end: { keyValues: key2, inclusive },
                }),
              );
              expect(tagsResult13).toEqual([]);
            }
          }),
        ),
    );

    test.effect(
      "honors inclusive and exclusive bounds on the representative itself",
      () =>
        run(
          Effect.gen(function* () {
            const { source, rows } = yield* fixture;
            const a1 = Option.getOrUndefined(
              Arr.findFirst(rows, (row) => row.tag === "a1"),
            );
            assert(a1 !== undefined);
            const keyValues = [a1.text, a1._creationTime, a1._id];
            const distinct = source.pipe(QueryStream.distinct(["text"]));

            const tagsResult14 = yield* tags(
              QueryStream.narrow(distinct, {
                start: { keyValues: keyValues, inclusive: true },
              }),
            );
            expect(tagsResult14).toEqual(["a1", "b1", "c1"]);
            const tagsResult15 = yield* tags(
              QueryStream.narrow(distinct, {
                start: { keyValues: keyValues, inclusive: false },
              }),
            );
            expect(tagsResult15).toEqual(["b1", "c1"]);
            const tagsResult16 = yield* tags(
              QueryStream.narrow(distinct, {
                end: { keyValues: keyValues, inclusive: true },
              }),
            );
            expect(tagsResult16).toEqual(["a1"]);
            const tagsResult17 = yield* tags(
              QueryStream.narrow(distinct, {
                end: { keyValues: keyValues, inclusive: false },
              }),
            );
            expect(tagsResult17).toEqual([]);
          }),
        ),
    );

    test.effect(
      "preserves original index bounds and bounds applied before distinct",
      () =>
        run(
          Effect.gen(function* () {
            const { reader, rows } = yield* fixture;
            const a2 = Option.getOrUndefined(
              Arr.findFirst(rows, (row) => row.tag === "a2"),
            );
            assert(a2 !== undefined);
            const distinct = reader
              .table("notes")
              .stream("by_text", (q) => q.gte("text", "a").lte("text", "b"))
              .pipe(
                QueryStream.narrow({
                  start: {
                    keyValues: [a2.text, a2._creationTime, a2._id],
                    inclusive: true,
                  },
                }),
                QueryStream.distinct(["text"]),
              );

            const tagsResult18 = yield* tags(distinct);
            expect(tagsResult18).toEqual(["a2", "b1"]);
            const tagsResult19 = yield* tags(QueryStream.reverse(distinct));
            expect(tagsResult19).toEqual(["b1", "a2"]);
            const pageTagsResult9 = yield* pageTags(
              QueryStream.reverse(distinct),
            );
            expect(pageTagsResult9).toEqual([["b1"], ["a2"]]);
          }),
        ),
    );

    test.effect(
      "preserves pre-filter selection and post-filter exclusion when reversed",
      () =>
        run(
          Effect.gen(function* () {
            const { source } = yield* fixture;
            const selected = source.pipe(
              QueryStream.filterEffect((row) =>
                Effect.succeed(row.tag !== "a1"),
              ),
              QueryStream.distinct(["text"]),
            );
            const filtered = selected.pipe(
              QueryStream.filter((row) => row.tag !== "b1"),
            );

            const tagsResult20 = yield* tags(QueryStream.reverse(selected));
            expect(tagsResult20).toEqual(["c1", "b1", "a2"]);
            const tagsResult21 = yield* tags(filtered);
            expect(tagsResult21).toEqual(["a2", "c1"]);
            const pageTagsResult10 = yield* pageTags(
              QueryStream.reverse(filtered),
            );
            expect(pageTagsResult10).toEqual([["c1"], ["a2"]]);
          }),
        ),
    );

    test.effect(
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
            const tagsResult22 = yield* tags(nested);
            expect(tagsResult22).toEqual(["a1", "b1", "c1"]);
            const pageTagsResult11 = yield* pageTags(
              QueryStream.reverse(nested),
            );
            expect(pageTagsResult11).toEqual([["c1"], ["b1"], ["a1"]]);
          }),
        ),
    );

    test.effect(
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
                    innerKeyLayout: Result.getOrThrowWith(
                      QueryStreamKeyLayout.fromIndex(["text", "_creationTime"]),
                      identity,
                    ),
                    onEmpty: (row) => ({ tag: `none for ${row.text}` }),
                  },
                ),
              );

            const tagsResult23 = yield* tags(joined);
            expect(tagsResult23).toEqual(["a1", "none for x2"]);
            const pageTagsResult12 = yield* pageTags(
              QueryStream.reverse(joined),
            );
            expect(pageTagsResult12).toEqual([["none for x2"], ["a1"]]);
            const tagsResult24 = yield* tags(
              joined.pipe(QueryStream.reverse, QueryStream.reverse),
            );
            expect(tagsResult24).toEqual(["a1", "none for x2"]);
          }),
        ),
    );

    test.effect(
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
                    innerKeyLayout: Result.getOrThrowWith(
                      QueryStreamKeyLayout.fromIndex(["_creationTime"]),
                      identity,
                    ),
                    onEmpty: (row) => ({ tag: `none for ${row.text}` }),
                  },
                ),
                QueryStream.distinct(["text"]),
                QueryStream.renameKey([
                  "outer",
                  "outerCreated",
                  "innerCreated",
                ]),
              );

            const tagsResult25 = yield* tags(joined);
            expect(tagsResult25).toEqual(["a1", "b1", "none for x3"]);
            const pageTagsResult13 = yield* pageTags(
              QueryStream.reverse(joined),
            );
            expect(pageTagsResult13).toEqual([["none for x3"], ["b1"], ["a1"]]);
          }),
        ),
    );

    test.effect(
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
            const a1 = Option.getOrUndefined(
              Arr.findFirst(rows, (row) => row.tag === "a1"),
            );
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
            expect(Arr.map(firstReplay.page, (row) => row.tag)).toEqual([]);
            expect(Arr.map(secondReplay.page, (row) => row.tag)).toEqual([
              "a2",
              "b1",
            ]);
            expect(firstReplay.continueCursor).toBe(first.continueCursor);
            expect(secondReplay.continueCursor).toBe(second.continueCursor);
          }),
        ),
    );

    test.effect(
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
            expect(Arr.map(firstReplay.page, (row) => row.tag)).toEqual([
              "earlier",
            ]);
            expect(Arr.map(secondReplay.page, (row) => row.tag)).toEqual([
              "b1",
            ]);
            expect(firstReplay.continueCursor).toBe(first.continueCursor);
            expect(secondReplay.continueCursor).toBe(second.continueCursor);
          }),
        ),
    );

    test.effect(
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
            expect(Arr.map(first.page, (row) => row.tag)).toEqual(["c1", "b2"]);
            expect(Arr.map(second.page, (row) => row.tag)).toEqual(["a3"]);
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
            expect(Arr.map(firstReplay.page, (row) => row.tag)).toEqual([
              "c1",
              "b3",
            ]);
            expect(Arr.map(secondReplay.page, (row) => row.tag)).toEqual([
              "a3",
            ]);
            expect(firstReplay.continueCursor).toBe(first.continueCursor);
            expect(secondReplay.continueCursor).toBe(second.continueCursor);
          }),
        ),
    );
  },
);

it.layer(TestConfect.layer, { buildPerTest: true })(
  "QueryStream distinct read budgets",
  (test) => {
    test.effect(
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
            expect(Arr.map(first.page, (row) => row.tag)).toEqual(["c1"]);

            const exhausted = yield* QueryStream.paginate(distinct, {
              numItems: 1,
              cursor: null,
              endCursor: first.continueCursor,
              maximumRowsRead: 2,
            }).pipe(Effect.result);
            const isFailure2 = Result.isFailure(exhausted);
            assert(isFailure2);
            const matchesSchema = Schema.is(
              QueryStream.ReadBudgetExceededError,
            )(exhausted.failure);
            assert(matchesSchema);
            expect(exhausted.failure.rowsRead).toBe(2);

            const enough = yield* QueryStream.paginate(distinct, {
              numItems: 1,
              cursor: null,
              endCursor: first.continueCursor,
              maximumRowsRead: 3,
            });
            expect(Arr.map(enough.page, (row) => row.tag)).toEqual(["c1"]);
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
        test.effect(
          "keeps completed first outputs when concurrent prefetch exhausts the budget",
          () =>
            run(
              Effect.gen(function* () {
                const { source, rows } = yield* fixture;
                expect(rows.length).toBeGreaterThan(1);
                for (const placement of [
                  "mapped",
                  "mappedThenDistinct",
                  "distinctThenMapped",
                ] as const) {
                  const mapperStarted = yield* Deferred.make<void>();
                  const releaseMapper = yield* Deferred.make<void>();
                  const upstreamDone = yield* Deferred.make<void>();
                  const observations = yield* Ref.make<ReadonlyArray<string>>(
                    [],
                  );
                  const upstream = observeUpstreamEnd(
                    placement === "distinctThenMapped"
                      ? source.pipe(QueryStream.distinct(["text"]))
                      : source,
                    Effect.gen(function* () {
                      yield* Ref.update(observations, (events) => [
                        ...events,
                        "source-limit",
                      ]);
                      yield* Deferred.succeed(upstreamDone, undefined);
                    }),
                  );
                  const mapped = upstream.pipe(
                    QueryStream.mapEffect(
                      (row) =>
                        Effect.gen(function* () {
                          yield* Deferred.succeed(mapperStarted, undefined);
                          yield* Deferred.await(releaseMapper);
                          yield* Ref.update(observations, (events) => [
                            ...events,
                            "mapped-complete",
                          ]);
                          return row;
                        }),
                      { concurrency },
                    ),
                  );
                  const stream =
                    placement === "mappedThenDistinct"
                      ? mapped.pipe(QueryStream.distinct(["text"]))
                      : mapped;
                  const pagination = yield* QueryStream.paginate(stream, {
                    numItems: 1,
                    cursor: null,
                    maximumRowsRead: 1,
                  }).pipe(Effect.forkScoped);
                  yield* Deferred.await(mapperStarted);
                  yield* Deferred.await(upstreamDone);
                  const getResult = yield* Ref.get(observations);
                  expect(getResult).toEqual(["source-limit"]);
                  yield* Deferred.succeed(releaseMapper, undefined);
                  const result = yield* Fiber.join(pagination);
                  const getResult2 = yield* Ref.get(observations);
                  expect(getResult2).toEqual([
                    "source-limit",
                    "mapped-complete",
                  ]);
                  expect(Arr.map(result.page, (row) => row.tag)).toEqual([
                    "a1",
                  ]);
                  expect(result.isDone).toBe(false);
                  expect(result.pageStatus).toBe("SplitRequired");
                }
              }).pipe(Effect.scoped),
            ),
        );

        test.effect(
          "retains the first reversed representative while later work is prefetched",
          () =>
            run(
              Effect.gen(function* () {
                const { source, rows } = yield* fixture;
                expect(rows.length).toBeGreaterThan(2);
                const mapperStarted = yield* Deferred.make<void>();
                const releaseMapper = yield* Deferred.make<void>();
                const upstreamDone = yield* Deferred.make<void>();
                const observations = yield* Ref.make<ReadonlyArray<string>>([]);
                const upstream = source.pipe(
                  QueryStream.distinct(["text"]),
                  QueryStream.reverse,
                );
                const stream = observeUpstreamEnd(
                  upstream,
                  Effect.gen(function* () {
                    yield* Ref.update(observations, (events) => [
                      ...events,
                      "source-limit",
                    ]);
                    yield* Deferred.succeed(upstreamDone, undefined);
                  }),
                ).pipe(
                  QueryStream.mapEffect(
                    (row) =>
                      Effect.gen(function* () {
                        yield* Deferred.succeed(mapperStarted, undefined);
                        yield* Deferred.await(releaseMapper);
                        yield* Ref.update(observations, (events) => [
                          ...events,
                          "mapped-complete",
                        ]);
                        return row;
                      }),
                    { concurrency },
                  ),
                );
                const pagination = yield* QueryStream.paginate(stream, {
                  numItems: 1,
                  cursor: null,
                  maximumRowsRead: 2,
                }).pipe(Effect.forkScoped);
                yield* Deferred.await(mapperStarted);
                yield* Deferred.await(upstreamDone);
                const getResult3 = yield* Ref.get(observations);
                expect(getResult3).toEqual(["source-limit"]);
                yield* Deferred.succeed(releaseMapper, undefined);
                const result = yield* Fiber.join(pagination);
                const getResult4 = yield* Ref.get(observations);
                expect(getResult4).toEqual(["source-limit", "mapped-complete"]);
                expect(Arr.map(result.page, (row) => row.tag)).toEqual(["c1"]);
                expect(result.isDone).toBe(false);
                expect(result.pageStatus).toBe("SplitRequired");
              }).pipe(Effect.scoped),
            ),
        );
      },
    );

    test.effect(
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
            const isFailure3 = Result.isFailure(result);
            assert(isFailure3);
            expect(result.failure).toBeInstanceOf(
              QueryStream.ReadBudgetExceededError,
            );
            const matchesSchema2 = Schema.is(
              QueryStream.ReadBudgetExceededError,
            )(result.failure);
            assert(matchesSchema2);
            expect(result.failure.rowsRead).toBe(1);
          }),
        ),
    );

    test.effect(
      "charges encoded bytes for a reverse discovery before a representative is known",
      () =>
        run(
          Effect.gen(function* () {
            const { source, rows } = yield* fixture;
            const c1 = Option.getOrUndefined(
              Arr.findFirst(rows, (row) => row.tag === "c1"),
            );
            assert(c1 !== undefined && c1.tag !== undefined);
            const result = yield* QueryStream.paginate(
              source.pipe(QueryStream.distinct(["text"]), QueryStream.reverse),
              { numItems: 1, cursor: null, maximumBytesRead: 1 },
            ).pipe(Effect.result);
            const isFailure4 = Result.isFailure(result);
            assert(isFailure4);
            const matchesSchema3 = Schema.is(
              QueryStream.ReadBudgetExceededError,
            )(result.failure);
            assert(matchesSchema3);
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

    test.effect(
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
            const isFailure5 = Result.isFailure(result);
            assert(isFailure5);
            const matchesSchema4 = Schema.is(
              QueryStream.ReadBudgetExceededError,
            )(result.failure);
            assert(matchesSchema4);
            expect(result.failure.rowsRead).toBe(3);

            const enough = yield* QueryStream.paginate(distinct, {
              numItems: 1,
              cursor: null,
              maximumRowsRead: 4,
            });
            expect(Arr.map(enough.page, (row) => row.tag)).toEqual(["a3"]);
          }),
        ),
    );

    test.effect(
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
            expect(Arr.map(partial.page, (row) => row.tag)).toEqual(["c1"]);
            expect(partial.isDone).toBe(false);
            expect(partial.pageStatus).toBe("SplitRequired");
            expect(partial.splitCursor).toBeDefined();
            const rest = yield* QueryStream.paginate(distinct, {
              numItems: 3,
              cursor: partial.continueCursor,
            });
            expect(Arr.map(rest.page, (row) => row.tag)).toEqual(["b1", "a1"]);
            expect(rest.isDone).toBe(true);
          }),
        ),
    );

    test.effect("shares a physical read budget across merge branches", () =>
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
          const isFailure6 = Result.isFailure(result);
          assert(isFailure6);
          const matchesSchema5 = Schema.is(QueryStream.ReadBudgetExceededError)(
            result.failure,
          );
          assert(matchesSchema5);
          expect(result.failure.rowsRead).toBe(1);
        }),
      ),
    );

    test.effect(
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
                    innerKeyLayout: Result.getOrThrowWith(
                      QueryStreamKeyLayout.fromIndex(["text", "_creationTime"]),
                      identity,
                    ),
                    onEmpty: () => ({ tag: "missing" }),
                  },
                ),
              );
            const result = yield* QueryStream.paginate(joined, {
              numItems: 1,
              cursor: null,
              maximumRowsRead: 1,
            }).pipe(Effect.result);
            const isFailure7 = Result.isFailure(result);
            assert(isFailure7);
            const matchesSchema6 = Schema.is(
              QueryStream.ReadBudgetExceededError,
            )(result.failure);
            assert(matchesSchema6);
            expect(result.failure.rowsRead).toBe(1);

            const enough = yield* QueryStream.paginate(joined, {
              numItems: 1,
              cursor: null,
              maximumRowsRead: 2,
            });
            expect(Arr.map(enough.page, (row) => row.tag)).toEqual(["a1"]);
          }),
        ),
    );
  },
);
