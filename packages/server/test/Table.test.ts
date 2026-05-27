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
import { Schema } from "effect";
import * as Table from "../src/Table";

describe("Table", () => {
  it("tableDefinition property should extend a generic Convex TableDefinition", () => {
    const confectNotesTableDefinition = Table.make(
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
      }).tableDefinition;
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
    const confectOrganizationsTableDefinition = Table.make(
      Schema.Struct({
        name: Schema.String,
        description: Schema.optional(Schema.String),
        createdBy: Schema.optional(GenericId.GenericId("users")),
      }),
    )
      .index("by_name", ["name"])
      .searchIndex("search_name", { searchField: "name" }).tableDefinition;

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
    const confectImagesTableDefinition = Table.make(
      Schema.Struct({
        name: Schema.String,
        bytes: Schema.optional(Schema.instanceOf(ArrayBuffer)),
      }),
    ).index("by_name", ["name"]).tableDefinition;

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
    const fields = Schema.Struct({ text: Schema.String });

    it("Table.make(fields) returns an UnnamedTable", () => {
      const unnamed = Table.make(fields);
      expect(Table.isUnnamedTable(unnamed)).toBe(true);
      expect(Table.isTable(unnamed)).toBe(false);
      // No `tableName` property on the unnamed callable, so the discriminator
      // is `tableName` presence — not `name`, which every JS function has
      // (Function.prototype.name) and which would silently mislead any
      // hasProperty-style predicate.
      expect("tableName" in unnamed).toBe(false);
    });

    it("chaining .index() stays unnamed", () => {
      const unnamedWithIndex = Table.make(fields).index("by_text", ["text"]);
      expect(Table.isUnnamedTable(unnamedWithIndex)).toBe(true);
      expect(Table.isTable(unnamedWithIndex)).toBe(false);
    });

    it("invoking the callable with a name produces a bound Table", () => {
      const named = Table.make(fields)("notes");
      expect(Table.isTable(named)).toBe(true);
      expect(Table.isUnnamedTable(named)).toBe(false);
      expect(named.tableName).toBe("notes");
      expectTypeOf(named.tableName).toEqualTypeOf<"notes">();
    });

    it("the unnamed callable still has Function.prototype.name and that does not confuse the predicate", () => {
      const unnamed = Table.make(fields);
      expect(typeof (unnamed as unknown as { name: unknown }).name).toBe(
        "string",
      );
      expect(Table.isUnnamedTable(unnamed)).toBe(true);
    });

    it("invoking the same UnnamedTable with different names produces distinct Tables", () => {
      const unnamed = Table.make(fields);
      const a = unnamed("notes_a");
      const b = unnamed("notes_b");
      expect(a.tableName).toBe("notes_a");
      expect(b.tableName).toBe("notes_b");
      expectTypeOf(a.tableName).toEqualTypeOf<"notes_a">();
      expectTypeOf(b.tableName).toEqualTypeOf<"notes_b">();
    });
  });
});
