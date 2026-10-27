import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as GenericId from "@confect/core/GenericId";
import * as IdScope from "@confect/core/IdScope";

describe("GenericId", () => {
  it("preserves component scope through schema composition", () => {
    const definition = IdScope.component("counter");
    const id = GenericId.GenericId("items", definition)
      .check(Schema.isMinLength(1))
      .annotate({ title: "Component item ID" });
    const value = id.make("item");

    expectTypeOf(value).toEqualTypeOf<
      GenericId.GenericId<"items", typeof definition>
    >();
    expectTypeOf<typeof id.Encoded>().toEqualTypeOf<typeof value>();
    expectTypeOf(value).not.toExtend<GenericId.GenericId<"items">>();
    expect(GenericId.scope(id.ast)).toBe(definition);
    expect(GenericId.tableName(id.ast)).toEqual(Option.some("items"));
    expect(
      Schema.decodeUnknownSync(Schema.Record(id, Schema.Finite))({ item: 1 }),
    ).toEqual({ item: 1 });
    expect(() => id.make("")).toThrow();
  });

  it("preserves the table-specific decoded and encoded types", () => {
    const id = GenericId.GenericId("users");

    expectTypeOf<typeof id.Type>().toEqualTypeOf<
      GenericId.GenericId<"users">
    >();
    expectTypeOf<typeof id.Encoded>().toEqualTypeOf<
      GenericId.GenericId<"users">
    >();
    expectTypeOf<typeof id>().toExtend<
      Schema.Codec<GenericId.GenericId<"users">>
    >();
    expectTypeOf<typeof id.Type>().not.toExtend<GenericId.GenericId<"posts">>();
  });

  it("constructs and round-trips candidate strings without validating their table", () => {
    const id = GenericId.GenericId("users");

    for (const value of ["", "candidate-id"]) {
      const constructed = id.make(value);
      expectTypeOf(constructed).toEqualTypeOf<GenericId.GenericId<"users">>();
      expect(constructed).toBe(value);
      expect(Schema.decodeUnknownSync(id)(value)).toBe(value);
      expect(Schema.encodeSync(id)(constructed)).toBe(value);
    }
    expect(() => Schema.decodeUnknownSync(id)(42)).toThrow();
  });

  it("supports checks, annotations, and piping without losing the ID type", () => {
    const base = GenericId.GenericId("users");
    const id = base
      .check(Schema.isMinLength(1))
      .annotate({ title: "User ID" })
      .pipe(Schema.toType);

    expectTypeOf<typeof id.Type>().toEqualTypeOf<
      GenericId.GenericId<"users">
    >();
    expectTypeOf<typeof id.Encoded>().toEqualTypeOf<
      GenericId.GenericId<"users">
    >();
    expect(GenericId.tableName(id.ast)).toEqual(Option.some("users"));
    expect(id.make("candidate-id")).toBe("candidate-id");
    expect(() => id.make("")).toThrow();
    expect(() => Schema.decodeUnknownSync(id)("")).toThrow();
    expect(base.make("")).toBe("");
  });

  it("supports ID-keyed records with record checks", () => {
    const counts = Schema.Record(
      GenericId.GenericId("shipmentLineItems"),
      Schema.Finite,
    ).check(Schema.isMinProperties(1));

    expectTypeOf<typeof counts.Type>().toEqualTypeOf<{
      readonly [id in GenericId.GenericId<"shipmentLineItems">]: number;
    }>();
    expectTypeOf<typeof counts.Encoded>().toEqualTypeOf<typeof counts.Type>();
    const value = { "candidate-id": 2 };
    const decoded = Schema.decodeSync(counts)(value);
    expect(decoded).toEqual(value);
    expect(Schema.encodeSync(counts)(decoded)).toEqual(value);
    expect(() => Schema.decodeSync(counts)({})).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(counts)({ "candidate-id": "2" }),
    ).toThrow();
  });
});

describe("tableName", () => {
  it("returns the table name of the GenericId", () => {
    const expectedTableName = "users" as const;
    const id = GenericId.GenericId(expectedTableName);

    const actualTableName = GenericId.tableName(id.ast);

    expect(actualTableName).toStrictEqual(Option.some(expectedTableName));
  });
});

describe("rebase", () => {
  it("rebinds checked IDs without changing their source scope or checks", () => {
    const definition = IdScope.component("counter");
    const installation = IdScope.instance(IdScope.app, "first");
    const input = GenericId.GenericId("items", definition)
      .check(Schema.isMinLength(1))
      .annotate({ title: "Component item ID" });
    const bound = GenericId.rebase(input, definition, installation);

    expectTypeOf<typeof bound.Type>().toEqualTypeOf<
      GenericId.GenericId<"items", typeof installation>
    >();
    expectTypeOf<typeof bound.Encoded>().toEqualTypeOf<typeof bound.Type>();
    expect(GenericId.scope(input.ast)).toBe(definition);
    expect(GenericId.scope(bound.ast)).toBe(installation);
    expect(GenericId.tableName(bound.ast)).toEqual(Option.some("items"));
    expect(Schema.decodeUnknownSync(bound)("item")).toBe("item");
    expect(() => Schema.decodeUnknownSync(bound)("")).toThrow();
  });

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
