import * as SpecModulePath from "@confect/cli/SpecModulePath";
import { ImplModulePath } from "@confect/cli/ImplModulePath";
import { assert, expect, expectTypeOf, it } from "@effect/vitest";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

it.each([
  "notes.spec.ts",
  "groups/notes.spec.ts",
  "groups\\notes.spec.ts",
  "groups.spec.ts/nested/notes.spec.ts",
  "groups\\nested/notes.spec.ts",
  ".hidden.spec.ts",
  "with spaces/$notes.with.dots.spec.ts",
  "日本語/ノート.spec.ts",
])(
  "parses and round-trips spec module path %s without changing it",
  (input) => {
    const parsed = Schema.decodeOption(SpecModulePath.SpecModulePath)(input);
    expect(parsed).toEqual(Option.some(input));
    assert(Option.isSome(parsed));
    const impl = SpecModulePath.toImpl(parsed.value);
    expect(impl).toBe(`${input.slice(0, -".spec.ts".length)}.impl.ts`);
    expect(Schema.is(ImplModulePath)(impl)).toBe(true);
    expect(SpecModulePath.fromImpl(impl)).toBe(input);
    expectTypeOf(parsed).toExtend<
      Option.Option<SpecModulePath.SpecModulePath>
    >();
    expectTypeOf(impl).toEqualTypeOf<ImplModulePath>();
  },
);

it.each([
  "",
  ".spec.ts",
  "groups/.spec.ts",
  "groups\\.spec.ts",
  "notes.impl.ts",
  "notes.spec.tsx",
  "notes.spec.js",
  "notes.spec.ts/child",
  "notes.spec.ts\n",
  "./notes.spec.ts",
  "../notes.spec.ts",
  "groups/../notes.spec.ts",
  "groups\\.\\notes.spec.ts",
  "groups//notes.spec.ts",
  "groups\\\\notes.spec.ts",
  "/notes.spec.ts",
  "\\notes.spec.ts",
  "C:\\notes.spec.ts",
  "C:notes.spec.ts",
  "\\\\server\\notes.spec.ts",
  "notes\0.spec.ts",
  undefined,
  null,
  42,
  {},
])("rejects a non-spec path %s", (input) => {
  expect(
    Schema.decodeUnknownOption(SpecModulePath.SpecModulePath)(input),
  ).toEqual(Option.none());
});

it("requires parsed paths for total sibling conversions", () => {
  expectTypeOf<string>().not.toExtend<SpecModulePath.SpecModulePath>();
  expectTypeOf<SpecModulePath.SpecModulePath>().toExtend<string>();
  expectTypeOf(SpecModulePath.toImpl).parameters.toEqualTypeOf<
    [SpecModulePath.SpecModulePath]
  >();
  expectTypeOf(SpecModulePath.fromImpl).parameters.toEqualTypeOf<
    [ImplModulePath]
  >();
  expectTypeOf(
    SpecModulePath.fromImpl,
  ).returns.toEqualTypeOf<SpecModulePath.SpecModulePath>();
});
