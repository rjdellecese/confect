import { Equal, Hash, pipe } from "effect";
import { describe, expect, expectTypeOf, test } from "vitest";

import * as QueryResult from "../src/QueryResult";

describe("constructors", () => {
  test("load sets Loading with skipped", () => {
    const a = QueryResult.load(false);
    const b = QueryResult.load(true);

    expect(a._tag).toBe("Loading");
    expect(a.skipped).toBe(false);
    expect(b.skipped).toBe(true);
    expect(QueryResult.isLoading(a)).toBe(true);
    expect(QueryResult.isSuccess(a)).toBe(false);
    expect(QueryResult.isFailure(a)).toBe(false);
  });

  test("succeed sets Success with value", () => {
    const r = QueryResult.succeed(42);

    expect(r._tag).toBe("Success");
    expect(r.value).toBe(42);
    expect(QueryResult.isSuccess(r)).toBe(true);
  });

  test("fail sets Failure with error", () => {
    const err = new Error("boom");
    const r = QueryResult.fail(err);

    expect(r._tag).toBe("Failure");
    expect(r.error).toBe(err);
    expect(QueryResult.isFailure(r)).toBe(true);
  });
});

describe("isQueryResult", () => {
  test("is true for values from constructors", () => {
    expect(QueryResult.isQueryResult(QueryResult.load(false))).toBe(true);
    expect(QueryResult.isQueryResult(QueryResult.succeed(null))).toBe(true);
    expect(QueryResult.isQueryResult(QueryResult.fail("x"))).toBe(true);
  });

  test("is false for plain objects and other values", () => {
    expect(QueryResult.isQueryResult({ _tag: "Loading", skipped: false })).toBe(
      false,
    );
    expect(QueryResult.isQueryResult({ _tag: "Success", value: 1 })).toBe(
      false,
    );
    expect(QueryResult.isQueryResult(null)).toBe(false);
    expect(QueryResult.isQueryResult(undefined)).toBe(false);
  });
});

describe("Equal", () => {
  test("compares same tag and payload", () => {
    expect(Equal.equals(QueryResult.load(false), QueryResult.load(false))).toBe(
      true,
    );
    expect(Equal.equals(QueryResult.load(true), QueryResult.load(false))).toBe(
      false,
    );
    expect(Equal.equals(QueryResult.succeed(1), QueryResult.succeed(1))).toBe(
      true,
    );
    expect(Equal.equals(QueryResult.succeed(1), QueryResult.succeed(2))).toBe(
      false,
    );
    const err = new Error("x");
    expect(Equal.equals(QueryResult.fail(err), QueryResult.fail(err))).toBe(
      true,
    );
    expect(
      Equal.equals(QueryResult.fail(new Error("x")), QueryResult.fail(err)),
    ).toBe(false);
  });

  test("differs across tags for same underlying bits", () => {
    expect(
      Equal.equals(
        QueryResult.load(false) as QueryResult.QueryResult<1, never>,
        QueryResult.succeed(1),
      ),
    ).toBe(false);
  });
});

describe("Hash", () => {
  test("is stable for equal QueryResults", () => {
    const a = QueryResult.succeed(1);
    const b = QueryResult.succeed(1);
    expect(Equal.equals(a, b)).toBe(true);
    expect(Hash.hash(a)).toBe(Hash.hash(b));
  });

  test("differs for unequal variants", () => {
    const a = QueryResult.load(false);
    const b = QueryResult.load(true);
    expect(Hash.hash(a)).not.toBe(Hash.hash(b));
  });
});

describe("pipe", () => {
  test("threads through pipe", () => {
    const r = pipe(
      QueryResult.succeed(2),
      QueryResult.match({
        onLoading: () => 0,
        onSuccess: (n) => n * 3,
      }),
    );
    expect(r).toBe(6);
  });
});

describe("match", () => {
  test("data-first passes skipped, value, and error", () => {
    expect(
      QueryResult.match(QueryResult.load(true), {
        onLoading: (skipped) => skipped,
        onSuccess: () => false,
      }),
    ).toBe(true);

    expect(
      QueryResult.match(QueryResult.succeed("ok"), {
        onLoading: () => "",
        onSuccess: (v) => v,
      }),
    ).toBe("ok");

    const err = new Error("e");
    expect(
      QueryResult.match(QueryResult.fail(err), {
        onLoading: () => null,
        onSuccess: () => null,
        onFailure: (e) => e,
      }),
    ).toBe(err);
  });

  test("data-last applies self last", () => {
    const f = QueryResult.match({
      onLoading: (s) => `L:${s}`,
      onSuccess: (v) => `S:${v}`,
      onFailure: (e) => `F:${String(e)}`,
    });

    expect(f(QueryResult.load(false))).toBe("L:false");
    expect(f(QueryResult.succeed(7))).toBe("S:7");
    expect(f(QueryResult.fail("z"))).toBe("F:z");
  });

  test("type: may omit onFailure when E is never", () => {
    const f = QueryResult.match<number, never, string, string>({
      onLoading: (s) => `L:${s}`,
      onSuccess: (v) => `S:${v}`,
    });
    expectTypeOf(f)
      .parameter(0)
      .toExtend<QueryResult.QueryResult<number, never>>();
    expectTypeOf(f).returns.toEqualTypeOf<string>();
    expectTypeOf(f(QueryResult.succeed(1))).toEqualTypeOf<string>();

    QueryResult.match<number, never, string, string, string>({
      onLoading: (s) => `L:${s}`,
      onSuccess: (v) => `S:${v}`,
      // @ts-expect-error - onFailure must not be passed when E is never
      onFailure: () => "noop",
    });
  });

  test("type: onFailure is required when E is not never", () => {
    expectTypeOf(
      QueryResult.match<number, string, string, string, string>({
        onLoading: (s) => `L:${s}`,
        onSuccess: (v) => `S:${v}`,
        onFailure: (e) => `F:${e}`,
      }),
    ).toEqualTypeOf<
      (self: QueryResult.QueryResult<number, string>) => string
    >();

    // @ts-expect-error - onFailure is required when E is not never
    QueryResult.match<number, string, string, string, string>({
      onLoading: (s) => `L:${s}`,
      onSuccess: (v) => `S:${v}`,
    });
  });
});

describe("namespace type helpers", () => {
  test("Success extracts the success type parameter from QueryResult", () => {
    type R = QueryResult.QueryResult<number, "e">;
    expectTypeOf<QueryResult.QueryResult.Success<R>>().toEqualTypeOf<number>();
  });

  test("Failure extracts the failure type parameter from QueryResult", () => {
    type R = QueryResult.QueryResult<number, "e">;
    expectTypeOf<QueryResult.QueryResult.Failure<R>>().toEqualTypeOf<"e">();
  });
});
