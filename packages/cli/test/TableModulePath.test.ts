import { TableModulePath } from "@confect/cli/TableModulePath";
import { expect, expectTypeOf, it } from "@effect/vitest";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

it.each([
  "tables/notes.ts",
  "tables\\notes.ts",
  "tables/groups/notes.ts",
  "tables\\groups\\notes.ts",
  "tables/groups\\notes.ts",
  "tables/notes.spec.ts",
  "tables/notes.impl.ts",
  "tables/.hidden.ts",
  "tables/with spaces/$notes.with.dots.ts",
  "tables/日本語/ノート.ts",
])("parses table module path %s without changing it", (input) => {
  const parsed = Schema.decodeOption(TableModulePath)(input);
  expect(parsed).toEqual(Option.some(input));
  expectTypeOf(parsed).toEqualTypeOf<Option.Option<TableModulePath>>();
});

it.each([
  "",
  "tables/.ts",
  "tables\\.ts",
  "tables/groups/.ts",
  "notes.ts",
  "tables.ts",
  "other/tables/notes.ts",
  "tables/notes.tsx",
  "tables/notes.js",
  "tables/notes.ts/child",
  "tables/notes.ts\n",
  "./tables/notes.ts",
  "../tables/notes.ts",
  "tables/../notes.ts",
  "tables\\.\\notes.ts",
  "tables//notes.ts",
  "tables\\\\notes.ts",
  "/tables/notes.ts",
  "\\tables\\notes.ts",
  "C:\\tables\\notes.ts",
  "C:tables/notes.ts",
  "tables/notes\0.ts",
  undefined,
  null,
  42,
  {},
])("rejects a non-table path %s", (input) => {
  expect(Schema.decodeUnknownOption(TableModulePath)(input)).toEqual(
    Option.none(),
  );
});

it("does not accept an unparsed string as a table path", () => {
  expectTypeOf<string>().not.toExtend<TableModulePath>();
  expectTypeOf<TableModulePath>().toExtend<string>();
});
