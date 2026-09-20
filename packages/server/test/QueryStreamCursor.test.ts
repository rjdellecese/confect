import { identity } from "effect/Function";
import * as QueryStreamKey from "@confect/server/QueryStreamKey";
import * as QueryStreamKeyLabels from "@confect/server/QueryStreamKeyLabels";
import * as QueryStreamKeyLayout from "@confect/server/QueryStreamKeyLayout";
import * as QueryStreamKeyValues from "@confect/server/QueryStreamKeyValues";
import * as QueryStreamCursor from "@confect/server/QueryStreamCursor";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";

const complete = (
  layout: QueryStreamKeyLayout.QueryStreamKeyLayout,
  values: QueryStreamKeyValues.QueryStreamKeyValues,
) => Result.getOrThrowWith(QueryStreamKey.complete(layout, values), identity);
const encodeCursor =
  (layout: QueryStreamKeyLayout.QueryStreamKeyLayout) =>
  (values: QueryStreamKeyValues.QueryStreamKeyValues) =>
    Schema.encodeSync(QueryStreamCursor.fromKeyLayout(layout))(
      complete(layout, values),
    );

describe("QueryStreamCursor schema", () => {
  it("defines the cursor envelope and its JSON codec", () => {
    const cursor = Schema.decodeSync(QueryStreamCursor.QueryStreamCursor)({
      runtimeLabels: ["text", "_creationTime", "_id"],
      keyValues: ["apple", 1, "id"],
    });
    const encoded = Schema.encodeSync(QueryStreamCursor.QueryStreamCursor)(
      cursor,
    );
    expect(encoded).toEqual({
      runtimeLabels: ["text", "_creationTime", "_id"],
      keyValues: ["apple", 1, "id"],
    });
    expect(
      Schema.decodeSync(QueryStreamCursor.QueryStreamCursor)(encoded),
    ).toEqual(cursor);
    expectTypeOf<
      typeof QueryStreamCursor.QueryStreamCursor.Encoded
    >().toEqualTypeOf<{
      readonly runtimeLabels: ReadonlyArray<string>;
      readonly keyValues: ReadonlyArray<Schema.Json>;
    }>();
    const serialized = Schema.encodeSync(
      Schema.fromJsonString(QueryStreamCursor.QueryStreamCursor),
    )(cursor);
    const serializedCursor =
      '{"runtimeLabels":["text","_creationTime","_id"],"keyValues":["apple",1,"id"]}';
    expect(serialized).toBe(serializedCursor);
    expect(
      Schema.decodeSync(
        Schema.fromJsonString(QueryStreamCursor.QueryStreamCursor),
      )(serializedCursor),
    ).toEqual(cursor);

    expect(cursor).toEqual({
      runtimeLabels: ["text", "_creationTime", "_id"],
      keyValues: ["apple", 1, "id"],
    });
    expectTypeOf(cursor).toEqualTypeOf<QueryStreamCursor.QueryStreamCursor>();
    expectTypeOf<QueryStreamCursor.QueryStreamCursor>().toEqualTypeOf<{
      readonly runtimeLabels: ReadonlyArray<string>;
      readonly keyValues: QueryStreamKeyValues.QueryStreamKeyValues;
    }>();
    expect(
      Schema.decodeSync(
        Schema.fromJsonString(QueryStreamCursor.QueryStreamCursor),
      )(serialized),
    ).toEqual(cursor);
    expect(serialized).toBe(
      encodeCursor(
        Result.getOrThrowWith(
          QueryStreamKeyLayout.fromIndex(["text", "_creationTime"]),
          identity,
        ),
      )(["apple", 1, "id"]),
    );
  });

  it.effect("checks runtime label and value counts during construction", () =>
    Effect.gen(function* () {
      const error = yield* QueryStreamCursor.QueryStreamCursor.makeEffect({
        runtimeLabels: ["text"],
        keyValues: [],
      }).pipe(Effect.flip);
      expect(SchemaIssue.isIssue(error)).toBe(true);
    }),
  );

  it.each([
    null,
    [],
    { runtimeLabels: [1], keyValues: ["apple"] },
    { runtimeLabels: ["text"], keyValues: [] },
    { runtimeLabels: ["text"], keyValues: [undefined] },
    {
      runtimeLabels: ["text"],
      keyValues: [{ $integer: "invalid" }],
    },
    { runtimeLabels: ["text"], keyValues: [{ $undefined: false }] },
    {
      runtimeLabels: ["text"],
      keyValues: [{ $undefined: true, extra: 1 }],
    },
  ])("rejects an invalid envelope through the schema: %j", (input) => {
    expect(
      Result.isFailure(
        Schema.decodeUnknownResult(QueryStreamCursor.QueryStreamCursor)(input),
      ),
    ).toBe(true);
  });
});

describe("QueryStreamCursor serialization", () => {
  it("round-trips Convex values and missing fields with their layout", () => {
    const keyValues: QueryStreamKeyValues.QueryStreamKeyValues = [
      undefined,
      null,
      true,
      "apple",
      1,
      2n,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      new Uint8Array([1, 2, 3]).buffer,
      ["nested"],
      { nested: "value" },
    ];
    const fieldPaths = keyValues.map((_, index) =>
      index === keyValues.length - 1 ? "_id" : `field${index}`,
    );
    const layout = Result.getOrThrowWith(
      QueryStreamKeyLayout.fromIndex(fieldPaths),
      identity,
    );
    const cursor = encodeCursor(layout)(keyValues);

    expect(
      Schema.is(QueryStreamKeyValues.QueryStreamKeyValues)(keyValues),
    ).toBe(true);
    expect(JSON.parse(cursor)).toMatchObject({
      runtimeLabels: fieldPaths,
    });
    expect(
      Schema.decodeSync(
        Schema.fromJsonString(QueryStreamCursor.QueryStreamCursor),
      )(cursor).keyValues,
    ).toEqual(keyValues);
    expect(
      QueryStreamKey.values(
        Schema.decodeSync(QueryStreamCursor.fromKeyLayout(layout))(cursor),
      ),
    ).toEqual(keyValues);
  });

  it("serializes aliases and every implicit ID", () => {
    const layout = Result.getOrThrow(
      QueryStreamKeyLayout.rename(
        QueryStreamKeyLayout.concat(
          Result.getOrThrowWith(
            QueryStreamKeyLayout.fromIndex(["author.role", "_creationTime"], 1),
            identity,
          ),
          Result.getOrThrowWith(
            QueryStreamKeyLayout.fromIndex(["text"]),
            identity,
          ),
        ),
        QueryStreamKeyLabels.make(["created", "body"]),
      ),
    );
    const codec = QueryStreamCursor.fromKeyLayout(layout);
    const keyValues = [123, "outer-id", "hello", "inner-id"];
    const encoded = Schema.encodeSync(codec)(complete(layout, keyValues));
    expect(JSON.parse(encoded)).toEqual({
      runtimeLabels: ["created", "_id", "body", "_id"],
      keyValues: keyValues,
    });
    expect(QueryStreamKey.values(Schema.decodeSync(codec)(encoded))).toEqual(
      keyValues,
    );
  });

  it("projects explicit and implicit ID positions to the same cursor label", () => {
    const explicit = Result.getOrThrowWith(
      QueryStreamKeyLayout.fromIndex(["_id"]),
      identity,
    );
    const implicit = Result.getOrThrowWith(
      QueryStreamKeyLayout.fromIndex([]),
      identity,
    );
    expect(QueryStreamKeyLayout.Equivalence(explicit, implicit)).toBe(false);
    const serialized = encodeCursor(explicit)(["id"]);
    expect(encodeCursor(implicit)(["id"])).toBe(serialized);
  });

  it("requires a complete key belonging to the encoder's layout", () => {
    const layout = Result.getOrThrow(QueryStreamKeyLayout.fromIndex(["text"]));
    const other = Result.getOrThrow(QueryStreamKeyLayout.fromIndex(["body"]));
    const codec = QueryStreamCursor.fromKeyLayout(layout);
    const encode = Schema.encodeSync(codec);
    expectTypeOf(encode).parameter(0).toEqualTypeOf<QueryStreamKey.Complete>();
    expect(() => encode(complete(other, ["hello", "id"]))).toThrow(
      "Cursor key does not belong to the stream layout",
    );
    expect(
      Result.isFailure(Schema.encodeUnknownResult(codec)(["hello", "id"])),
    ).toBe(true);
    const decoded = Schema.decodeSync(codec)(
      encode(complete(layout, ["hello", "id"])),
    );
    expect(QueryStreamKey.layout(decoded)).toBe(layout);
    expect(QueryStreamKey.values(decoded)).toEqual(["hello", "id"]);
  });

  it.each([
    "not-json",
    "null",
    "[]",
    '["apple",1,"id"]',
    '{"runtimeLabels":["text"]}',
    '{"runtimeLabels":"text","keyValues":["apple"]}',
    '{"runtimeLabels":[1],"keyValues":["apple"]}',
    '{"runtimeLabels":["text"],"keyValues":"apple"}',
    '{"runtimeLabels":["text"],"keyValues":[]}',
    '{"runtimeLabels":["text"],"keyValues":[{"$integer":"invalid"}]}',
  ])("rejects malformed cursor %s", (cursor) => {
    expect(
      () =>
        Schema.decodeSync(
          Schema.fromJsonString(QueryStreamCursor.QueryStreamCursor),
        )(cursor).keyValues,
    ).toThrow(Schema.SchemaError);
  });

  it("validates runtime labels and their order, not just their count", () => {
    const cursor = encodeCursor(
      Result.getOrThrowWith(
        QueryStreamKeyLayout.fromIndex(["text", "_creationTime"]),
        identity,
      ),
    )(["apple", 1, "id"]);

    for (const layout of [
      Result.getOrThrowWith(
        QueryStreamKeyLayout.fromIndex(["body", "_creationTime"]),
        identity,
      ),
      Result.getOrThrowWith(
        QueryStreamKeyLayout.fromIndex(["_creationTime", "text"]),
        identity,
      ),
      Result.getOrThrowWith(QueryStreamKeyLayout.fromIndex(["text"]), identity),
    ]) {
      expect(() =>
        QueryStreamKey.values(
          Schema.decodeSync(QueryStreamCursor.fromKeyLayout(layout))(cursor),
        ),
      ).toThrow(Schema.SchemaError);
    }
  });

  it("distinguishes an empty key from the end sentinel", () => {
    const cursor = encodeCursor(
      Result.getOrThrowWith(
        QueryStreamKeyLayout.fromIndex(["_id"], 1),
        identity,
      ),
    )([]);

    expect(cursor).not.toBe(QueryStreamCursor.END_CURSOR);
    expect(
      QueryStreamKey.values(
        Schema.decodeSync(
          QueryStreamCursor.fromKeyLayout(
            Result.getOrThrowWith(
              QueryStreamKeyLayout.fromIndex(["_id"], 1),
              identity,
            ),
          ),
        )(cursor),
      ),
    ).toEqual([]);
  });

  it.effect(
    "round-trips native cursor values through the standard effectful schema APIs",
    () =>
      Effect.gen(function* () {
        const value = yield* QueryStreamCursor.QueryStreamCursor.makeEffect({
          runtimeLabels: ["optional", "integer", "bytes"],
          keyValues: [undefined, 42n, new Uint8Array([1, 2]).buffer],
        });
        const encoded = yield* Schema.encodeEffect(
          QueryStreamCursor.QueryStreamCursor,
        )(value);
        const decoded = yield* Schema.decodeEffect(
          QueryStreamCursor.QueryStreamCursor,
        )(encoded);
        expect(decoded).toEqual(value);
        expect(encoded).toEqual({
          runtimeLabels: value.runtimeLabels,
          keyValues: [
            { $undefined: true },
            { $integer: "KgAAAAAAAAA=" },
            { $bytes: "AQI=" },
          ],
        });

        const layout = Result.getOrThrow(
          QueryStreamKeyLayout.rename(
            Result.getOrThrowWith(
              QueryStreamKeyLayout.fromIndex(["optional", "integer", "_id"]),
              identity,
            ),
            QueryStreamKeyLabels.make(["optional", "integer", "bytes"]),
          ),
        );
        const serialized = yield* Schema.encodeEffect(
          Schema.fromJsonString(QueryStreamCursor.QueryStreamCursor),
        )(value);
        const bound = QueryStreamCursor.fromKeyLayout(layout);
        expectTypeOf<
          typeof bound.Type
        >().toEqualTypeOf<QueryStreamKey.Complete>();
        expectTypeOf<typeof bound.Encoded>().toEqualTypeOf<string>();
        expect(
          QueryStreamKey.values(yield* Schema.decodeEffect(bound)(serialized)),
        ).toEqual(value.keyValues);
        expect(
          yield* Schema.encodeEffect(bound)(complete(layout, value.keyValues)),
        ).toBe(serialized);
      }),
  );
});
