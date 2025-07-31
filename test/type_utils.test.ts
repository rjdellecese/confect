import type { Brand } from "effect";
import type { ReadonlyRecord } from "effect/Record";
import { describe, expectTypeOf, test } from "vitest";

import type {
  DeepMutable,
  DeepReadonly,
  IsAny,
  IsOptional,
  IsRecursive,
  IsUnion,
  IsValueLiteral,
  UnionToTuple,
} from "~/src/server/type_utils";

describe("IsOptional", () => {
  test("{ foo?: any } = true", () => {
    expectTypeOf<IsOptional<{ foo?: any }, "foo">>().toEqualTypeOf<true>();
  });

  test("{ foo: any } = false", () => {
    expectTypeOf<IsOptional<{ foo: any }, "foo">>().toEqualTypeOf<false>();
  });
});

describe("IsAny", () => {
  test("any = true", () => {
    expectTypeOf<IsAny<any>>().toEqualTypeOf<true>();
  });

  test("string = false", () => {
    expectTypeOf<IsAny<string>>().toEqualTypeOf<false>();
  });

  test("never = false", () => {
    expectTypeOf<IsAny<never>>().toEqualTypeOf<false>();
  });

  test("unknown = false", () => {
    expectTypeOf<IsAny<unknown>>().toEqualTypeOf<false>();
  });

  test("{} = false", () => {
    expectTypeOf<IsAny<{}>>().toEqualTypeOf<false>();
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

describe("DeepMutable", () => {
  describe("no-op on other types", () => {
    test("any", () => {
      expectTypeOf<DeepMutable<any>>().toEqualTypeOf<any>();
    });

    test("never", () => {
      expectTypeOf<DeepMutable<never>>().toEqualTypeOf<never>();
    });

    test("unknown", () => {
      expectTypeOf<DeepMutable<unknown>>().toEqualTypeOf<unknown>();
    });

    test("{ readonly foo: readonly number[]; readonly bar: any  }", () => {
      expectTypeOf<
        DeepMutable<{ readonly foo: readonly number[]; readonly bar: any }>
      >().toEqualTypeOf<{ foo: number[]; bar: any }>();
    });
  });

  test("ReadonlyMap", () => {
    expectTypeOf<DeepMutable<ReadonlyMap<string, number>>>().toEqualTypeOf<
      Map<string, number>
    >();
  });

  test("ReadonlySet", () => {
    expectTypeOf<DeepMutable<ReadonlySet<number>>>().toEqualTypeOf<
      Set<number>
    >();
  });

  test("ReadonlyArray", () => {
    expectTypeOf<DeepMutable<ReadonlyArray<number>>>().toEqualTypeOf<
      number[]
    >();
  });

  test("ReadonlyRecord", () => {
    expectTypeOf<DeepMutable<ReadonlyRecord<string, number>>>().toEqualTypeOf<
      Record<string, number>
    >();
  });

  test("readonly object", () => {
    expectTypeOf<DeepMutable<{ readonly foo: number }>>().toEqualTypeOf<{
      foo: number;
    }>();
  });

  test("deep readonly object", () => {
    expectTypeOf<
      DeepMutable<{ readonly foo: { readonly bar: readonly number[] } }>
    >().toEqualTypeOf<{
      foo: { bar: number[] };
    }>();
  });

  test("branded string", () => {
    type BrandedString = number & Brand.Brand<"BrandedString">;

    type Actual = DeepMutable<BrandedString>;
    type Expected = BrandedString;

    expectTypeOf<Actual>().toEqualTypeOf<Expected>();
  });
});

describe("DeepReadonly", () => {
  describe("no-op on other types", () => {
    test("any", () => {
      expectTypeOf<DeepReadonly<any>>().toEqualTypeOf<any>();
    });

    test("never", () => {
      expectTypeOf<DeepReadonly<never>>().toEqualTypeOf<never>();
    });

    test("unknown", () => {
      expectTypeOf<DeepReadonly<unknown>>().toEqualTypeOf<unknown>();
    });

    test("{ readonly foo: readonly number[]; readonly bar: any  }", () => {
      expectTypeOf<DeepReadonly<{ foo: number[]; bar: any }>>().toEqualTypeOf<{
        readonly foo: readonly number[];
        readonly bar: any;
      }>();
    });
  });

  test("Map", () => {
    expectTypeOf<DeepReadonly<Map<string, number>>>().toEqualTypeOf<
      ReadonlyMap<string, number>
    >();
  });

  test("Set", () => {
    expectTypeOf<DeepReadonly<Set<number>>>().toEqualTypeOf<
      ReadonlySet<number>
    >();
  });

  test("Array", () => {
    expectTypeOf<DeepReadonly<number[]>>().toEqualTypeOf<readonly number[]>();
  });

  test("Record", () => {
    expectTypeOf<DeepReadonly<Record<string, number>>>().toEqualTypeOf<
      ReadonlyRecord<string, number>
    >();
  });

  test("object", () => {
    expectTypeOf<DeepReadonly<{ foo: number }>>().toEqualTypeOf<{
      readonly foo: number;
    }>();
  });

  test("deep object", () => {
    expectTypeOf<DeepReadonly<{ foo: { bar: number[] } }>>().toEqualTypeOf<{
      readonly foo: { readonly bar: readonly number[] };
    }>();
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

describe("IsRecursive", () => {
  describe("recursive types", () => {
    test("union", () => {
      type RecursiveUnion = number | { next: RecursiveUnion };
      expectTypeOf<IsRecursive<RecursiveUnion>>().toEqualTypeOf<true>();
    });

    test("array union", () => {
      type RecursiveArrayUnion = number | RecursiveArrayUnion[];
      expectTypeOf<IsRecursive<RecursiveArrayUnion>>().toEqualTypeOf<true>();
    });

    test("nested arrays with any", () => {
      expectTypeOf<IsRecursive<any[][]>>().toEqualTypeOf<true>();
    });

    test("map", () => {
      type RecursiveMap = Map<string, RecursiveMap>;
      expectTypeOf<IsRecursive<RecursiveMap>>().toEqualTypeOf<true>();
    });

    test("set", () => {
      type RecursiveSet = Set<number | RecursiveSet>;
      expectTypeOf<IsRecursive<RecursiveSet>>().toEqualTypeOf<true>();
    });

    test("JSON value type", () => {
      type JSONValue =
        | string
        | number
        | boolean
        | null
        | JSONValue[]
        | { [key: string]: JSONValue };
      expectTypeOf<IsRecursive<JSONValue>>().toEqualTypeOf<true>();
    });

    test("nested union array type", () => {
      type NestedUnionArray =
        | number
        | string
        | NestedUnionArray[]
        | { data: NestedUnionArray };
      expectTypeOf<IsRecursive<NestedUnionArray>>().toEqualTypeOf<true>();
    });

    test("mutually recursive types", () => {
      type TreeNode = {
        children: TreeChildren;
      };
      type TreeChildren = TreeNode[];
      expectTypeOf<IsRecursive<TreeNode>>().toEqualTypeOf<true>();
    });

    test("deeply nested recursive type", () => {
      type DeepNest = {
        a: {
          b: {
            c: DeepNest;
          };
        };
      };
      expectTypeOf<IsRecursive<DeepNest>>().toEqualTypeOf<true>();
    });

    test("recursive tuple type", () => {
      type RecursiveTuple = [string, RecursiveTuple?];
      expectTypeOf<IsRecursive<RecursiveTuple>>().toEqualTypeOf<true>();
    });

    test("recursive mapped type", () => {
      type Recursive<T> = {
        [K in keyof T]: T[K] | Recursive<T>;
      };
      type Test = Recursive<{ a: string; b: number }>;
      expectTypeOf<IsRecursive<Test>>().toEqualTypeOf<true>();
    });
  });

  describe("non-recursive types", () => {
    test("simple union", () => {
      type SimpleUnion = number | string;
      expectTypeOf<IsRecursive<SimpleUnion>>().toEqualTypeOf<false>();
    });

    test("array union", () => {
      type ArrayUnion = number | string[];
      expectTypeOf<IsRecursive<ArrayUnion>>().toEqualTypeOf<false>();
    });

    test("primitive", () => {
      expectTypeOf<IsRecursive<number>>().toEqualTypeOf<false>();
    });

    test("empty object", () => {
      type EmptyObject = {};
      expectTypeOf<IsRecursive<EmptyObject>>().toEqualTypeOf<false>();
    });

    test("empty array", () => {
      type EmptyArray = [];
      expectTypeOf<IsRecursive<EmptyArray>>().toEqualTypeOf<false>();
    });

    test("any", () => {
      expectTypeOf<IsRecursive<any>>().toEqualTypeOf<false>();
    });

    test("recursive with any", () => {
      type RecursiveWithAny = any | { next: RecursiveWithAny };
      expectTypeOf<IsRecursive<RecursiveWithAny>>().toEqualTypeOf<false>();
    });

    test("unknown", () => {
      expectTypeOf<IsRecursive<unknown>>().toEqualTypeOf<false>();
    });

    test("never", () => {
      expectTypeOf<IsRecursive<never>>().toEqualTypeOf<false>();
    });

    test("map", () => {
      expectTypeOf<IsRecursive<Map<string, number>>>().toEqualTypeOf<false>();
    });

    test("set", () => {
      expectTypeOf<IsRecursive<Set<number>>>().toEqualTypeOf<false>();
    });

    test("complex object", () => {
      type Complex = {
        a: string;
        b: number[];
        c: { d: boolean };
        e: readonly [string, number];
        f: Map<string, Set<number>>;
      };
      expectTypeOf<IsRecursive<Complex>>().toEqualTypeOf<false>();
    });

    test("type with generic parameter", () => {
      type Generic<T> = {
        value: T;
        wrapped: { inner: T };
      };
      expectTypeOf<IsRecursive<Generic<string>>>().toEqualTypeOf<false>();
    });

    test("recursive with unknown", () => {
      type RecursiveWithUnknown = unknown & { next: RecursiveWithUnknown };
      expectTypeOf<IsRecursive<RecursiveWithUnknown>>().toEqualTypeOf<true>();
    });

    test("recursive with never", () => {
      type RecursiveWithNever = never | { next: RecursiveWithNever };
      expectTypeOf<IsRecursive<RecursiveWithNever>>().toEqualTypeOf<true>();
    });

    test("indirect recursion through multiple types", () => {
      type A = { b: B };
      type B = { c: C };
      type C = { a: A };
      expectTypeOf<IsRecursive<A>>().toEqualTypeOf<true>();
    });
  });
});

describe("UnionToTuple", () => {
  test("never", () => {
    expectTypeOf<UnionToTuple<never>>().toEqualTypeOf<[]>();
  });

  test("string | number", () => {
    expectTypeOf<UnionToTuple<string | number>>().toEqualTypeOf<
      [string, number]
    >();
  });

  test("boolean", () => {
    expectTypeOf<UnionToTuple<boolean>>().toEqualTypeOf<[false, true]>();
  });

  test("string | [number, boolean]", () => {
    expectTypeOf<UnionToTuple<string | [number, boolean]>>().toEqualTypeOf<
      [string, [number, boolean]]
    >();
  });
});
