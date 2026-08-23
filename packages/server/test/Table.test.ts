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
import * as Table from "@confect/server/Table";

describe("Table.tableDefinition", () => {
  it("should extend a generic Convex TableDefinition", () => {
    const confectNotesTableDefinition = Table.tableDefinition(
      Table.make(() =>
        Schema.Struct({
          userId: Schema.optionalKey(GenericId.GenericId("users")),
          text: Schema.String.check(Schema.isMaxLength(100)),
          tag: Schema.optionalKey(Schema.String),
          author: Schema.optionalKey(
            Schema.Struct({
              role: Schema.Literals(["admin", "user"]),
              name: Schema.String,
            }),
          ),
          embedding: Schema.optionalKey(Schema.Array(Schema.Finite)),
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
        })("notes"),
    );
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

    // The two definitions cannot be compared with `toEqualTypeOf` as a whole:
    // `ValueToValidator` derives `VUnion` member tuples via `UnionToTuple`,
    // whose element order follows TypeScript's internal union interning and is
    // not stable across programs (vitest vs `tsc -b`) or unrelated code
    // changes, while `v.union(...)` fixes the tuple in argument order. Compare
    // the order-insensitive projections instead; the runtime `toStrictEqual`
    // below still pins the exact validator structure (member order included).
    type Projections<TableDefinition_> =
      TableDefinition_ extends TableDefinition<
        infer Validator_,
        infer Indexes_,
        infer SearchIndexes_,
        infer VectorIndexes_
      >
        ? {
            documentType: Validator_["type"];
            fieldPaths: Validator_["fieldPaths"];
            isOptional: Validator_["isOptional"];
            indexes: Indexes_;
            searchIndexes: SearchIndexes_;
            vectorIndexes: VectorIndexes_;
          }
        : never;

    expectTypeOf<Projections<ConfectNotesTableDefinition>>().toEqualTypeOf<
      Projections<ConvexNotesTableDefinition>
    >();

    expect(convexNotesTableDefinition).toStrictEqual(
      confectNotesTableDefinition,
    );
  });

  it("supports indexes on name fields when the schema includes an optional ID", () => {
    const confectOrganizationsTableDefinition = Table.tableDefinition(
      Table.make(() =>
        Schema.Struct({
          name: Schema.String,
          description: Schema.optional(Schema.String),
          createdBy: Schema.optional(GenericId.GenericId("users")),
        }),
      )
        .index("by_name", ["name"])
        .searchIndex("search_name", { searchField: "name" })("organizations"),
    );

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
    const confectImagesTableDefinition = Table.tableDefinition(
      Table.make(() =>
        Schema.Struct({
          name: Schema.String,
          bytes: Schema.optional(Schema.instanceOf(ArrayBuffer)),
        }),
      ).index("by_name", ["name"])("images"),
    );

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

  describe("lazy compilation", () => {
    const makeInstrumented = () => {
      const calls = { count: 0 };
      const lazyFields = () => {
        calls.count += 1;
        return Schema.Struct({ text: Schema.String });
      };
      return { calls, lazyFields };
    };

    it("is `===`-stable and materialises all chained indexes/searchIndexes/vectorIndexes", () => {
      const notes = Table.make(() =>
        Schema.Struct({
          text: Schema.String,
          tag: Schema.optional(Schema.String),
          embedding: Schema.optional(Schema.Array(Schema.Finite)),
        }),
      )
        .index("by_text", ["text"])
        .searchIndex("text", { searchField: "text", filterFields: ["tag"] })
        .vectorIndex("embedding", {
          vectorField: "embedding",
          dimensions: 4,
          filterFields: ["tag"],
        })("notes");

      const first = Table.tableDefinition(notes);
      const second = Table.tableDefinition(notes);
      expect(first).toBe(second);

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

    it("forces `Fields` exactly once, even if `Fields` was already forced", () => {
      const { calls, lazyFields } = makeInstrumented();
      const notes = Table.make(lazyFields)("notes");
      void notes.Fields;
      void Table.tableDefinition(notes);
      void notes.Fields;
      void Table.tableDefinition(notes);
      expect(calls.count).toBe(1);
    });
  });
});
