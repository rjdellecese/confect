import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import * as Table from "@confect/core/Table";
import type * as SchemaAST from "effect/SchemaAST";
import { vi } from "vitest";

describe("Table", () => {
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

  describe("codec preparation", () => {
    it("prepares each canonical graph once on its first access", () => {
      const fields = Schema.Struct({ text: Schema.String });
      const lazyFields = vi.fn(() => fields);
      const prepare = { fields: vi.fn(), doc: vi.fn() };
      const unnamed = Table.make(lazyFields);
      const notes = unnamed("notes", prepare);

      expect(lazyFields).not.toHaveBeenCalled();
      expect(prepare.fields).not.toHaveBeenCalled();
      expect(prepare.doc).not.toHaveBeenCalled();

      expect(notes.Fields).toBe(fields);
      expect(notes.Fields).toBe(fields);
      expect(lazyFields).toHaveBeenCalledTimes(1);
      expect(prepare.fields.mock.calls).toEqual([[fields.ast]]);
      expect(prepare.fields.mock.calls[0]?.[0]).toBe(notes.Fields.ast);
      expect(prepare.doc).not.toHaveBeenCalled();

      const doc = notes.Doc;
      expect(notes.Doc).toBe(doc);
      expect(prepare.doc.mock.calls).toEqual([[doc.ast]]);
      expect(prepare.doc.mock.calls[0]?.[0]).toBe(doc.ast);
      expect(prepare.fields).toHaveBeenCalledTimes(1);
      expect(lazyFields).toHaveBeenCalledTimes(1);
    });

    it("prepares Fields before Doc when Doc is accessed first", () => {
      const calls: Array<readonly [string, SchemaAST.AST]> = [];
      const notes = Table.make(() => Schema.Struct({ text: Schema.String }))(
        "notes",
        {
          fields: (ast) => calls.push(["fields", ast]),
          doc: (ast) => calls.push(["doc", ast]),
        },
      );

      const doc = notes.Doc;
      expect(calls).toEqual([
        ["fields", notes.Fields.ast],
        ["doc", doc.ast],
      ]);
      expect(notes.Doc).toBe(doc);
      expect(calls).toHaveLength(2);
    });

    it("keeps preparation independent across bindings without mutating builders or inputs", () => {
      const fields = Schema.Struct({ text: Schema.String });
      const unnamed = Table.make(() => fields);
      const indexes = unnamed.indexes;
      const indexed = unnamed.index("by_text", ["text"]);
      const before = Object.getOwnPropertyDescriptors(indexed);
      const firstPreparation = { fields: vi.fn(), doc: vi.fn() };
      const secondPreparation = { fields: vi.fn(), doc: vi.fn() };
      const prepareBefore = Object.getOwnPropertyDescriptors(firstPreparation);
      const first = indexed("first", firstPreparation);
      const second = indexed("second", secondPreparation);
      const unprepared = indexed("third");

      expect(Object.getOwnPropertyDescriptors(indexed)).toEqual(before);
      expect(Object.getOwnPropertyDescriptors(firstPreparation)).toEqual(
        prepareBefore,
      );
      expect(unnamed.indexes).toBe(indexes);
      expect(unnamed.indexes).toEqual({});
      expect(indexed.indexes).toEqual({ by_text: ["text"] });

      const firstDoc = first.Doc;
      expect(firstPreparation.fields).toHaveBeenCalledExactlyOnceWith(
        fields.ast,
      );
      expect(firstPreparation.doc).toHaveBeenCalledExactlyOnceWith(
        firstDoc.ast,
      );
      expect(secondPreparation.fields).not.toHaveBeenCalled();
      expect(secondPreparation.doc).not.toHaveBeenCalled();

      const secondDoc = second.Doc;
      expect(second.Fields).toBe(first.Fields);
      expect(secondDoc.ast).not.toBe(firstDoc.ast);
      expect(secondPreparation.fields).toHaveBeenCalledExactlyOnceWith(
        fields.ast,
      );
      expect(secondPreparation.doc).toHaveBeenCalledExactlyOnceWith(
        secondDoc.ast,
      );
      expect(unprepared.Doc.ast).not.toBe(firstDoc.ast);
      expect(firstPreparation.doc).toHaveBeenCalledTimes(1);
      expect(secondPreparation.doc).toHaveBeenCalledTimes(1);
      expect(Object.getOwnPropertyDescriptors(indexed)).toEqual(before);
      expect(Object.getOwnPropertyDescriptors(firstPreparation)).toEqual(
        prepareBefore,
      );
    });
  });
});
