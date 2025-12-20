import type {
  GenericTableIndexes,
  GenericTableSearchIndexes,
  GenericTableVectorIndexes,
  TableDefinition,
} from "convex/server";
import type { GenericValidator } from "convex/values";
import { Schema } from "effect";
import { describe, expect, expectTypeOf, test } from "vitest";

import * as ConfectTable from "./ConfectTable";
import type { ExtendWithSystemFields } from "./SystemFields";

// ----- Test Setup -----

const NoteSchema = Schema.Struct({
  content: Schema.String,
  priority: Schema.Number,
});

const UserSchema = Schema.Struct({
  username: Schema.String,
  email: Schema.String,
  active: Schema.Boolean,
});

const notesTable = ConfectTable.make({
  name: "notes",
  fields: NoteSchema,
}).index("by_priority", ["priority"]);

const usersTable = ConfectTable.make({
  name: "users",
  fields: UserSchema,
})
  .index("by_username", ["username"])
  .searchIndex("search_email", { searchField: "email", filterFields: [] });

const _embeddingsTable = ConfectTable.make({
  name: "embeddings",
  fields: Schema.Struct({
    embedding: Schema.Array(Schema.Number),
    category: Schema.String,
  }),
}).vectorIndex("by_embedding", {
  vectorField: "embedding",
  dimensions: 1536,
  filterFields: ["category"],
});

type NotesTable = typeof notesTable;
type UsersTable = typeof usersTable;
type EmbeddingsTable = typeof _embeddingsTable;

// ----- Tests -----

describe("TypeId", () => {
  test("is the expected string literal", () => {
    type Expected = "@rjdellecese/confect/ConfectTable";
    expectTypeOf<ConfectTable.TypeId>().toEqualTypeOf<Expected>();
  });

  test("runtime value matches type", () => {
    expect(ConfectTable.TypeId).toBe("@rjdellecese/confect/ConfectTable");
  });
});

describe("isConfectTable", () => {
  test("returns true for ConfectTable instances", () => {
    expect(ConfectTable.isConfectTable(notesTable)).toBe(true);
    expect(ConfectTable.isConfectTable(usersTable)).toBe(true);
  });

  test("returns false for non-ConfectTable values", () => {
    expect(ConfectTable.isConfectTable({})).toBe(false);
    expect(ConfectTable.isConfectTable(null)).toBe(false);
    expect(ConfectTable.isConfectTable(undefined)).toBe(false);
    expect(ConfectTable.isConfectTable("string")).toBe(false);
    expect(ConfectTable.isConfectTable(123)).toBe(false);
  });

  test("is a type guard for ConfectTable.Any", () => {
    const maybeTable: unknown = notesTable;
    if (ConfectTable.isConfectTable(maybeTable)) {
      expectTypeOf(maybeTable).toExtend<ConfectTable.ConfectTable.Any>();
    }
  });
});

describe("ConfectTable interface", () => {
  describe("TypeId property", () => {
    test("has TypeId property with correct value", () => {
      type TypeIdKey = typeof ConfectTable.TypeId;
      expectTypeOf<NotesTable[TypeIdKey]>().toEqualTypeOf<
        typeof ConfectTable.TypeId
      >();
    });
  });

  describe("tableDefinition property", () => {
    test("has tableDefinition of correct type", () => {
      expectTypeOf<NotesTable["tableDefinition"]>().toExtend<
        TableDefinition<any, any, any, any>
      >();
    });
  });

  describe("name property", () => {
    test("notes table has correct name type", () => {
      expectTypeOf<NotesTable["name"]>().toEqualTypeOf<"notes">();
    });

    test("users table has correct name type", () => {
      expectTypeOf<UsersTable["name"]>().toEqualTypeOf<"users">();
    });

    test("runtime name value is correct", () => {
      expect(notesTable.name).toBe("notes");
      expect(usersTable.name).toBe("users");
    });
  });

  describe("Fields property", () => {
    test("contains the original schema", () => {
      expectTypeOf<NotesTable["Fields"]>().toEqualTypeOf<typeof NoteSchema>();
    });

    test("users table has correct Fields type", () => {
      expectTypeOf<UsersTable["Fields"]>().toEqualTypeOf<typeof UserSchema>();
    });
  });

  describe("Doc property", () => {
    test("is ExtendWithSystemFields of the schema", () => {
      expectTypeOf<NotesTable["Doc"]>().toEqualTypeOf<
        ExtendWithSystemFields<"notes", typeof NoteSchema>
      >();
    });

    test("users table has correct Doc type", () => {
      expectTypeOf<UsersTable["Doc"]>().toEqualTypeOf<
        ExtendWithSystemFields<"users", typeof UserSchema>
      >();
    });
  });

  describe("indexes property", () => {
    test("notes table has by_priority index", () => {
      expectTypeOf<NotesTable["indexes"]["by_priority"]>().toEqualTypeOf<
        ["priority", "_creationTime"]
      >();
    });

    test("users table has by_username index", () => {
      expectTypeOf<UsersTable["indexes"]["by_username"]>().toEqualTypeOf<
        ["username", "_creationTime"]
      >();
    });

    test("runtime indexes are correct", () => {
      expect(notesTable.indexes).toEqual({
        by_priority: ["priority"],
      });
    });
  });
});

describe("ConfectTable.index", () => {
  test("adds index to the indexes record", () => {
    const tableWithIndex = ConfectTable.make({
      name: "test",
      fields: Schema.Struct({ field1: Schema.String }),
    }).index("by_field1", ["field1"]);

    expectTypeOf<
      (typeof tableWithIndex)["indexes"]["by_field1"]
    >().toEqualTypeOf<["field1", "_creationTime"]>();
  });

  test("can chain multiple indexes", () => {
    const tableWithIndexes = ConfectTable.make({
      name: "test",
      fields: Schema.Struct({
        field1: Schema.String,
        field2: Schema.Number,
      }),
    })
      .index("by_field1", ["field1"])
      .index("by_field2", ["field2"]);

    expectTypeOf<
      (typeof tableWithIndexes)["indexes"]["by_field1"]
    >().toEqualTypeOf<["field1", "_creationTime"]>();
    expectTypeOf<
      (typeof tableWithIndexes)["indexes"]["by_field2"]
    >().toEqualTypeOf<["field2", "_creationTime"]>();
  });

  test("supports compound indexes", () => {
    const tableWithCompoundIndex = ConfectTable.make({
      name: "test",
      fields: Schema.Struct({
        field1: Schema.String,
        field2: Schema.Number,
      }),
    }).index("by_field1_and_field2", ["field1", "field2"]);

    expectTypeOf<
      (typeof tableWithCompoundIndex)["indexes"]["by_field1_and_field2"]
    >().toEqualTypeOf<["field1", "field2", "_creationTime"]>();
  });

  test("supports indexing on system fields", () => {
    const tableWithSystemFieldIndex = ConfectTable.make({
      name: "test",
      fields: Schema.Struct({ field1: Schema.String }),
    }).index("by_creation_time", ["_creationTime"]);

    expectTypeOf<
      (typeof tableWithSystemFieldIndex)["indexes"]["by_creation_time"]
    >().toEqualTypeOf<["_creationTime", "_creationTime"]>();
  });
});

describe("ConfectTable.searchIndex", () => {
  test("adds search index to the table definition", () => {
    const tableWithSearch = ConfectTable.make({
      name: "test",
      fields: Schema.Struct({
        content: Schema.String,
        category: Schema.String,
      }),
    }).searchIndex("search_content", {
      searchField: "content",
      filterFields: ["category"],
    });

    // The return type should still be a ConfectTable
    expectTypeOf(tableWithSearch).toExtend<ConfectTable.ConfectTable.Any>();
    expect(tableWithSearch.name).toBe("test");
  });

  test("can be chained with index", () => {
    const table = ConfectTable.make({
      name: "test",
      fields: Schema.Struct({
        content: Schema.String,
        category: Schema.String,
      }),
    })
      .index("by_category", ["category"])
      .searchIndex("search_content", {
        searchField: "content",
        filterFields: [],
      });

    expectTypeOf<(typeof table)["indexes"]["by_category"]>().toEqualTypeOf<
      ["category", "_creationTime"]
    >();
  });
});

describe("ConfectTable.vectorIndex", () => {
  test("adds vector index to the table definition", () => {
    const tableWithVector = ConfectTable.make({
      name: "test",
      fields: Schema.Struct({
        embedding: Schema.Array(Schema.Number),
        category: Schema.String,
      }),
    }).vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["category"],
    });

    expectTypeOf(tableWithVector).toExtend<ConfectTable.ConfectTable.Any>();
    expect(tableWithVector.name).toBe("test");
  });

  test("can be chained with index and searchIndex", () => {
    const table = ConfectTable.make({
      name: "test",
      fields: Schema.Struct({
        embedding: Schema.Array(Schema.Number),
        content: Schema.String,
        category: Schema.String,
      }),
    })
      .index("by_category", ["category"])
      .searchIndex("search_content", {
        searchField: "content",
        filterFields: [],
      })
      .vectorIndex("by_embedding", {
        vectorField: "embedding",
        dimensions: 1536,
      });

    expectTypeOf<(typeof table)["indexes"]["by_category"]>().toEqualTypeOf<
      ["category", "_creationTime"]
    >();
  });
});

describe("ConfectTable.Any", () => {
  test("has TypeId property", () => {
    type TypeIdKey = typeof ConfectTable.TypeId;
    type Any = ConfectTable.ConfectTable.Any;
    expectTypeOf<Any[TypeIdKey]>().toEqualTypeOf<typeof ConfectTable.TypeId>();
  });

  test("ConfectTable extends Any", () => {
    expectTypeOf<NotesTable>().toExtend<ConfectTable.ConfectTable.Any>();
  });

  test("UsersTable extends Any", () => {
    expectTypeOf<UsersTable>().toExtend<ConfectTable.ConfectTable.Any>();
  });
});

describe("ConfectTable.AnyWithProps", () => {
  test("extends Any", () => {
    expectTypeOf<ConfectTable.ConfectTable.AnyWithProps>().toExtend<ConfectTable.ConfectTable.Any>();
  });

  test("has name property", () => {
    type AnyWithProps = ConfectTable.ConfectTable.AnyWithProps;
    expectTypeOf<AnyWithProps["name"]>().toExtend<string>();
  });

  test("has Fields property", () => {
    type AnyWithProps = ConfectTable.ConfectTable.AnyWithProps;
    expectTypeOf<
      AnyWithProps["Fields"]
    >().toExtend<Schema.Schema.AnyNoContext>();
  });

  test("has tableDefinition property", () => {
    type AnyWithProps = ConfectTable.ConfectTable.AnyWithProps;
    expectTypeOf<AnyWithProps["tableDefinition"]>().toExtend<
      TableDefinition<
        GenericValidator,
        GenericTableIndexes,
        GenericTableSearchIndexes,
        GenericTableVectorIndexes
      >
    >();
  });

  test("has indexes property", () => {
    type AnyWithProps = ConfectTable.ConfectTable.AnyWithProps;
    expectTypeOf<AnyWithProps["indexes"]>().toExtend<GenericTableIndexes>();
  });

  test("ConfectTable extends AnyWithProps", () => {
    expectTypeOf<NotesTable>().toExtend<ConfectTable.ConfectTable.AnyWithProps>();
  });
});

describe("ConfectTable.Name", () => {
  test("extracts table name from NotesTable", () => {
    type Name = ConfectTable.ConfectTable.Name<NotesTable>;
    expectTypeOf<Name>().toEqualTypeOf<"notes">();
  });

  test("extracts table name from UsersTable", () => {
    type Name = ConfectTable.ConfectTable.Name<UsersTable>;
    expectTypeOf<Name>().toEqualTypeOf<"users">();
  });

  test("extracts table name from EmbeddingsTable", () => {
    type Name = ConfectTable.ConfectTable.Name<EmbeddingsTable>;
    expectTypeOf<Name>().toEqualTypeOf<"embeddings">();
  });
});

describe("ConfectTable.TableSchema", () => {
  test("extracts TableSchema from NotesTable", () => {
    type TableSchema = ConfectTable.ConfectTable.TableSchema<NotesTable>;
    expectTypeOf<TableSchema>().toEqualTypeOf<typeof NoteSchema>();
  });

  test("extracts TableSchema from UsersTable", () => {
    type TableSchema = ConfectTable.ConfectTable.TableSchema<UsersTable>;
    expectTypeOf<TableSchema>().toEqualTypeOf<typeof UserSchema>();
  });
});

describe("ConfectTable.TableValidator", () => {
  test("extracts TableValidator from NotesTable", () => {
    type TableValidator = ConfectTable.ConfectTable.TableValidator<NotesTable>;
    expectTypeOf<TableValidator>().toExtend<GenericValidator>();
  });

  test("extracts TableValidator from UsersTable", () => {
    type TableValidator = ConfectTable.ConfectTable.TableValidator<UsersTable>;
    expectTypeOf<TableValidator>().toExtend<GenericValidator>();
  });
});

describe("ConfectTable.Indexes", () => {
  test("extracts Indexes from NotesTable", () => {
    type Indexes = ConfectTable.ConfectTable.Indexes<NotesTable>;
    expectTypeOf<Indexes>().toEqualTypeOf<{
      by_priority: ["priority", "_creationTime"];
    }>();
  });

  test("extracts Indexes from UsersTable", () => {
    type Indexes = ConfectTable.ConfectTable.Indexes<UsersTable>;
    expectTypeOf<Indexes>().toEqualTypeOf<{
      by_username: ["username", "_creationTime"];
    }>();
  });

  test("extracts empty Indexes from table without indexes", () => {
    const tableNoIndexes = ConfectTable.make({
      name: "no_indexes",
      fields: Schema.Struct({ field: Schema.String }),
    });
    type Indexes = ConfectTable.ConfectTable.Indexes<typeof tableNoIndexes>;
    expectTypeOf<Indexes>().toEqualTypeOf<{}>();
  });
});

describe("ConfectTable.SearchIndexes", () => {
  test("extracts SearchIndexes from NotesTable (empty)", () => {
    type SearchIndexes = ConfectTable.ConfectTable.SearchIndexes<NotesTable>;
    expectTypeOf<SearchIndexes>().toEqualTypeOf<{}>();
  });

  test("extracts SearchIndexes from UsersTable", () => {
    type SearchIndexes = ConfectTable.ConfectTable.SearchIndexes<UsersTable>;
    expectTypeOf<SearchIndexes>().toEqualTypeOf<{
      search_email: {
        searchField: "email";
        filterFields: never;
      };
    }>();
  });
});

describe("ConfectTable.VectorIndexes", () => {
  test("extracts VectorIndexes from NotesTable (empty)", () => {
    type VectorIndexes = ConfectTable.ConfectTable.VectorIndexes<NotesTable>;
    expectTypeOf<VectorIndexes>().toEqualTypeOf<{}>();
  });

  test("extracts VectorIndexes from EmbeddingsTable", () => {
    type VectorIndexes =
      ConfectTable.ConfectTable.VectorIndexes<EmbeddingsTable>;
    expectTypeOf<VectorIndexes>().toEqualTypeOf<{
      by_embedding: {
        vectorField: "embedding";
        dimensions: number;
        filterFields: "category";
      };
    }>();
  });
});

describe("ConfectTable.Doc", () => {
  test("extracts Doc type from NotesTable", () => {
    type Doc = ConfectTable.ConfectTable.Doc<NotesTable>;
    expectTypeOf<Doc>().toEqualTypeOf<
      ExtendWithSystemFields<"notes", typeof NoteSchema>
    >();
  });

  test("extracts Doc type from UsersTable", () => {
    type Doc = ConfectTable.ConfectTable.Doc<UsersTable>;
    expectTypeOf<Doc>().toEqualTypeOf<
      ExtendWithSystemFields<"users", typeof UserSchema>
    >();
  });
});

describe("ConfectTable.Fields", () => {
  test("extracts Fields from NotesTable", () => {
    type Fields = ConfectTable.ConfectTable.Fields<NotesTable>;
    expectTypeOf<Fields>().toEqualTypeOf<typeof NoteSchema>();
  });

  test("extracts Fields from UsersTable", () => {
    type Fields = ConfectTable.ConfectTable.Fields<UsersTable>;
    expectTypeOf<Fields>().toEqualTypeOf<typeof UserSchema>();
  });
});

describe("ConfectTable.WithName", () => {
  type AllTables = NotesTable | UsersTable | EmbeddingsTable;

  test("extracts NotesTable by name", () => {
    type Result = ConfectTable.ConfectTable.WithName<AllTables, "notes">;
    expectTypeOf<Result>().toEqualTypeOf<NotesTable>();
  });

  test("extracts UsersTable by name", () => {
    type Result = ConfectTable.ConfectTable.WithName<AllTables, "users">;
    expectTypeOf<Result>().toEqualTypeOf<UsersTable>();
  });

  test("extracts EmbeddingsTable by name", () => {
    type Result = ConfectTable.ConfectTable.WithName<AllTables, "embeddings">;
    expectTypeOf<Result>().toEqualTypeOf<EmbeddingsTable>();
  });
});

describe("ConfectTable.TablesRecord", () => {
  type AllTables = NotesTable | UsersTable;

  test("creates record keyed by table name", () => {
    type Record = ConfectTable.ConfectTable.TablesRecord<AllTables>;
    expectTypeOf<keyof Record>().toEqualTypeOf<"notes" | "users">();
  });

  test("record values are the correct tables", () => {
    type Record = ConfectTable.ConfectTable.TablesRecord<AllTables>;
    expectTypeOf<Record["notes"]>().toEqualTypeOf<NotesTable>();
    expectTypeOf<Record["users"]>().toEqualTypeOf<UsersTable>();
  });
});

describe("make", () => {
  test("creates ConfectTable with correct name", () => {
    const table = ConfectTable.make({
      name: "test_table",
      fields: Schema.Struct({ field: Schema.String }),
    });

    expect(table.name).toBe("test_table");
    expectTypeOf<(typeof table)["name"]>().toEqualTypeOf<"test_table">();
  });

  test("creates ConfectTable with correct Fields", () => {
    const fields = Schema.Struct({ field: Schema.String });
    const table = ConfectTable.make({
      name: "test_table",
      fields,
    });

    expectTypeOf<(typeof table)["Fields"]>().toEqualTypeOf<typeof fields>();
  });

  test("creates ConfectTable with empty indexes", () => {
    const table = ConfectTable.make({
      name: "test_table",
      fields: Schema.Struct({ field: Schema.String }),
    });

    expect(table.indexes).toEqual({});
  });

  test("returns a ConfectTable that passes isConfectTable", () => {
    const table = ConfectTable.make({
      name: "test_table",
      fields: Schema.Struct({ field: Schema.String }),
    });

    expect(ConfectTable.isConfectTable(table)).toBe(true);
  });
});

describe("System tables", () => {
  describe("scheduledFunctionsTable", () => {
    test("has correct name", () => {
      expect(ConfectTable.scheduledFunctionsTable.name).toBe(
        "_scheduled_functions",
      );
    });

    test("is a ConfectTable", () => {
      expect(
        ConfectTable.isConfectTable(ConfectTable.scheduledFunctionsTable),
      ).toBe(true);
    });

    test("has correct name type", () => {
      expectTypeOf<
        (typeof ConfectTable.scheduledFunctionsTable)["name"]
      >().toEqualTypeOf<"_scheduled_functions">();
    });
  });

  describe("storageTable", () => {
    test("has correct name", () => {
      expect(ConfectTable.storageTable.name).toBe("_storage");
    });

    test("is a ConfectTable", () => {
      expect(ConfectTable.isConfectTable(ConfectTable.storageTable)).toBe(true);
    });

    test("has correct name type", () => {
      expectTypeOf<
        (typeof ConfectTable.storageTable)["name"]
      >().toEqualTypeOf<"_storage">();
    });
  });

  describe("confectSystemTables", () => {
    test("contains _scheduled_functions", () => {
      expect(ConfectTable.confectSystemTables._scheduled_functions).toBe(
        ConfectTable.scheduledFunctionsTable,
      );
    });

    test("contains _storage", () => {
      expect(ConfectTable.confectSystemTables._storage).toBe(
        ConfectTable.storageTable,
      );
    });

    test("has correct keys", () => {
      expectTypeOf<
        keyof typeof ConfectTable.confectSystemTables
      >().toEqualTypeOf<"_scheduled_functions" | "_storage">();
    });
  });

  describe("ConfectSystemTables type", () => {
    test("is union of system tables", () => {
      expectTypeOf<ConfectTable.ConfectSystemTables>().toEqualTypeOf<
        | typeof ConfectTable.scheduledFunctionsTable
        | typeof ConfectTable.storageTable
      >();
    });

    test("extends ConfectTable.Any", () => {
      expectTypeOf<ConfectTable.ConfectSystemTables>().toExtend<ConfectTable.ConfectTable.Any>();
    });
  });
});

// ----- Edge cases and complex scenarios -----

describe("Edge cases", () => {
  describe("table with optional fields", () => {
    const tableWithOptional = ConfectTable.make({
      name: "with_optional",
      fields: Schema.Struct({
        required: Schema.String,
        optional: Schema.optional(Schema.Number),
      }),
    });

    test("creates table successfully", () => {
      expect(tableWithOptional.name).toBe("with_optional");
      expect(ConfectTable.isConfectTable(tableWithOptional)).toBe(true);
    });
  });

  describe("table with nested struct", () => {
    const tableWithNested = ConfectTable.make({
      name: "with_nested",
      fields: Schema.Struct({
        nested: Schema.Struct({
          inner: Schema.String,
          value: Schema.Number,
        }),
      }),
    });

    test("creates table successfully", () => {
      expect(tableWithNested.name).toBe("with_nested");
    });
  });

  describe("table with array fields", () => {
    const tableWithArray = ConfectTable.make({
      name: "with_array",
      fields: Schema.Struct({
        items: Schema.Array(Schema.String),
        numbers: Schema.Array(Schema.Number),
      }),
    });

    test("creates table successfully", () => {
      expect(tableWithArray.name).toBe("with_array");
    });
  });

  describe("table with union fields", () => {
    const tableWithUnion = ConfectTable.make({
      name: "with_union",
      fields: Schema.Struct({
        status: Schema.Union(
          Schema.Literal("pending"),
          Schema.Literal("active"),
          Schema.Literal("completed"),
        ),
      }),
    });

    test("creates table successfully", () => {
      expect(tableWithUnion.name).toBe("with_union");
    });
  });

  describe("chaining all index types", () => {
    const fullTable = ConfectTable.make({
      name: "full",
      fields: Schema.Struct({
        field1: Schema.String,
        field2: Schema.Number,
        embedding: Schema.Array(Schema.Number),
        searchable: Schema.String,
      }),
    })
      .index("by_field1", ["field1"])
      .index("by_field2", ["field2"])
      .searchIndex("search", { searchField: "searchable", filterFields: [] })
      .vectorIndex("by_embedding", {
        vectorField: "embedding",
        dimensions: 768,
      });

    test("has all indexes", () => {
      expectTypeOf<(typeof fullTable)["indexes"]["by_field1"]>().toEqualTypeOf<
        ["field1", "_creationTime"]
      >();
      expectTypeOf<(typeof fullTable)["indexes"]["by_field2"]>().toEqualTypeOf<
        ["field2", "_creationTime"]
      >();
    });

    test("is still a ConfectTable", () => {
      expect(ConfectTable.isConfectTable(fullTable)).toBe(true);
    });
  });

  describe("preserves table identity through chaining", () => {
    const baseTable = ConfectTable.make({
      name: "base",
      fields: Schema.Struct({ field: Schema.String }),
    });

    const withIndex = baseTable.index("by_field", ["field"]);

    test("chained table has same name", () => {
      expect(withIndex.name).toBe("base");
    });

    test("chained table has same Fields", () => {
      expectTypeOf<(typeof withIndex)["Fields"]>().toEqualTypeOf<
        (typeof baseTable)["Fields"]
      >();
    });

    test("chained table is a ConfectTable", () => {
      expect(ConfectTable.isConfectTable(withIndex)).toBe(true);
    });
  });
});
