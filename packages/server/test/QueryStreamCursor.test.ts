import { identity } from "effect/Function";
import * as QueryStreamKeyLabels from "@confect/server/QueryStreamKeyLabels";
import * as QueryStreamKeyLayout from "@confect/server/QueryStreamKeyLayout";
import * as QueryStreamOrderKey from "@confect/server/QueryStreamOrderKey";
import * as QueryStreamCursor from "@confect/server/QueryStreamCursor";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

describe("QueryStreamCursor schema", () => {
  it("defines the cursor envelope and its JSON codec", () => {
    const cursor = Schema.decodeSync(QueryStreamCursor.QueryStreamCursor)({
      version: 1,
      keyFields: ["text", "_creationTime", "_id"],
      orderKey: ["apple", 1, "id"],
    });

    const serialized = Schema.encodeSync(QueryStreamCursor.Json)(cursor);

    expect(cursor).toBeInstanceOf(QueryStreamCursor.QueryStreamCursor);
    expectTypeOf(cursor).toEqualTypeOf<QueryStreamCursor.QueryStreamCursor>();
    expectTypeOf<QueryStreamCursor.QueryStreamCursor>().toEqualTypeOf<{
      readonly version: 1;
      readonly keyFields: ReadonlyArray<string>;
      readonly orderKey: QueryStreamOrderKey.QueryStreamOrderKey;
    }>();
    expect(Schema.decodeSync(QueryStreamCursor.Json)(serialized)).toEqual(
      cursor,
    );
    expect(
      Schema.decodeSync(QueryStreamCursor.Json)(serialized),
    ).toBeInstanceOf(QueryStreamCursor.QueryStreamCursor);
    expect(serialized).toBe(
      Schema.encodeSync(
        QueryStreamCursor.codecForLayout(
          Result.getOrThrowWith(
            QueryStreamKeyLayout.fromIndex(["text", "_creationTime"]),
            identity,
          ),
        ),
      )(["apple", 1, "id"]),
    );
  });

  it("validates the key layout during class construction", () => {
    expect(
      () =>
        new QueryStreamCursor.QueryStreamCursor({
          version: 1,
          keyFields: ["text"],
          orderKey: [],
        }),
    ).toThrow("Schema validation failed");
  });

  it.each([
    null,
    [],
    { version: 2, keyFields: ["text"], orderKey: ["apple"] },
    { version: 1, keyFields: [1], orderKey: ["apple"] },
    { version: 1, keyFields: ["text"], orderKey: [] },
    { version: 1, keyFields: ["text"], orderKey: [undefined] },
    { version: 1, keyFields: ["text"], orderKey: [{ $integer: "invalid" }] },
    { version: 1, keyFields: ["text"], orderKey: [{ $undefined: false }] },
    {
      version: 1,
      keyFields: ["text"],
      orderKey: [{ $undefined: true, extra: 1 }],
    },
  ])("rejects an invalid envelope through the schema: %j", (input) => {
    expect(
      Result.isFailure(
        Schema.decodeUnknownResult(
          Schema.toCodecJson(QueryStreamCursor.QueryStreamCursor),
        )(input),
      ),
    ).toBe(true);
  });
});

describe("QueryStreamCursor serialization", () => {
  it("round-trips Convex values and missing fields with their layout", () => {
    const key: QueryStreamOrderKey.QueryStreamOrderKey = [
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

    const fieldPaths = key.map((_, index) =>
      index === key.length - 1 ? "_id" : `field${index}`,
    );

    const layout = Result.getOrThrowWith(
      QueryStreamKeyLayout.fromIndex(fieldPaths),
      identity,
    );

    const cursor = Schema.encodeSync(QueryStreamCursor.codecForLayout(layout))(
      key,
    );

    expect(Schema.is(QueryStreamOrderKey.QueryStreamOrderKey)(key)).toBe(true);
    expect(JSON.parse(cursor)).toMatchObject({
      version: 1,
      keyFields: fieldPaths,
    });
    expect(Schema.decodeSync(QueryStreamCursor.Json)(cursor).orderKey).toEqual(
      key,
    );
    expect(
      Schema.decodeSync(QueryStreamCursor.codecForLayout(layout))(cursor),
    ).toEqual(key);
  });

  it("serializes aliases and every implicit ID without changing the cursor envelope", () => {
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

    const codec = QueryStreamCursor.codecForLayout(layout);
    const key = [123, "outer-id", "hello", "inner-id"];
    const encoded = Schema.encodeSync(codec)(key);
    expect(JSON.parse(encoded)).toEqual({
      version: 1,
      keyFields: ["created", "_id", "body", "_id"],
      orderKey: key,
    });
    expect(Schema.decodeSync(codec)(encoded)).toEqual(key);
  });

  it("preserves the existing wire projection for explicit and implicit ID labels", () => {
    const explicit = Result.getOrThrowWith(
      QueryStreamKeyLayout.fromIndex(["_id"]),
      identity,
    );

    const implicit = Result.getOrThrowWith(
      QueryStreamKeyLayout.fromIndex([]),
      identity,
    );

    expect(QueryStreamKeyLayout.compatible(explicit, implicit)).toBe(false);

    const serialized = Schema.encodeSync(
      QueryStreamCursor.codecForLayout(explicit),
    )(["id"]);

    expect(
      Schema.encodeSync(QueryStreamCursor.codecForLayout(implicit))(["id"]),
    ).toBe(serialized);
  });

  it("rejects serialization with mismatched key and field lengths", () => {
    expect(() =>
      Schema.encodeSync(
        QueryStreamCursor.codecForLayout(
          Result.getOrThrowWith(
            QueryStreamKeyLayout.fromIndex(["_id"], 1),
            identity,
          ),
        ),
      )([1]),
    ).toThrow("key and fields must have the same length");
  });

  it.each([
    "not-json",
    "null",
    "[]",
    '["apple",1,"id"]',
    '{"keyFields":["text"],"orderKey":["apple"]}',
    '{"version":2,"keyFields":["text"],"orderKey":["apple"]}',
    '{"version":1,"keyFields":"text","orderKey":["apple"]}',
    '{"version":1,"keyFields":[1],"orderKey":["apple"]}',
    '{"version":1,"keyFields":["text"],"orderKey":"apple"}',
    '{"version":1,"keyFields":["text"],"orderKey":[]}',
    '{"version":1,"keyFields":["text"],"orderKey":[{"$integer":"invalid"}]}',
  ])("rejects malformed or unsupported cursor %s", (cursor) => {
    expect(
      () => Schema.decodeSync(QueryStreamCursor.Json)(cursor).orderKey,
    ).toThrow(Schema.SchemaError);
  });

  it("validates field names and their order, not just their count", () => {
    const cursor = Schema.encodeSync(
      QueryStreamCursor.codecForLayout(
        Result.getOrThrowWith(
          QueryStreamKeyLayout.fromIndex(["text", "_creationTime"]),
          identity,
        ),
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
        Schema.decodeSync(QueryStreamCursor.codecForLayout(layout))(cursor),
      ).toThrow(Schema.SchemaError);
    }
  });

  it("distinguishes an empty order key from the end sentinel", () => {
    const cursor = Schema.encodeSync(
      QueryStreamCursor.codecForLayout(
        Result.getOrThrowWith(
          QueryStreamKeyLayout.fromIndex(["_id"], 1),
          identity,
        ),
      ),
    )([]);

    expect(cursor).not.toBe(QueryStreamCursor.END_CURSOR);
    expect(
      Schema.decodeSync(
        QueryStreamCursor.codecForLayout(
          Result.getOrThrowWith(
            QueryStreamKeyLayout.fromIndex(["_id"], 1),
            identity,
          ),
        ),
      )(cursor),
    ).toEqual([]);
  });

  it.effect(
    "round-trips native cursor values through the standard effectful schema APIs",
    () =>
      Effect.gen(function* () {
        const value = yield* QueryStreamCursor.QueryStreamCursor.makeEffect({
          version: 1,
          keyFields: ["optional", "integer", "bytes"],
          orderKey: [undefined, 42n, new Uint8Array([1, 2]).buffer],
        });

        const encoded = yield* Schema.encodeEffect(QueryStreamCursor.Json)(
          value,
        );

        const decoded = yield* Schema.decodeEffect(QueryStreamCursor.Json)(
          encoded,
        );

        expect(decoded).toEqual(value);

        const wire = yield* Schema.decodeEffect(
          Schema.fromJsonString(Schema.Json),
        )(encoded);

        expect(wire).toEqual({
          version: 1,
          keyFields: value.keyFields,
          orderKey: [
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

        const bound = QueryStreamCursor.codecForLayout(layout);
        expectTypeOf<
          typeof bound.Type
        >().toEqualTypeOf<QueryStreamOrderKey.QueryStreamOrderKey>();
        expectTypeOf<typeof bound.Encoded>().toEqualTypeOf<string>();
        expect(yield* Schema.decodeEffect(bound)(encoded)).toEqual(
          value.orderKey,
        );
        expect(yield* Schema.encodeEffect(bound)(value.orderKey)).toBe(encoded);
      }),
  );
});
