import * as QueryStreamReadBudget from "@confect/server/QueryStreamReadBudget";
import { identity } from "effect/Function";
import * as Result from "effect/Result";
import * as QueryStreamKeyLayout from "@confect/server/QueryStreamKeyLayout";
import type * as QueryStreamOrderDirection from "@confect/server/QueryStreamOrderDirection";
import type * as QueryStreamOrderKey from "@confect/server/QueryStreamOrderKey";
import * as QueryStreamKey from "@confect/server/QueryStreamKey";
import * as QueryStreamKeyBounds from "@confect/server/QueryStreamKeyBounds";
import * as QueryStreamCursor from "@confect/server/QueryStreamCursor";
import * as QueryStream from "@confect/server/QueryStream";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import { ConvexError } from "convex/values";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

const encodeCursor =
  (layout: QueryStreamKeyLayout.QueryStreamKeyLayout) =>
  (values: QueryStreamOrderKey.QueryStreamOrderKey) =>
    Effect.flatMap(
      Effect.fromResult(QueryStreamKey.complete(layout, values)),
      Schema.encodeEffect(QueryStreamCursor.codecForLayout(layout)),
    );

describe("QueryStream type parameters", () => {
  it("accepts direction third and defaults errors and requirements to never", () => {
    const source = new QueryStream.QueryStream<number, ["_id"], "desc">(
      "desc",
      Result.getOrThrowWith(QueryStreamKeyLayout.fromIndex(["_id"]), identity),
      Stream.empty,
    );

    expect(source.order).toBe("desc");
    expectTypeOf(source.toStream()).toEqualTypeOf<Stream.Stream<number>>();
    expectTypeOf(source.annotated).toEqualTypeOf<
      Stream.Stream<
        QueryStream.Element<number>,
        never,
        QueryStreamReadBudget.QueryStreamReadBudget
      >
    >();
    expectTypeOf<QueryStream.QueryStream<number, ["_id"]>>().toEqualTypeOf<
      QueryStream.QueryStream<
        number,
        ["_id"],
        QueryStreamOrderDirection.QueryStreamOrderDirection
      >
    >();
    expectTypeOf<
      QueryStream.QueryStream<number, ["_id"], "desc", Error>
    >().toEqualTypeOf<
      QueryStream.QueryStream<number, ["_id"], "desc", Error, never>
    >();
  });

  it("carries the fourth and fifth parameters into the Effect stream channels", () => {
    type Source = QueryStream.QueryStream<
      number,
      ["_id"],
      "asc",
      Error,
      { readonly service: "query" }
    >;

    expectTypeOf<Source["order"]>().toEqualTypeOf<"asc">();
    expectTypeOf<ReturnType<Source["toStream"]>>().toEqualTypeOf<
      Stream.Stream<number, Error, { readonly service: "query" }>
    >();
  });
});

describe("QueryStream.merge", () => {
  for (const direction of ["asc", "desc"] as const) {
    it.effect(`drains buffered chunks stably in ${direction} order`, () =>
      Effect.gen(function* () {
        const source = (label: string, ranks: ReadonlyArray<number>) =>
          new QueryStream.QueryStream<string, [], typeof direction>(
            direction,
            Result.getOrThrowWith(QueryStreamKeyLayout.fromIndex([]), identity),
            Stream.fromIterable(
              ranks.map(
                (rank) =>
                  new QueryStream.Element({
                    doc: Option.some(`${label}:${rank}`),
                    orderKey: [rank],
                  }),
              ),
            ),
          );
        const ascending = direction === "asc";
        const result = yield* Stream.runCollect(
          QueryStream.merge([
            source("left", ascending ? [1, 2, 2, 5] : [5, 2, 2, 1]),
            source("right", ascending ? [0, 2, 3, 4, 6] : [6, 4, 3, 2, 0]),
            QueryStream.empty<string>()(
              Result.getOrThrowWith(
                QueryStreamKeyLayout.fromIndex([]),
                identity,
              ),
              direction,
            ),
          ]),
        );
        expect(result).toEqual(
          ascending
            ? [
                "right:0",
                "left:1",
                "left:2",
                "left:2",
                "right:2",
                "right:3",
                "right:4",
                "left:5",
                "right:6",
              ]
            : [
                "right:6",
                "left:5",
                "right:4",
                "right:3",
                "left:2",
                "left:2",
                "right:2",
                "left:1",
                "right:0",
              ],
        );
      }),
    );
  }
});

describe("QueryStream key layouts", () => {
  const explicitFirst = QueryStreamKeyLayout.concat(
    Result.getOrThrowWith(QueryStreamKeyLayout.fromIndex(["_id"]), identity),
    Result.getOrThrowWith(QueryStreamKeyLayout.fromIndex([]), identity),
  );
  const implicitFirst = QueryStreamKeyLayout.concat(
    Result.getOrThrowWith(QueryStreamKeyLayout.fromIndex([]), identity),
    Result.getOrThrowWith(QueryStreamKeyLayout.fromIndex(["_id"]), identity),
  );

  it("rejects merging equal names with different implicit positions in either order", () => {
    const left = QueryStream.empty<string>()(explicitFirst);
    const right = QueryStream.empty<string>()(implicitFirst);
    expect(QueryStreamKeyLayout.visibleLabels(left.keyLayout)).toEqual(
      QueryStreamKeyLayout.visibleLabels(right.keyLayout),
    );
    for (const streams of [
      [left, right],
      [right, left],
    ] as const) {
      expect(() => QueryStream.merge(streams)).toThrow(
        QueryStream.IncompatibleStreamsError,
      );
    }
  });

  it.effect(
    "validates later inner streams even when their logical labels and runtime names agree",
    () =>
      Effect.gen(function* () {
        const outer = new QueryStream.QueryStream(
          "asc",
          Result.getOrThrowWith(QueryStreamKeyLayout.fromIndex([]), identity),
          Stream.make(
            new QueryStream.Element({ doc: Option.some(1), orderKey: [1] }),
            new QueryStream.Element({ doc: Option.some(2), orderKey: [2] }),
          ),
        );
        const joined = QueryStream.flatMap(
          outer,
          (row) =>
            QueryStream.empty<string>()(
              row === 1 ? explicitFirst : implicitFirst,
            ),
          { innerLayout: explicitFirst },
        );
        const defect = yield* Stream.runCollect(joined).pipe(
          Effect.catchDefect(Effect.succeed),
        );
        expect(defect).toBeInstanceOf(
          QueryStream.InnerStreamLayoutMismatchError,
        );
        expect(defect).toMatchObject({
          _tag: "InnerStreamLayoutMismatchError",
          expected: explicitFirst,
          actual: implicitFirst,
        });
      }),
  );

  it.effect("validates a new inner layout on subsequent runs", () =>
    Effect.gen(function* () {
      const outer = new QueryStream.QueryStream(
        "asc",
        Result.getOrThrowWith(QueryStreamKeyLayout.fromIndex([]), identity),
        Stream.make(
          new QueryStream.Element({ doc: Option.some(1), orderKey: [1] }),
        ),
      );
      let layout = explicitFirst;
      const joined = QueryStream.flatMap(
        outer,
        () => QueryStream.empty<string>()(layout),
        { innerLayout: explicitFirst },
      );
      expect(yield* Stream.runCollect(joined)).toEqual([]);
      layout = implicitFirst;
      const defect = yield* Stream.runCollect(joined).pipe(
        Effect.catchDefect(Effect.succeed),
      );
      expect(defect).toMatchObject({
        _tag: "InnerStreamLayoutMismatchError",
        expected: explicitFirst,
        actual: implicitFirst,
      });
    }),
  );

  it.effect(
    "validates later inner directions when the type permits either direction",
    () =>
      Effect.gen(function* () {
        const outer = new QueryStream.QueryStream<
          string,
          [],
          QueryStreamOrderDirection.QueryStreamOrderDirection
        >(
          "asc",
          Result.getOrThrowWith(QueryStreamKeyLayout.fromIndex([]), identity),
          Stream.make(
            new QueryStream.Element({ doc: Option.some("asc"), orderKey: [1] }),
            new QueryStream.Element({
              doc: Option.some("desc"),
              orderKey: [2],
            }),
          ),
        );
        const layout = Result.getOrThrowWith(
          QueryStreamKeyLayout.fromIndex(["_id"]),
          identity,
        );
        const joined = QueryStream.flatMap(
          outer,
          (row) =>
            QueryStream.empty<string>()(layout, row === "asc" ? "asc" : "desc"),
          { innerLayout: layout },
        );
        const defect = yield* Stream.runCollect(joined).pipe(
          Effect.catchDefect(Effect.succeed),
        );
        expect(defect).toMatchObject({
          _tag: "InnerStreamOrderMismatchError",
          expected: "asc",
          actual: "desc",
        });
      }),
  );

  it("requires the constructor layout to witness its declared logical key", () => {
    const invalid = new QueryStream.QueryStream<string, ["_id"], "asc">(
      "asc",
      // @ts-expect-error An implicit ID is absent from the logical key.
      Result.getOrThrowWith(QueryStreamKeyLayout.fromIndex([]), identity),
      Stream.empty,
    );
    void invalid;
  });
});

describe("QueryStream.Element", () => {
  it("constructs an element with an inferred document type and readonly fields", () => {
    const doc = Option.some({ text: "hello" });
    const orderKey: QueryStreamOrderKey.QueryStreamOrderKey = [
      "hello",
      1,
      "id",
    ];
    const element = new QueryStream.Element({ doc, orderKey });

    expectTypeOf(element).toEqualTypeOf<
      QueryStream.Element<{ text: string }>
    >();
    expectTypeOf(element).toExtend<{
      readonly doc: Option.Option<{ text: string }>;
      readonly orderKey: QueryStreamOrderKey.QueryStreamOrderKey;
    }>();
    expect(element.doc).toBe(doc);
    expect(element.orderKey).toBe(orderKey);
    expect(element.pipe((value) => Option.isSome(value.doc))).toBe(true);
  });

  it("constructs a filtered-out element without losing its order key", () => {
    const orderKey: QueryStreamOrderKey.QueryStreamOrderKey = [undefined, "id"];
    const element = new QueryStream.Element({ doc: Option.none(), orderKey });

    expectTypeOf(element).toEqualTypeOf<QueryStream.Element<never>>();
    expect(element.doc).toEqual(Option.none());
    expect(element.orderKey).toBe(orderKey);
  });
});

describe.each(["asc", "desc"] as const)(
  "QueryStream.paginate (%s)",
  (order) => {
    it.effect.each([
      { start: false, end: false },
      { start: true, end: false },
      { start: false, end: true },
      { start: true, end: true },
    ])(
      "preserves optional bounds with start=$start and end=$end",
      ({ start, end }) =>
        Effect.gen(function* () {
          const values = order === "asc" ? [1, 2, 3, 4, 5] : [5, 4, 3, 2, 1];
          const source = new QueryStream.QueryStream(
            order,
            Result.getOrThrowWith(QueryStreamKeyLayout.fromIndex([]), identity),
            Stream.fromIterable(
              values.map(
                (value) =>
                  new QueryStream.Element({
                    doc: Option.some(value),
                    orderKey: [value],
                  }),
              ),
            ),
          );
          const result = yield* QueryStream.paginate(source, {
            cursor: start
              ? yield* encodeCursor(source.keyLayout)([values[1]])
              : null,
            ...(end
              ? {
                  endCursor: yield* encodeCursor(source.keyLayout)([values[3]]),
                }
              : {}),
            numItems: 10,
          });

          expect(result.page).toEqual(values.slice(start ? 2 : 0, end ? 4 : 5));
          expect(result.isDone).toBe(!end);
          expect(result.continueCursor).toBe(
            end
              ? yield* encodeCursor(source.keyLayout)([values[3]])
              : QueryStreamCursor.END_CURSOR,
          );
        }),
    );

    it.effect.each(["cursor", "endCursor"] as const)(
      "rejects an incompatible %s before reading documents",
      (bound) =>
        Effect.gen(function* () {
          let reads = 0;
          const source = new QueryStream.QueryStream(
            order,
            Result.getOrThrowWith(
              QueryStreamKeyLayout.fromIndex(["text", "_creationTime"]),
              identity,
            ),
            Stream.fromEffect(
              Effect.sync(() => {
                reads++;
                return new QueryStream.Element({
                  doc: Option.some("apple"),
                  orderKey: ["apple", 1, "id"],
                });
              }),
            ),
          );

          for (const cursor of [
            '["apple",1,"id"]',
            yield* encodeCursor(
              Result.getOrThrowWith(
                QueryStreamKeyLayout.fromIndex([
                  "body",
                  "_creationTime",
                  "_id",
                ]),
                identity,
              ),
            )(["apple", 1, "id"]),
            yield* encodeCursor(
              Result.getOrThrowWith(
                QueryStreamKeyLayout.fromIndex([
                  "_creationTime",
                  "text",
                  "_id",
                ]),
                identity,
              ),
            )(["apple", 1, "id"]),
          ]) {
            for (const numItems of [0, 1]) {
              const result = yield* QueryStream.paginate(source, {
                cursor: yield* encodeCursor(source.keyLayout)([
                  "apple",
                  0,
                  "before",
                ]),
                numItems,
                [bound]: cursor,
              }).pipe(Effect.catchDefect(Effect.succeed));

              expect(result).toBeInstanceOf(ConvexError);
              expect(result).toMatchObject({
                data: { paginationError: "InvalidCursor" },
              });
            }
          }
          expect(reads).toBe(0);
        }),
    );

    it.effect("paginates tied values using the implicit ID", () =>
      Effect.gen(function* () {
        const ids = order === "asc" ? ["a", "b"] : ["b", "a"];
        const source = new QueryStream.QueryStream(
          order,
          Result.getOrThrowWith(
            QueryStreamKeyLayout.fromIndex(["text", "_creationTime"]),
            identity,
          ),
          Stream.fromIterable(
            ids.map(
              (id) =>
                new QueryStream.Element({
                  doc: Option.some(id),
                  orderKey: ["apple", 1, id],
                }),
            ),
          ),
        );
        const first = yield* QueryStream.paginate(source, {
          cursor: null,
          numItems: 1,
        });
        const second = yield* QueryStream.paginate(source, {
          cursor: first.continueCursor,
          numItems: 1,
        });
        const end = yield* QueryStream.paginate(source, {
          cursor: second.continueCursor,
          numItems: 1,
        });

        expect([...first.page, ...second.page]).toEqual(ids);
        expect(
          QueryStreamKey.values(
            yield* Schema.decodeEffect(
              QueryStreamCursor.codecForLayout(source.keyLayout),
            )(first.continueCursor),
          ),
        ).toEqual(["apple", 1, ids[0]]);
        expect(end).toMatchObject({
          page: [],
          isDone: true,
          continueCursor: QueryStreamCursor.END_CURSOR,
        });
      }),
    );

    it.effect("pins a page to the end sentinel", () =>
      Effect.gen(function* () {
        const source = new QueryStream.QueryStream(
          order,
          Result.getOrThrowWith(QueryStreamKeyLayout.fromIndex([]), identity),
          Stream.make(
            new QueryStream.Element({ doc: Option.some(1), orderKey: [1] }),
          ),
        );
        const result = yield* QueryStream.paginate(source, {
          cursor: null,
          endCursor: QueryStreamCursor.END_CURSOR,
          numItems: 1,
        });
        expect(result).toEqual({
          page: [1],
          isDone: true,
          continueCursor: QueryStreamCursor.END_CURSOR,
        });
      }),
    );
  },
);

describe("QueryStream", () => {
  const elements = [
    new QueryStream.Element({ doc: Option.some(1), orderKey: [1] }),
    new QueryStream.Element({ doc: Option.none<number>(), orderKey: [2] }),
    new QueryStream.Element({ doc: Option.some(3), orderKey: [3] }),
  ];
  const source = new QueryStream.QueryStream(
    "asc",
    Result.getOrThrowWith(QueryStreamKeyLayout.fromIndex([]), identity),
    Stream.fromIterable(elements),
  );

  it.effect("consumes constructed elements as present documents only", () =>
    Effect.gen(function* () {
      expect(yield* Stream.runCollect(source)).toEqual([1, 3]);
    }),
  );

  it.effect(
    "constructs mapped and filtered elements with their original keys",
    () =>
      Effect.gen(function* () {
        const transformed = source.pipe(
          QueryStream.filter((doc) => doc > 1),
          QueryStream.map((doc) => doc.toString()),
        );
        const result = yield* Stream.runCollect(transformed.annotated).pipe(
          Effect.provideServiceEffect(
            QueryStreamReadBudget.QueryStreamReadBudget,
            QueryStreamReadBudget.make({
              maximumRowsRead: Option.none(),
              maximumBytesRead: Option.none(),
            }),
          ),
        );

        expect(result).toEqual([
          new QueryStream.Element({ doc: Option.none(), orderKey: [1] }),
          new QueryStream.Element({ doc: Option.none(), orderKey: [2] }),
          new QueryStream.Element({ doc: Option.some("3"), orderKey: [3] }),
        ]);
        for (const element of result) {
          expect(element).toBeInstanceOf(QueryStream.Element);
        }
      }),
  );

  it.effect(
    "preserves filtered elements through effectful transformations",
    () =>
      Effect.gen(function* () {
        const visited: Array<number> = [];
        const transformed = source.pipe(
          QueryStream.mapEffect((doc) =>
            Effect.sync(() => {
              visited.push(doc);
              return doc.toString();
            }),
          ),
        );
        const result = yield* Stream.runCollect(transformed.annotated).pipe(
          Effect.provideServiceEffect(
            QueryStreamReadBudget.QueryStreamReadBudget,
            QueryStreamReadBudget.make({
              maximumRowsRead: Option.none(),
              maximumBytesRead: Option.none(),
            }),
          ),
        );

        expect(visited).toEqual([1, 3]);
        expect(result).toEqual([
          new QueryStream.Element({ doc: Option.some("1"), orderKey: [1] }),
          new QueryStream.Element({ doc: Option.none(), orderKey: [2] }),
          new QueryStream.Element({ doc: Option.some("3"), orderKey: [3] }),
        ]);
        for (const element of result) {
          expect(element).toBeInstanceOf(QueryStream.Element);
        }
      }),
  );
});

describe("QueryStream.narrow", () => {
  it("checks layout compatibility before invoking a narrowing recipe", () => {
    const layout = Result.getOrThrow(QueryStreamKeyLayout.fromIndex(["score"]));
    const other = Result.getOrThrow(QueryStreamKeyLayout.fromIndex(["rank"]));
    const received: Array<QueryStreamKeyBounds.ParsedBounds> = [];
    const source = new QueryStream.QueryStream<number, ["score"], "asc">(
      "asc",
      layout,
      Stream.empty,
      undefined,
      (bounds) => {
        received.push(bounds);
        return QueryStream.empty<number>()(layout);
      },
    );
    const narrow = Option.getOrThrow(Option.fromUndefinedOr(source.narrowWith));
    for (const bounds of [
      QueryStreamKeyBounds.unbounded(other),
      Result.getOrThrow(
        QueryStreamKeyBounds.parse(other, {
          lower: Option.some({ orderKey: [3], inclusive: true }),
          upper: Option.none(),
        }),
      ),
    ]) {
      expect(() => narrow(bounds)).toThrow(
        QueryStreamKeyLayout.KeyLayoutMismatchError,
      );
    }
    expect(received).toEqual([]);
    const equivalent = Result.getOrThrow(
      QueryStreamKeyLayout.fromIndex(["score"]),
    );
    const accepted = QueryStreamKeyBounds.unbounded(equivalent);
    const result = narrow(accepted);
    expect(result.keyLayout).toBe(layout);
    expect(received).toEqual([accepted]);
    expect(received[0]).toBe(accepted);
  });

  it.each(["asc", "desc"] as const)(
    "preserves parsed bounds through transforms and merge in %s order",
    (order) => {
      const layout = Result.getOrThrow(
        QueryStreamKeyLayout.fromIndex(["score"]),
      );
      const received: Array<QueryStreamKeyBounds.ParsedBounds> = [];
      const source = () =>
        new QueryStream.QueryStream<number, ["score"], typeof order>(
          order,
          layout,
          Stream.empty,
          undefined,
          (bounds) => {
            received.push(bounds);
            return QueryStream.empty<number>()(layout, order);
          },
        );
      const transformed = source().pipe(
        QueryStream.map((value) => value + 1),
        QueryStream.filter((value) => value > 0),
        QueryStream.mapEffect(Effect.succeed),
        QueryStream.filterEffect(() => Effect.succeed(true)),
      );
      const merged = QueryStream.merge([transformed, source()]);
      const lower = { orderKey: [3], inclusive: false };
      const upper = { orderKey: [5, "id"], inclusive: true };
      const start = order === "asc" ? lower : upper;
      const end = order === "asc" ? upper : lower;
      const narrowed = QueryStream.narrow(merged, { start, end });

      expect(narrowed.keyLayout).toBe(layout);
      expect(narrowed.order).toBe(order);
      expect(received).toHaveLength(2);
      const [first, second] = received;
      expect(first).toBe(second);
      for (const bounds of received) {
        for (const [endpoint, raw] of [
          [bounds.lower, order === "asc" ? start : end],
          [bounds.upper, order === "asc" ? end : start],
        ] as const) {
          const bound = Option.getOrThrow(endpoint);
          expect(bound.orderKey._tag).toBe("Prefix");
          expect(QueryStreamKey.layout(bound.orderKey)).toBe(layout);
          expect(QueryStreamKey.values(bound.orderKey)).toBe(raw.orderKey);
          expect(bound.inclusive).toBe(raw.inclusive);
        }
      }
      expectTypeOf<QueryStreamKeyBounds.KeyBounds>().not.toExtend<
        Parameters<NonNullable<typeof merged.narrowWith>>[0]
      >();
    },
  );

  it("rebinds renamed bounds to the underlying stream's layout", () => {
    const layout = Result.getOrThrow(QueryStreamKeyLayout.fromIndex(["score"]));
    const received: Array<QueryStreamKeyBounds.ParsedBounds> = [];
    const source = new QueryStream.QueryStream<number, ["score"], "asc">(
      "asc",
      layout,
      Stream.empty,
      undefined,
      (bounds) => {
        received.push(bounds);
        return QueryStream.empty<number>()(layout);
      },
    );
    const values = [3];
    const renamed = QueryStream.renameKey(source, ["rank"]);
    const narrowed = QueryStream.narrow(renamed, {
      start: { orderKey: values, inclusive: true },
    });
    expect(
      QueryStreamKeyLayout.compatible(narrowed.keyLayout, renamed.keyLayout),
    ).toBe(true);
    expect(received).toHaveLength(1);
    for (const bounds of received) {
      const bound = Option.getOrThrow(bounds.lower);
      expect(QueryStreamKey.layout(bound.orderKey)).toBe(layout);
      expect(QueryStreamKey.values(bound.orderKey)).toBe(values);
    }
  });
});

describe("QueryStream boundary errors", () => {
  it("rejects oversized bounds before constructing a scan", () => {
    const layout = Result.getOrThrow(QueryStreamKeyLayout.fromIndex(["score"]));
    const source = QueryStream.empty<never>()(layout);
    expect(() =>
      QueryStream.narrow(source, {
        start: { orderKey: [3, "id", 4], inclusive: true },
      }),
    ).toThrow(QueryStreamKey.KeyWidthMismatchError);
  });

  const layout = Result.getOrThrowWith(
    QueryStreamKeyLayout.fromIndex([]),
    identity,
  );

  it("preserves the layout errors when stream arguments are invalid", () => {
    const fieldPaths: ReadonlyArray<string> = ["text"];
    const source = QueryStream.empty<string>()(
      Result.getOrThrowWith(
        QueryStreamKeyLayout.fromIndex(fieldPaths),
        identity,
      ),
    );
    const prefix: ReadonlyArray<string> = ["missing"];
    const replacement: ReadonlyArray<string> = [];
    expect(() => QueryStream.distinct(source, prefix)).toThrow(
      QueryStreamKeyLayout.InvalidLabelPrefixError,
    );
    expect(() => QueryStream.renameKey(source, replacement)).toThrow(
      QueryStreamKeyLayout.LabelCountMismatchError,
    );
  });

  it("throws a named error when a reversal recipe is absent", () => {
    const source = new QueryStream.QueryStream("asc", layout, Stream.empty);
    expect(() => QueryStream.reverse(source)).toThrow(
      QueryStream.MissingReversalRecipeError,
    );
  });

  it.effect("preserves the named defect for a zero-sized initial page", () =>
    Effect.gen(function* () {
      const source = QueryStream.empty<string>()(layout);
      const defect = yield* QueryStream.paginate(source, {
        numItems: 0,
        cursor: null,
      }).pipe(Effect.catchDefect(Effect.succeed));
      expect(defect).toBeInstanceOf(QueryStream.EmptyInitialPageError);
    }),
  );
});

describe("QueryStream.ReadBudgetExceededError", () => {
  it.each(["rowsRead", "bytesRead"] as const)(
    "rejects invalid %s counts",
    (field) => {
      for (const value of [
        -1,
        0.5,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
      ]) {
        expect(
          Option.isNone(
            QueryStream.ReadBudgetExceededError.makeOption({
              rowsRead: 0,
              bytesRead: 0,
              [field]: value,
            }),
          ),
        ).toBe(true);
      }
    },
  );

  it("accepts zero row and byte counts", () => {
    expect(
      new QueryStream.ReadBudgetExceededError({
        rowsRead: 0,
        bytesRead: 0,
      }),
    ).toMatchObject({ rowsRead: 0, bytesRead: 0 });
  });

  it("preserves the pagination error tag and details", () => {
    const error = new QueryStream.ReadBudgetExceededError({
      rowsRead: 2,
      bytesRead: 20,
    });
    expect(error._tag).toBe("ReadBudgetExceededError");
    expect(error.rowsRead).toBe(2);
    expect(error.bytesRead).toBe(20);
    expect(error.message).toContain("before a safe page boundary");
    expect(error.message).not.toContain("QueryStream.paginate");
  });
});
