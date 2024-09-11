import type { Brand } from "effect";
import type { ReadonlyRecord } from "effect/Record";
import { describe, expectTypeOf, test } from "vitest";

import type {
	DeepMutable,
	DeepReadonly,
	IsAny,
	IsOptional,
	IsUnion,
	IsValueLiteral,
	UnionToTuple,
} from "~/src/type-utils";

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
		// biome-ignore lint/complexity/noBannedTypes: <explanation>
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
