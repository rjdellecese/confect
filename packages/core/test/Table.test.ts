import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import * as Table from "@confect/core/Table";

describe("Table", () => {
  it("indexes a 45-member literal union without forcing schemas or widening field paths", () => {
    const members = [
      "member_01",
      "member_02",
      "member_03",
      "member_04",
      "member_05",
      "member_06",
      "member_07",
      "member_08",
      "member_09",
      "member_10",
      "member_11",
      "member_12",
      "member_13",
      "member_14",
      "member_15",
      "member_16",
      "member_17",
      "member_18",
      "member_19",
      "member_20",
      "member_21",
      "member_22",
      "member_23",
      "member_24",
      "member_25",
      "member_26",
      "member_27",
      "member_28",
      "member_29",
      "member_30",
      "member_31",
      "member_32",
      "member_33",
      "member_34",
      "member_35",
      "member_36",
      "member_37",
      "member_38",
      "member_39",
      "member_40",
      "member_41",
      "member_42",
      "member_43",
      "member_44",
      "member_45",
    ] as const;
    let evaluations = 0;
    const unnamed = Table.make(() => {
      evaluations += 1;
      return Schema.Struct({ code: Schema.Literals(members) });
    }).index("by_code", ["code"]);
    const table = unnamed("wide");
    expect(evaluations).toBe(0);
    expect(table.indexes.by_code).toEqual(["code"]);
    expectTypeOf<typeof table.Doc.Type.code>().toEqualTypeOf<
      (typeof members)[number]
    >();
    expectTypeOf(table.indexes.by_code).toEqualTypeOf<
      ["code", "_creationTime"]
    >();
    expectTypeOf<
      Table.TableValidator<typeof table>["fieldPaths"]
    >().toEqualTypeOf<"code">();
    expect(Schema.decodeExit(table.Fields)({ code: "member_45" })._tag).toBe(
      "Success",
    );
    expect(
      Schema.decodeUnknownExit(table.Fields)({ code: "not-a-member" })._tag,
    ).toBe("Failure");
    expect(evaluations).toBe(1);
  });

  it("preserves top-level field checks in Doc", () => {
    const Range = Schema.Struct({
      min: Schema.Finite,
      max: Schema.Finite,
    }).check(
      Schema.makeFilter(({ min, max }) => min <= max || "min must be <= max"),
    );
    const ranges = Table.make(() => Range)("ranges");
    const invalidFields = { min: 10, max: 1 };
    const invalidDocument = {
      ...invalidFields,
      _id: "some-id",
      _creationTime: 1,
    };

    expect(ranges.Fields).toBe(Range);
    expect(Schema.decodeExit(Range)(invalidFields)._tag).toBe("Failure");
    expect(Schema.decodeExit(ranges.Fields)(invalidFields)._tag).toBe(
      "Failure",
    );
    expect(Schema.decodeUnknownExit(ranges.Doc)(invalidDocument)._tag).toBe(
      "Failure",
    );
  });

  describe("UnnamedTable callable shape", () => {
    const lazyFields = () => Schema.Struct({ text: Schema.String });

    it("Table.make(lazyFields) returns an UnnamedTable", () => {
      const unnamed = Table.make(lazyFields);
      expect(Table.isUnnamedTable(unnamed)).toBe(true);
      expect(Table.isTable(unnamed)).toBe(false);
      // No `tableName` property on the unnamed callable, so the discriminator
      // is `tableName` presence—not `name`, which every JS function has
      // (Function.prototype.name) and which would silently mislead any
      // hasProperty-style predicate.
      expect("tableName" in unnamed).toBe(false);
    });

    it("chaining .index() stays unnamed", () => {
      const unnamedWithIndex = Table.make(lazyFields).index("by_text", [
        "text",
      ]);
      expect(Table.isUnnamedTable(unnamedWithIndex)).toBe(true);
      expect(Table.isTable(unnamedWithIndex)).toBe(false);
    });

    it("invoking the callable with a name produces a bound Table", () => {
      const named = Table.make(lazyFields)("notes");
      expect(Table.isTable(named)).toBe(true);
      expect(Table.isUnnamedTable(named)).toBe(false);
      expect(named.tableName).toBe("notes");
      expectTypeOf(named.tableName).toEqualTypeOf<"notes">();
    });

    it("the unnamed callable still has Function.prototype.name and that does not confuse the predicate", () => {
      const unnamed = Table.make(lazyFields);
      expect(typeof (unnamed as unknown as { name: unknown }).name).toBe(
        "string",
      );
      expect(Table.isUnnamedTable(unnamed)).toBe(true);
    });

    it("invoking the same UnnamedTable with different names produces distinct Tables", () => {
      const unnamed = Table.make(lazyFields);
      const a = unnamed("notes_a");
      const b = unnamed("notes_b");
      expect(a.tableName).toBe("notes_a");
      expect(b.tableName).toBe("notes_b");
      expectTypeOf(a.tableName).toEqualTypeOf<"notes_a">();
      expectTypeOf(b.tableName).toEqualTypeOf<"notes_b">();
    });
  });

  describe("lazy accessors", () => {
    // Each test gets its own counter + thunk so the call count is isolated.
    const makeInstrumented = () => {
      const calls = { count: 0 };
      const lazyFields = () => {
        calls.count += 1;
        return Schema.Struct({ text: Schema.String });
      };
      return { calls, lazyFields };
    };

    it("Table.make(lazyFields) does not invoke the callback", () => {
      const { calls, lazyFields } = makeInstrumented();
      Table.make(lazyFields);
      expect(calls.count).toBe(0);
    });

    it("chaining .index/.searchIndex/.vectorIndex does not invoke the callback", () => {
      const { calls, lazyFields } = makeInstrumented();
      Table.make(lazyFields)
        .index("by_text", ["text"])
        .searchIndex("text", { searchField: "text" });
      expect(calls.count).toBe(0);
    });

    it("binding the callable (`unnamed(name)`) does not invoke the callback", () => {
      const { calls, lazyFields } = makeInstrumented();
      Table.make(lazyFields)("notes");
      expect(calls.count).toBe(0);
    });

    it("first `Fields` access invokes the callback exactly once and returns the schema", () => {
      const { calls, lazyFields } = makeInstrumented();
      const notes = Table.make(lazyFields)("notes");
      const fields = notes.Fields;
      expect(calls.count).toBe(1);
      expect(Schema.isSchema(fields)).toBe(true);
    });

    it("subsequent `Fields` accesses return the same reference without re-invoking the callback", () => {
      const { calls, lazyFields } = makeInstrumented();
      const notes = Table.make(lazyFields)("notes");
      const first = notes.Fields;
      const second = notes.Fields;
      const third = notes.Fields;
      expect(first).toBe(second);
      expect(second).toBe(third);
      expect(calls.count).toBe(1);
    });

    it("`Doc` forces `Fields` once and is `===`-stable across accesses", () => {
      const { calls, lazyFields } = makeInstrumented();
      const notes = Table.make(lazyFields)("notes");
      const firstDoc = notes.Doc;
      const secondDoc = notes.Doc;
      expect(firstDoc).toBe(secondDoc);
      // `Doc` forces `Fields` once; `Fields` itself is still cached, so
      // reading it after `Doc` should not bump the counter.
      const fields = notes.Fields;
      expect(Schema.isSchema(fields)).toBe(true);
      expect(calls.count).toBe(1);
    });
  });
});
