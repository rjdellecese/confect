import {
  RelativeModulePath,
  withSuffix,
} from "@confect/cli/RelativeModulePath";
import { expect, expectTypeOf, it } from "@effect/vitest";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

it.each([
  "notes.ts",
  "groups/notes.spec.ts",
  "groups\\notes.impl.ts",
  ".hidden",
  "with spaces/$notes.with.dots.ts",
  "日本語/ノート.ts",
])("parses relative path %s without changing it", (input) => {
  const parsed = Schema.decodeOption(RelativeModulePath)(input);
  expect(parsed).toEqual(Option.some(input));
  expectTypeOf(parsed).toEqualTypeOf<Option.Option<RelativeModulePath>>();
});

it.each([
  "",
  ".",
  "..",
  "./notes.ts",
  "groups/../notes.ts",
  "groups\\.\\notes.ts",
  "groups//notes.ts",
  "groups\\\\notes.ts",
  "/notes.ts",
  "\\notes.ts",
  "C:notes.ts",
  "C:\\notes.ts",
  "notes\0.ts",
])("rejects malformed relative path %s", (input) => {
  expect(Schema.decodeOption(RelativeModulePath)(input)).toEqual(Option.none());
});

it("refines relative paths by suffix and nonempty filename stem", () => {
  const SpecPath = withSuffix(".spec.ts");
  expect(Schema.decodeOption(SpecPath)("groups/notes.spec.ts")).toEqual(
    Option.some("groups/notes.spec.ts"),
  );
  expect(Schema.decodeOption(SpecPath)("groups/.spec.ts")).toEqual(
    Option.none(),
  );
  expect(Schema.decodeOption(SpecPath)("notes.impl.ts")).toEqual(Option.none());
  expect(Schema.decodeOption(SpecPath)("../notes.spec.ts")).toEqual(
    Option.none(),
  );
  expectTypeOf<string>().not.toExtend<RelativeModulePath>();
});
