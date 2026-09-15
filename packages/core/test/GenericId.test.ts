import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import * as GenericId from "@confect/core/GenericId";
import * as IdScope from "@confect/core/IdScope";
import * as Schema from "effect/Schema";

describe("tableName", () => {
  it("returns the table name of the GenericId", () => {
    const expectedTableName = "users" as const;
    const id = GenericId.GenericId(expectedTableName);

    const actualTableName = GenericId.tableName(id.ast);

    expect(actualTableName).toStrictEqual(Option.some(expectedTableName));
  });
});

describe("rebase", () => {
  it("preserves exclusive union validation while rebasing IDs", () => {
    const definition = IdScope.component("counter");
    const installation = IdScope.instance(IdScope.app, "first");
    const input = Schema.Union(
      [GenericId.GenericId("items", definition), Schema.Literal("overlap")],
      { mode: "oneOf" },
    );
    const bound = GenericId.rebase(input, definition, installation);

    expect(Schema.is(input)("overlap")).toBe(false);
    expect(Schema.is(bound)("overlap")).toBe(false);
    expect(Schema.decodeUnknownSync(bound)("item")).toBe("item");
    expect(() => Schema.decodeSync(bound)("overlap")).toThrow();
  });
});
