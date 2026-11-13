import { describe, expect, expectTypeOf, it, test } from "@effect/vitest";
import { QueryResult as PublicQueryResult } from "@confect/foldkit";
import * as QueryResult from "@confect/foldkit/QueryResult";
import { pipe } from "effect/Function";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

describe("constructors", () => {
  test("exports the same module through the package root", () => {
    expect(PublicQueryResult.Schema).toBe(QueryResult.Schema);
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

describe("Schema", () => {
  const schema = QueryResult.Schema(
    Schema.FiniteFromString,
    Schema.FiniteFromString,
  );

  test("preserves decoded and encoded payload types", () => {
    expectTypeOf<typeof schema.Type>().toEqualTypeOf<
      QueryResult.QueryResult<number, number>
    >();
    expectTypeOf<typeof schema.Encoded>().toEqualTypeOf<
      QueryResult.QueryResult<string, string>
    >();
  });

  it.effect(
    "round-trips all states through a Model's JSON representation",
    () =>
      Effect.gen(function* () {
        const Model = Schema.Struct({ result: schema });
        const results: ReadonlyArray<QueryResult.QueryResult<number, number>> =
          [QueryResult.load(), QueryResult.succeed(42), QueryResult.fail(403)];
        const encoded = [
          { result: { _tag: "Loading" } },
          { result: { _tag: "Success", value: "42" } },
          { result: { _tag: "Failure", error: "403" } },
        ];

        for (const [index, result] of results.entries()) {
          const model = Model.make({ result });
          const wire = yield* Schema.encodeEffect(Model)(model);
          expect(wire).toEqual(encoded[index]);
          const json = yield* Schema.encodeEffect(Schema.fromJsonString(Model))(
            model,
          );
          const restored = yield* Schema.decodeEffect(
            Schema.fromJsonString(Model),
          )(json);
          expect(restored).toEqual(model);
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
});
