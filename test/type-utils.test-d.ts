import { describe, expectTypeOf, test } from "vitest";

import type { IsUnion, IsValueLiteral } from "~/src/type-utils";

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
