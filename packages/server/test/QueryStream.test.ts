import * as QueryStreamKeyFields from "@confect/server/QueryStreamKeyFields";
import type * as QueryStreamOrderDirection from "@confect/server/QueryStreamOrderDirection";
import type * as QueryStreamOrderKey from "@confect/server/QueryStreamOrderKey";
import * as QueryStreamCursor from "@confect/server/QueryStreamCursor";
import * as QueryStream from "@confect/server/QueryStream";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import { ConvexError } from "convex/values";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

describe("QueryStream type parameters", () => {
  it("accepts direction third and defaults errors and requirements to never", () => {
    const source = new QueryStream.QueryStream<number, ["_id"], "desc">(
      "desc",
      QueryStreamKeyFields.fromIndex([]),
      Stream.empty,
    );

    expect(source.order).toBe("desc");
    expectTypeOf(source.toStream()).toEqualTypeOf<Stream.Stream<number>>();
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
            QueryStreamKeyFields.fromIndex([]),
            Stream.fromIterable(
              ranks.map(
                (rank) =>
                  new QueryStream.Element({
                    doc: Option.some(`${label}:${rank}`),
                    key: [rank],
                  }),
              ),
            ),
          );
        const ascending = direction === "asc";
        const result = yield* Stream.runCollect(
          QueryStream.merge([
            source("left", ascending ? [1, 2, 2, 5] : [5, 2, 2, 1]),
            source("right", ascending ? [0, 2, 3, 4, 6] : [6, 4, 3, 2, 0]),
            QueryStream.empty<string>()([], direction),
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

describe("QueryStream.Element", () => {
  it("constructs an element with an inferred document type and readonly fields", () => {
    const doc = Option.some({ text: "hello" });
    const key: QueryStreamOrderKey.QueryStreamOrderKey = ["hello", 1, "id"];
    const element = new QueryStream.Element({ doc, key });

    expectTypeOf(element).toEqualTypeOf<
      QueryStream.Element<{ text: string }>
    >();
    expectTypeOf(element).toExtend<{
      readonly doc: Option.Option<{ text: string }>;
      readonly key: QueryStreamOrderKey.QueryStreamOrderKey;
    }>();
    expect(element.doc).toBe(doc);
    expect(element.key).toBe(key);
    expect(element.pipe((value) => Option.isSome(value.doc))).toBe(true);
  });

  it("constructs a filtered-out element without losing its order key", () => {
    const key: QueryStreamOrderKey.QueryStreamOrderKey = [undefined, "id"];
    const element = new QueryStream.Element({ doc: Option.none(), key });

    expectTypeOf(element).toEqualTypeOf<QueryStream.Element<never>>();
    expect(element.doc).toEqual(Option.none());
    expect(element.key).toBe(key);
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
            QueryStreamKeyFields.fromIndex([]),
            Stream.fromIterable(
              values.map(
                (value) =>
                  new QueryStream.Element({
                    doc: Option.some(value),
                    key: [value],
                  }),
              ),
            ),
          );
          const result = yield* QueryStream.paginate(source, {
            cursor: start
              ? yield* Schema.encodeEffect(
                  QueryStreamCursor.codecForKeyFields(source.keyFields),
                )([values[1]])
              : null,
            ...(end
              ? {
                  endCursor: yield* Schema.encodeEffect(
                    QueryStreamCursor.codecForKeyFields(source.keyFields),
                  )([values[3]]),
                }
              : {}),
            numItems: 10,
          });

          expect(result.page).toEqual(values.slice(start ? 2 : 0, end ? 4 : 5));
          expect(result.isDone).toBe(!end);
          expect(result.continueCursor).toBe(
            end
              ? yield* Schema.encodeEffect(
                  QueryStreamCursor.codecForKeyFields(source.keyFields),
                )([values[3]])
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
            QueryStreamKeyFields.fromIndex(["text", "_creationTime"]),
            Stream.fromEffect(
              Effect.sync(() => {
                reads++;
                return new QueryStream.Element({
                  doc: Option.some("apple"),
                  key: ["apple", 1, "id"],
                });
              }),
            ),
          );

          for (const cursor of [
            '["apple",1,"id"]',
            yield* Schema.encodeEffect(
              QueryStreamCursor.codecForKeyFields([
                "body",
                "_creationTime",
                "_id",
              ]),
            )(["apple", 1, "id"]),
            yield* Schema.encodeEffect(
              QueryStreamCursor.codecForKeyFields([
                "_creationTime",
                "text",
                "_id",
              ]),
            )(["apple", 1, "id"]),
          ]) {
            for (const numItems of [0, 1]) {
              const result = yield* QueryStream.paginate(source, {
                cursor: yield* Schema.encodeEffect(
                  QueryStreamCursor.codecForKeyFields(source.keyFields),
                )(["apple", 0, "before"]),
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
          QueryStreamKeyFields.fromIndex(["text", "_creationTime"]),
          Stream.fromIterable(
            ids.map(
              (id) =>
                new QueryStream.Element({
                  doc: Option.some(id),
                  key: ["apple", 1, id],
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
          yield* Schema.decodeEffect(
            QueryStreamCursor.codecForKeyFields(source.keyFields),
          )(first.continueCursor),
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
          QueryStreamKeyFields.fromIndex([]),
          Stream.make(
            new QueryStream.Element({ doc: Option.some(1), key: [1] }),
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
    new QueryStream.Element({ doc: Option.some(1), key: [1] }),
    new QueryStream.Element({ doc: Option.none<number>(), key: [2] }),
    new QueryStream.Element({ doc: Option.some(3), key: [3] }),
  ];
  const source = new QueryStream.QueryStream(
    "asc",
    QueryStreamKeyFields.fromIndex([]),
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
        const result = yield* Stream.runCollect(transformed.annotated);

        expect(result).toEqual([
          new QueryStream.Element({ doc: Option.none(), key: [1] }),
          new QueryStream.Element({ doc: Option.none(), key: [2] }),
          new QueryStream.Element({ doc: Option.some("3"), key: [3] }),
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
        const result = yield* Stream.runCollect(transformed.annotated);

        expect(visited).toEqual([1, 3]);
        expect(result).toEqual([
          new QueryStream.Element({ doc: Option.some("1"), key: [1] }),
          new QueryStream.Element({ doc: Option.none(), key: [2] }),
          new QueryStream.Element({ doc: Option.some("3"), key: [3] }),
        ]);
        for (const element of result) {
          expect(element).toBeInstanceOf(QueryStream.Element);
        }
      }),
  );
});
