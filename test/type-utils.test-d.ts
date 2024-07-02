import { describe, expectTypeOf, test } from "vitest";

import {
  IsEntirelyReadonly,
  IsEntirelyWritable,
  IsUnion,
  IsValueLiteral,
} from "~/src/type-utils";

describe("IsEntirelyReadonly", () => {
  test("returns true if the object is entirely readonly", () => {
    expectTypeOf<
      IsEntirelyReadonly<{ readonly a: string }>
    >().toEqualTypeOf<true>();
  });

  test("returns false if the object is entirely writable", () => {
    expectTypeOf<IsEntirelyReadonly<{ a: string }>>().toEqualTypeOf<false>();
  });

  test("returns false if the object is only partially readonly", () => {
    expectTypeOf<
      IsEntirelyReadonly<{ readonly a: string; b: string }>
    >().toEqualTypeOf<false>();
  });
});

describe("IsEntirelyMutable", () => {
  test("returns true if the object is entirely writable", () => {
    expectTypeOf<
      IsEntirelyWritable<{ a: string; b: number }>
    >().toEqualTypeOf<true>();
  });

  test("returns false if the object is entirely readonly", () => {
    expectTypeOf<
      IsEntirelyWritable<{ readonly a: string; readonly b: number }>
    >().toEqualTypeOf<false>();
  });

  test("returns false if the object is only partially writable", () => {
    expectTypeOf<
      IsEntirelyWritable<{ readonly a: string; b: number }>
    >().toEqualTypeOf<false>();
  });
});

describe("IsUnion", () => {
  test("string = false", () => {
    expectTypeOf<IsUnion<string>>().toEqualTypeOf<false>();
  });

  test("string | number = true", () => {
    expectTypeOf<IsUnion<string | number>>().toEqualTypeOf<true>();
  });

  test("string | number | boolean = true", () => {
    expectTypeOf<IsUnion<string | number | boolean>>().toEqualTypeOf<true>();
  });

  test("string | number[] | { foo: boolean } = true", () => {
    expectTypeOf<
      IsUnion<string | number[] | { foo: boolean }>
    >().toEqualTypeOf<true>();
  });

  test("any = false", () => {
    expectTypeOf<IsUnion<any>>().toEqualTypeOf<false>();
  });

  test("string | never = false", () => {
    expectTypeOf<IsUnion<string | never>>().toEqualTypeOf<false>();
  });

  test("never = never", () => {
    expectTypeOf<IsUnion<never>>().toEqualTypeOf<never>();
  });
});

describe("IsValueLiteral", () => {
  test("string literal", () => {
    expectTypeOf<IsValueLiteral<"foo">>().toEqualTypeOf<true>();
  });

  test("string", () => {
    expectTypeOf<IsValueLiteral<string>>().toEqualTypeOf<false>();
  });

  test("number literal", () => {
    expectTypeOf<IsValueLiteral<1>>().toEqualTypeOf<true>();
  });

  test("number", () => {
    expectTypeOf<IsValueLiteral<number>>().toEqualTypeOf<false>();
  });

  test("boolean literal", () => {
    expectTypeOf<IsValueLiteral<true>>().toEqualTypeOf<true>();
  });

  test("boolean", () => {
    expectTypeOf<IsValueLiteral<boolean>>().toEqualTypeOf<false>();
  });

  test("bigint literal", () => {
    expectTypeOf<IsValueLiteral<1n>>().toEqualTypeOf<true>();
  });

  test("bigint", () => {
    expectTypeOf<IsValueLiteral<bigint>>().toEqualTypeOf<false>();
  });
});
