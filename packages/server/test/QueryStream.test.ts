import * as QueryStream from "@confect/server/QueryStream";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

describe("QueryStream.Element", () => {
  it("constructs an element with an inferred document type and readonly fields", () => {
    const doc = Option.some({ text: "hello" });
    const key: QueryStream.OrderKey = ["hello", 1, "id"];
    const element = new QueryStream.Element({ doc, key });

    expectTypeOf(element).toEqualTypeOf<
      QueryStream.Element<{ text: string }>
    >();
    expectTypeOf(element).toExtend<{
      readonly doc: Option.Option<{ text: string }>;
      readonly key: QueryStream.OrderKey;
    }>();
    expect(element.doc).toBe(doc);
    expect(element.key).toBe(key);
    expect(element.pipe((value) => Option.isSome(value.doc))).toBe(true);
  });

  it("constructs a filtered-out element without losing its order key", () => {
    const key: QueryStream.OrderKey = [undefined, "id"];
    const element = new QueryStream.Element({ doc: Option.none(), key });

    expectTypeOf(element).toEqualTypeOf<QueryStream.Element<never>>();
    expect(element.doc).toEqual(Option.none());
    expect(element.key).toBe(key);
  });
});

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
