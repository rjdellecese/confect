import { GenericId } from "@confect/core";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import {
  defineTable,
  type GenericTableIndexes,
  type GenericTableSearchIndexes,
  type GenericTableVectorIndexes,
  type TableDefinition,
} from "convex/server";
import { v, type GenericValidator } from "convex/values";
import * as Schema from "effect/Schema";
import * as Table from "../src/Table";

describe("Table", () => {
  it("tableDefinition property should extend a generic Convex TableDefinition", () => {
    const confectNotesTableDefinition = Table.make(() =>
      Schema.Struct({
        userId: Schema.optionalWith(GenericId.GenericId("users"), {
          exact: true,
        }),
        text: Schema.String.pipe(Schema.maxLength(100)),
        tag: Schema.optionalWith(Schema.String, { exact: true }),
        author: Schema.optionalWith(
          Schema.Struct({
            role: Schema.Literal("admin", "user"),
            name: Schema.String,
          }),
          { exact: true },
        ),
        embedding: Schema.optionalWith(Schema.Array(Schema.Number), {
          exact: true,
        }),
      }),
    )
      .index("by_text", ["text"])
      .index("by_role", ["author.role"])
      .searchIndex("text", {
        searchField: "text",
        filterFields: ["tag"],
      })
      .vectorIndex("embedding", {
        vectorField: "embedding",
        filterFields: ["author.name", "tag"],
        dimensions: 1536,
      })("notes").tableDefinition;
    type ConfectNotesTableDefinition = typeof confectNotesTableDefinition;

    const convexNotesTableDefinition = defineTable({
      userId: v.optional(v.id("users")),
      text: v.string(),
      tag: v.optional(v.string()),
      author: v.optional(
        v.object({
          role: v.union(v.literal("admin"), v.literal("user")),
          name: v.string(),
        }),
      ),
      embedding: v.optional(v.array(v.number())),
    })
      .index("by_text", ["text"])
      .index("by_role", ["author.role"])
      .searchIndex("text", {
        searchField: "text",
        filterFields: ["tag"],
      })
      .vectorIndex("embedding", {
        vectorField: "embedding",
        filterFields: ["author.name", "tag"],
        dimensions: 1536,
      });
    type ConvexNotesTableDefinition = typeof convexNotesTableDefinition;

    expectTypeOf<ConfectNotesTableDefinition>().toExtend<
      TableDefinition<
        GenericValidator,
        GenericTableIndexes,
        GenericTableSearchIndexes,
        GenericTableVectorIndexes
      >
    >();
    expectTypeOf<ConfectNotesTableDefinition>().toEqualTypeOf<ConvexNotesTableDefinition>();
    expect(convexNotesTableDefinition).toStrictEqual(
      confectNotesTableDefinition,
    );
  });

  it("supports indexes on name fields when the schema includes an optional ID", () => {
    const confectOrganizationsTableDefinition = Table.make(() =>
      Schema.Struct({
        name: Schema.String,
        description: Schema.optional(Schema.String),
        createdBy: Schema.optional(GenericId.GenericId("users")),
      }),
    )
      .index("by_name", ["name"])
      .searchIndex("search_name", { searchField: "name" })(
      "organizations",
    ).tableDefinition;

    const convexOrganizationsTableDefinition = defineTable({
      name: v.string(),
      description: v.optional(v.string()),
      createdBy: v.optional(v.id("users")),
    })
      .index("by_name", ["name"])
      .searchIndex("search_name", { searchField: "name" });

    expectTypeOf(confectOrganizationsTableDefinition).toEqualTypeOf(
      convexOrganizationsTableDefinition,
    );
    expect(convexOrganizationsTableDefinition).toStrictEqual(
      confectOrganizationsTableDefinition,
    );
  });

  it("supports indexes on name fields when the schema includes optional bytes", () => {
    const confectImagesTableDefinition = Table.make(() =>
      Schema.Struct({
        name: Schema.String,
        bytes: Schema.optional(Schema.instanceOf(ArrayBuffer)),
      }),
    ).index("by_name", ["name"])("images").tableDefinition;

    const convexImagesTableDefinition = defineTable({
      name: v.string(),
      bytes: v.optional(v.bytes()),
    }).index("by_name", ["name"]);

    expectTypeOf(confectImagesTableDefinition).toEqualTypeOf(
      convexImagesTableDefinition,
    );
    expect(convexImagesTableDefinition).toStrictEqual(
      confectImagesTableDefinition,
    );
  });

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

    it("`tableDefinition` is `===`-stable and materialises all chained indexes/searchIndexes/vectorIndexes", () => {
      const notes = Table.make(() =>
        Schema.Struct({
          text: Schema.String,
          tag: Schema.optional(Schema.String),
          embedding: Schema.optional(Schema.Array(Schema.Number)),
        }),
      )
        .index("by_text", ["text"])
        .searchIndex("text", { searchField: "text", filterFields: ["tag"] })
        .vectorIndex("embedding", {
          vectorField: "embedding",
          dimensions: 4,
          filterFields: ["tag"],
        })("notes");

      const first = notes.tableDefinition;
      const second = notes.tableDefinition;
      expect(first).toBe(second);

      // Materialised definition mirrors the chained Convex builder.
      const expected = defineTable({
        text: v.string(),
        tag: v.optional(v.string()),
        embedding: v.optional(v.array(v.number())),
      })
        .index("by_text", ["text"])
        .searchIndex("text", { searchField: "text", filterFields: ["tag"] })
        .vectorIndex("embedding", {
          vectorField: "embedding",
          dimensions: 4,
          filterFields: ["tag"],
        });
      expect(first).toStrictEqual(expected);
    });

    it("`tableDefinition` forces `Fields` exactly once, even if `Fields` was already forced", () => {
      const { calls, lazyFields } = makeInstrumented();
      const notes = Table.make(lazyFields)("notes");
      void notes.Fields;
      void notes.tableDefinition;
      void notes.Fields;
      void notes.tableDefinition;
      expect(calls.count).toBe(1);
    });
  });
});
