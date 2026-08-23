import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import * as Table from "@confect/core/Table";

describe("Table", () => {
  describe("UnnamedTable callable shape", () => {
    const lazyFields = () => Schema.Struct({ text: Schema.String });

    it("Table.make(lazyFields) returns an UnnamedTable", () => {
      const unnamed = Table.make(lazyFields);
      expect(Table.isUnnamedTable(unnamed)).toBe(true);
      expect(Table.isTable(unnamed)).toBe(false);
      // No `tableName` property on the unnamed callable, so the discriminator
      // is `tableName` presence — not `name`, which every JS function has
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
