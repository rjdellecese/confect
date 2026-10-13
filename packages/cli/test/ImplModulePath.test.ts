import { ImplModulePath } from "@confect/cli/ImplModulePath";
import { expect, expectTypeOf, it } from "@effect/vitest";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

it.each(["notes.impl.ts", "groups/notes.impl.ts", "groups\\notes.impl.ts"])(
  "parses implementation module path %s without changing it",
  (input) => {
    const parsed = Schema.decodeOption(ImplModulePath)(input);
    expect(parsed).toEqual(Option.some(input));
    expectTypeOf(parsed).toEqualTypeOf<Option.Option<ImplModulePath>>();
  },
);

it.each([
  "",
  "notes.spec.ts",
  "notes.impl.tsx",
  "notes.impl.js",
  "notes.impl.ts/child",
  "notes.impl.ts\n",
  undefined,
  null,
  42,
  {},
])("rejects a non-implementation path %s", (input) => {
  expect(Schema.decodeUnknownOption(ImplModulePath)(input)).toEqual(
    Option.none(),
  );
});

it("does not accept an unparsed string as an implementation path", () => {
  expectTypeOf<string>().not.toExtend<ImplModulePath>();
  expectTypeOf<ImplModulePath>().toExtend<string>();
});
