import { Option } from "effect";
import { describe, expect, expectTypeOf, test } from "vitest";

import * as AR from "../src/AsyncResult";

describe("constructors", () => {
  test("initial()", () => {
    const r = AR.initial();
    expect(r._tag).toBe("Initial");
    expect(r.waiting).toBe(false);
  });

  test("initial(true)", () => {
    const r = AR.initial(true);
    expect(r._tag).toBe("Initial");
    expect(r.waiting).toBe(true);
  });

  test("success(value)", () => {
    const r = AR.success(42);
    expect(r._tag).toBe("Success");
    expect(r.value).toBe(42);
    expect(r.waiting).toBe(false);
  });

  test("success(value, { waiting: true })", () => {
    const r = AR.success("hello", { waiting: true });
    expect(r._tag).toBe("Success");
    expect(r.value).toBe("hello");
    expect(r.waiting).toBe(true);
  });

  test("failure(error)", () => {
    const r = AR.failure("oops");
    expect(r._tag).toBe("Failure");
    expect(r.error).toBe("oops");
    expect(r.waiting).toBe(false);
    expect(Option.isNone(r.previousValue)).toBe(true);
  });

  test("failure with previousValue", () => {
    const r = AR.failure("oops", {
      previousValue: Option.some(42),
    });
    expect(r._tag).toBe("Failure");
    expect(r.error).toBe("oops");
    expect(Option.isSome(r.previousValue)).toBe(true);
    expect(Option.getOrThrow(r.previousValue)).toBe(42);
  });
});

describe("refinements", () => {
  test("isAsyncResult", () => {
    expect(AR.isAsyncResult(AR.initial())).toBe(true);
    expect(AR.isAsyncResult(AR.success(1))).toBe(true);
    expect(AR.isAsyncResult(AR.failure("err"))).toBe(true);
    expect(AR.isAsyncResult({ _tag: "Success" })).toBe(false);
    expect(AR.isAsyncResult(null)).toBe(false);
  });

  test("isInitial", () => {
    expect(AR.isInitial(AR.initial())).toBe(true);
    expect(AR.isInitial(AR.success(1))).toBe(false);
    expect(AR.isInitial(AR.failure("err"))).toBe(false);
  });

  test("isSuccess", () => {
    expect(AR.isSuccess(AR.initial())).toBe(false);
    expect(AR.isSuccess(AR.success(1))).toBe(true);
    expect(AR.isSuccess(AR.failure("err"))).toBe(false);
  });

  test("isFailure", () => {
    expect(AR.isFailure(AR.initial())).toBe(false);
    expect(AR.isFailure(AR.success(1))).toBe(false);
    expect(AR.isFailure(AR.failure("err"))).toBe(true);
  });

  test("isWaiting", () => {
    expect(AR.isWaiting(AR.initial())).toBe(false);
    expect(AR.isWaiting(AR.initial(true))).toBe(true);
    expect(AR.isWaiting(AR.success(1))).toBe(false);
    expect(AR.isWaiting(AR.success(1, { waiting: true }))).toBe(true);
  });
});

describe("value accessor", () => {
  test("returns None for Initial", () => {
    expect(Option.isNone(AR.value(AR.initial()))).toBe(true);
  });

  test("returns Some for Success", () => {
    const v = AR.value(AR.success(42));
    expect(Option.isSome(v)).toBe(true);
    expect(Option.getOrThrow(v)).toBe(42);
  });

  test("returns previousValue for Failure", () => {
    const withPrev = AR.failure("err", {
      previousValue: Option.some(99),
    });
    expect(Option.getOrThrow(AR.value(withPrev))).toBe(99);
  });

  test("returns None for Failure without previousValue", () => {
    expect(Option.isNone(AR.value(AR.failure("err")))).toBe(true);
  });
});

describe("getOrElse", () => {
  test("returns value for Success", () => {
    expect(AR.getOrElse(AR.success(42), () => 0)).toBe(42);
  });

  test("returns fallback for Initial", () => {
    expect(AR.getOrElse(AR.initial(), () => 0)).toBe(0);
  });

  test("curried form", () => {
    const fallback = AR.getOrElse(() => "default");
    expect(fallback(AR.success("hello"))).toBe("hello");
    expect(fallback(AR.initial())).toBe("default");
  });
});

describe("waiting", () => {
  test("sets waiting on Initial", () => {
    const r = AR.waiting(AR.initial());
    expect(r.waiting).toBe(true);
    expect(r._tag).toBe("Initial");
  });

  test("sets waiting on Success", () => {
    const r = AR.waiting(AR.success(42));
    expect(r.waiting).toBe(true);
    expect(AR.isSuccess(r) && r.value).toBe(42);
  });

  test("no-op if already waiting", () => {
    const orig = AR.initial(true);
    expect(AR.waiting(orig)).toBe(orig);
  });
});

describe("map", () => {
  test("maps Success value", () => {
    const r = AR.map(AR.success(2), (n) => n * 10);
    expect(AR.isSuccess(r) && r.value).toBe(20);
  });

  test("passes through Initial", () => {
    const r = AR.map(AR.initial<number, string>(), (n) => n * 10);
    expect(AR.isInitial(r)).toBe(true);
  });

  test("maps previousValue in Failure", () => {
    const r = AR.map(
      AR.failure<number, string>("err", {
        previousValue: Option.some(5),
      }),
      (n) => n * 10,
    );
    expect(AR.isFailure(r)).toBe(true);
    if (AR.isFailure(r)) {
      expect(Option.getOrThrow(r.previousValue)).toBe(50);
    }
  });

  test("curried form", () => {
    const double = AR.map((n: number) => n * 2);
    const r = double(AR.success(3));
    expect(AR.isSuccess(r) && r.value).toBe(6);
  });
});

describe("match", () => {
  test("matches Initial", () => {
    const r = AR.match(AR.initial(), {
      onInitial: () => "init",
      onSuccess: () => "ok",
      onFailure: () => "err",
    });
    expect(r).toBe("init");
  });

  test("matches Success", () => {
    const r = AR.match(AR.success(42), {
      onInitial: () => "init",
      onSuccess: (s) => `ok:${s.value}`,
      onFailure: () => "err",
    });
    expect(r).toBe("ok:42");
  });

  test("matches Failure", () => {
    const r = AR.match(AR.failure("oops"), {
      onInitial: () => "init",
      onSuccess: () => "ok",
      onFailure: (f) => `err:${f.error}`,
    });
    expect(r).toBe("err:oops");
  });

  test("curried form", () => {
    const renderer = AR.match({
      onInitial: () => "loading",
      onSuccess: (s: AR.Success<number>) => `${s.value}`,
      onFailure: () => "error",
    });
    expect(renderer(AR.success(1))).toBe("1");
    expect(renderer(AR.initial())).toBe("loading");
  });
});

describe("type-level", () => {
  test("AsyncResult.Value extracts A", () => {
    type R = AR.AsyncResult<number, string>;
    expectTypeOf<AR.AsyncResult.Value<R>>().toEqualTypeOf<number>();
  });

  test("AsyncResult.Error extracts E", () => {
    type R = AR.AsyncResult<number, string>;
    expectTypeOf<AR.AsyncResult.Error<R>>().toEqualTypeOf<string>();
  });

  test("default E is never", () => {
    type R = AR.AsyncResult<number>;
    expectTypeOf<AR.AsyncResult.Error<R>>().toEqualTypeOf<never>();
  });
});
