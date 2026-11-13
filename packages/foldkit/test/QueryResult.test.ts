import { describe, expect, expectTypeOf, it, test } from "@effect/vitest";
import { QueryResult as PublicQueryResult } from "@confect/foldkit";
import * as QueryResult from "@confect/foldkit/QueryResult";
import { pipe } from "effect/Function";
import * as Array from "effect/Array";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Equal from "effect/Equal";
import * as Hash from "effect/Hash";
import * as HashSet from "effect/HashSet";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as SchemaGetter from "effect/SchemaGetter";

describe("constructors", () => {
  test("exports the same module through the package root", () => {
    expect(PublicQueryResult.QueryResult).toBe(QueryResult.QueryResult);
  });

  test("constructs loading without subscription state", () => {
    expect(QueryResult.load()).toEqual({ _tag: "Loading" });
    expectTypeOf(QueryResult.load()).toEqualTypeOf<QueryResult.Loading>();
    expectTypeOf(QueryResult.load).parameters.toEqualTypeOf<[]>();
  });

  test("preserves payloads and does not modify inputs", () => {
    const value = { notes: ["one"] };
    const error = { message: "denied" };
    const success = QueryResult.succeed(value);
    const failure = QueryResult.fail(error);

    expect(success).toEqual({ _tag: "Success", value });
    expect(failure).toEqual({ _tag: "Failure", error });
    expect(success.value).toBe(value);
    expect(failure.error).toBe(error);
    expect(value).toEqual({ notes: ["one"] });
    expect(error).toEqual({ message: "denied" });
    expect(Object.isFrozen(value)).toBe(false);
    expect(Object.isFrozen(error)).toBe(false);
  });
});

describe("Effect protocols", () => {
  test("identifies only Foldkit query result values", () => {
    expect(QueryResult.isQueryResult(QueryResult.load())).toBe(true);
    expect(QueryResult.isQueryResult(QueryResult.succeed(1))).toBe(true);
    expect(QueryResult.isQueryResult(QueryResult.fail("denied"))).toBe(true);
    expect(QueryResult.isQueryResult({ _tag: "Loading" })).toBe(false);
    expect(QueryResult.isQueryResult({ _tag: "Success", value: 1 })).toBe(
      false,
    );
    expect(QueryResult.isQueryResult(null)).toBe(false);
    expect(QueryResult.isQueryResult(undefined)).toBe(false);
    expect(QueryResult.isQueryResult(Result.succeed(1))).toBe(false);
  });

  test("supports instance piping for every variant", () => {
    expect(QueryResult.load().pipe(QueryResult.isLoading)).toBe(true);
    expect(
      QueryResult.succeed(21).pipe(
        QueryResult.match({
          onLoading: () => 0,
          onSuccess: (value) => value * 2,
          onFailure: () => 0,
        }),
      ),
    ).toBe(42);
    expect(QueryResult.fail("denied").pipe(QueryResult.isFailure)).toBe(true);
  });

  test("compares tags and delegates payload equality and hashing to Effect", () => {
    const pairs = [
      [QueryResult.load(), QueryResult.load()],
      [
        QueryResult.succeed({ notes: ["one"] }),
        QueryResult.succeed({ notes: ["one"] }),
      ],
      [
        QueryResult.succeed(Result.succeed(1)),
        QueryResult.succeed(Result.succeed(1)),
      ],
      [
        QueryResult.fail(Result.fail("denied")),
        QueryResult.fail(Result.fail("denied")),
      ],
    ] as const;
    for (const [first, second] of pairs) {
      expect(Equal.equals(first, second)).toBe(true);
      expect(Hash.hash(first)).toBe(Hash.hash(second));
      expect(HashSet.size(HashSet.make(first, second))).toBe(1);
    }
    expect(Equal.equals(QueryResult.load(), QueryResult.succeed(1))).toBe(
      false,
    );
    expect(Equal.equals(QueryResult.succeed(1), QueryResult.fail(1))).toBe(
      false,
    );
    expect(Equal.equals(QueryResult.succeed(1), QueryResult.succeed(2))).toBe(
      false,
    );
    expect(Equal.equals(QueryResult.fail(1), QueryResult.fail(2))).toBe(false);
    expect(Equal.equals(QueryResult.load(), Result.succeed(undefined))).toBe(
      false,
    );
    const value = { id: 1 };
    expect(
      Equal.equals(QueryResult.succeed(value), QueryResult.succeed(value)),
    ).toBe(true);
    expect(
      Equal.equals(QueryResult.succeed(value), QueryResult.succeed({ id: 1 })),
    ).toBe(true);
  });
});

describe("predicates", () => {
  test("recognizes and narrows each variant", () => {
    const results: ReadonlyArray<QueryResult.QueryResult<number, string>> = [
      QueryResult.load(),
      QueryResult.succeed(42),
      QueryResult.fail("denied"),
    ];

    expect(Array.map(results, QueryResult.isLoading)).toEqual([
      true,
      false,
      false,
    ]);
    expect(Array.map(results, QueryResult.isSuccess)).toEqual([
      false,
      true,
      false,
    ]);
    expect(Array.map(results, QueryResult.isFailure)).toEqual([
      false,
      false,
      true,
    ]);

    for (const result of results) {
      if (QueryResult.isLoading(result)) {
        expectTypeOf(result).toEqualTypeOf<QueryResult.Loading>();
      }
      if (QueryResult.isSuccess(result)) {
        expectTypeOf(result.value).toEqualTypeOf<number>();
      }
      if (QueryResult.isFailure(result)) {
        expectTypeOf(result.error).toEqualTypeOf<string>();
      }
    }
  });
});

describe("match", () => {
  const handlers = {
    onLoading: () => "loading",
    onSuccess: (value: number) => value * 2,
    onFailure: (error: string) => ({ error }),
  };

  test("matches data-first with a parameter-free loading handler", () => {
    expect(QueryResult.match(QueryResult.load(), handlers)).toBe("loading");
    expect(QueryResult.match(QueryResult.succeed(21), handlers)).toBe(42);
    expect(QueryResult.match(QueryResult.fail("denied"), handlers)).toEqual({
      error: "denied",
    });
  });

  test("matches data-last and infers all handler return types", () => {
    const match = QueryResult.match(handlers);
    expect(match(QueryResult.load())).toBe("loading");
    expect(pipe(QueryResult.succeed(21), match)).toBe(42);
    expect(match(QueryResult.fail("denied"))).toEqual({ error: "denied" });
    expectTypeOf(match).returns.toEqualTypeOf<
      string | number | { error: string }
    >();
    expectTypeOf(match)
      .parameter(0)
      .toEqualTypeOf<QueryResult.QueryResult<number, string>>();
  });
});

describe("QueryResult schema", () => {
  const schema = QueryResult.QueryResult(
    Schema.FiniteFromString,
    Schema.FiniteFromString,
  );

  test("preserves decoded and encoded payload types", () => {
    expectTypeOf<typeof schema.Type>().toEqualTypeOf<
      QueryResult.QueryResult<number, number>
    >();
    expectTypeOf<typeof schema.Encoded>().toEqualTypeOf<
      | { readonly _tag: "Loading" }
      | { readonly _tag: "Success"; readonly value: string }
      | { readonly _tag: "Failure"; readonly error: string }
    >();
  });

  it.effect(
    "round-trips all states through a Model's JSON representation",
    () =>
      Effect.gen(function* () {
        const Model = Schema.Struct({ result: schema });
        const ModelJson = Schema.toCodecJson(Model);
        expect(Schema.toJsonSchemaDocument(ModelJson)).toBeDefined();
        const results: ReadonlyArray<QueryResult.QueryResult<number, number>> =
          [QueryResult.load(), QueryResult.succeed(42), QueryResult.fail(403)];
        const encoded = [
          { result: { _tag: "Loading" } },
          { result: { _tag: "Success", value: "42" } },
          { result: { _tag: "Failure", error: "403" } },
        ];

        for (const [index, result] of results.entries()) {
          const model = Model.make({ result });
          const wire = yield* Schema.encodeEffect(ModelJson)(model);
          expect(wire).toEqual(encoded[index]);
          const json = yield* Schema.encodeEffect(
            Schema.fromJsonString(ModelJson),
          )(model);
          const restored = yield* Schema.decodeEffect(
            Schema.fromJsonString(ModelJson),
          )(json);
          expect(restored).toEqual(model);
          expect(QueryResult.isQueryResult(restored.result)).toBe(true);
          expect(restored.result.pipe(QueryResult.isLoading)).toBe(
            QueryResult.isLoading(result),
          );
          expect(Equal.equals(restored.result, result)).toBe(true);
          expect(Hash.hash(restored.result)).toBe(Hash.hash(result));
          expect(
            QueryResult.match(restored.result, {
              onLoading: () => "loading",
              onSuccess: (value) => value,
              onFailure: (error) => error,
            }),
          ).toEqual(
            QueryResult.match(result, {
              onLoading: () => "loading",
              onSuccess: (value) => value,
              onFailure: (error) => error,
            }),
          );
        }
      }),
  );

  test("rejects unsupported states and malformed payloads", () => {
    for (const input of [
      null,
      { _tag: "Idle" },
      { _tag: "Refreshing", value: "42" },
      { _tag: "Stale", value: "42", error: "403" },
      { _tag: "Success" },
      { _tag: "Success", value: "not a number" },
      { _tag: "Failure" },
      { _tag: "Failure", error: "not a number" },
    ]) {
      expect(Result.isFailure(Schema.decodeUnknownResult(schema)(input))).toBe(
        true,
      );
    }
  });

  test("validates payloads when checking already decoded results", () => {
    const schemaType = Schema.toType(schema);
    expect(Schema.is(schemaType)(QueryResult.succeed(42))).toBe(true);
    expect(Schema.is(schemaType)(QueryResult.fail(403))).toBe(true);
    expect(Schema.is(schemaType)(QueryResult.succeed("42"))).toBe(false);
    expect(Schema.is(schemaType)(QueryResult.fail("403"))).toBe(false);
    expect(Schema.is(schemaType)({ _tag: "Loading" })).toBe(false);
  });

  it.effect("preserves payload codec service requirements", () =>
    Effect.gen(function* () {
      class DecodeOffset extends Context.Service<DecodeOffset, number>()(
        "@confect/foldkit/test/QueryResult.test/DecodeOffset",
      ) {}
      class EncodeOffset extends Context.Service<EncodeOffset, number>()(
        "@confect/foldkit/test/QueryResult.test/EncodeOffset",
      ) {}
      const payload = Schema.Finite.pipe(
        Schema.decodeTo(Schema.Finite, {
          decode: SchemaGetter.transformEffect((value) =>
            Effect.map(DecodeOffset, (offset) => value + offset),
          ),
          encode: SchemaGetter.transformEffect((value) =>
            Effect.map(EncodeOffset, (offset) => value - offset),
          ),
        }),
      );
      const withServices = QueryResult.QueryResult(payload, payload);
      expectTypeOf<
        typeof withServices.DecodingServices
      >().toEqualTypeOf<DecodeOffset>();
      expectTypeOf<
        typeof withServices.EncodingServices
      >().toEqualTypeOf<EncodeOffset>();
      for (const result of [QueryResult.succeed(42), QueryResult.fail(403)]) {
        const encoded = yield* Schema.encodeEffect(withServices)(result).pipe(
          Effect.provideService(EncodeOffset, 1),
        );
        const restored = yield* Schema.decodeEffect(withServices)(encoded).pipe(
          Effect.provideService(DecodeOffset, 1),
        );
        expect(Equal.equals(restored, result)).toBe(true);
        expect(restored.pipe(QueryResult.isLoading)).toBe(false);
      }
    }),
  );
});
