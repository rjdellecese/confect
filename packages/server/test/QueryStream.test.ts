import * as QueryStreamCursor from "@confect/server/QueryStreamCursor";
import * as QueryStream from "@confect/server/QueryStream";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import { ConvexError } from "convex/values";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

describe("QueryStream type parameters", () => {
  it("accepts direction third and defaults errors and requirements to never", () => {
    const source = new QueryStream.QueryStream<number, ["_id"], "desc">(
      "desc",
      ["_id"],
      Stream.empty,
    );

    expect(source.order).toBe("desc");
    expectTypeOf(source.toStream()).toEqualTypeOf<Stream.Stream<number>>();
    expectTypeOf<QueryStream.QueryStream<number, ["_id"]>>().toEqualTypeOf<
      QueryStream.QueryStream<number, ["_id"], QueryStream.OrderDirection>
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

describe("QueryStream.RangeOp", () => {
  it.each(["eq", "gt", "gte", "lt", "lte"] as const)(
    "constructs %s operations with the existing record shape",
    (tag) => {
      expect(
        QueryStream.RangeOp[tag]({ field: "text", value: "hello" }),
      ).toEqual({
        _tag: tag,
        field: "text",
        value: "hello",
      });
      expect(
        QueryStream.RangeOp[tag]({ field: "text", value: undefined }).value,
      ).toBeUndefined();
    },
  );

  it("constructs precisely tagged operations", () => {
    const op = QueryStream.RangeOp.eq({ field: "text", value: "hello" });
    expectTypeOf(op._tag).toEqualTypeOf<"eq">();
    expect(QueryStream.RangeOp.$is("eq")(op)).toBe(true);
  });
});

describe("QueryStream.Element", () => {
  it("constructs an element with an inferred document type and readonly fields", () => {
    const doc = Option.some({ text: "hello" });
    const key: QueryStreamCursor.OrderKey = ["hello", 1, "id"];
    const element = new QueryStream.Element({ doc, key });

    expectTypeOf(element).toEqualTypeOf<
      QueryStream.Element<{ text: string }>
    >();
    expectTypeOf(element).toExtend<{
      readonly doc: Option.Option<{ text: string }>;
      readonly key: QueryStreamCursor.OrderKey;
    }>();
    expect(element.doc).toBe(doc);
    expect(element.key).toBe(key);
    expect(element.pipe((value) => Option.isSome(value.doc))).toBe(true);
  });

  it("constructs a filtered-out element without losing its order key", () => {
    const key: QueryStreamCursor.OrderKey = [undefined, "id"];
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
            ["_id"],
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
              ? QueryStreamCursor.serialize([values[1]], source.keyFields)
              : null,
            ...(end
              ? {
                  endCursor: QueryStreamCursor.serialize(
                    [values[3]],
                    source.keyFields,
                  ),
                }
              : {}),
            numItems: 10,
          });

          expect(result.page).toEqual(values.slice(start ? 2 : 0, end ? 4 : 5));
          expect(result.isDone).toBe(!end);
          expect(result.continueCursor).toBe(
            end
              ? QueryStreamCursor.serialize([values[3]], source.keyFields)
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
            ["text", "_creationTime", "_id"],
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
            QueryStreamCursor.serialize(
              ["apple", 1, "id"],
              ["body", "_creationTime", "_id"],
            ),
            QueryStreamCursor.serialize(
              ["apple", 1, "id"],
              ["_creationTime", "text", "_id"],
            ),
          ]) {
            for (const numItems of [0, 1]) {
              const result = yield* QueryStream.paginate(source, {
                cursor: QueryStreamCursor.serialize(
                  ["apple", 0, "before"],
                  source.keyFields,
                ),
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
          ["text", "_creationTime", "_id"],
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
          QueryStreamCursor.deserialize(first.continueCursor, source.keyFields),
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
          ["_id"],
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
    ["_id"],
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
