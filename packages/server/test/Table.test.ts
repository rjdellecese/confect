import type {
  GenericTableIndexes,
  GenericTableSearchIndexes,
  GenericTableVectorIndexes,
  TableDefinition,
} from "convex/server";
import type { GenericValidator } from "convex/values";
import { Schema } from "effect";
import { describe, expect, expectTypeOf, test } from "vitest";

import type { ExtendWithSystemFields } from "@confect/core/SystemFields";
import * as Table from "../src/Table";

const NoteSchema = Schema.Struct({
  content: Schema.String,
  priority: Schema.Number,
});

const UserSchema = Schema.Struct({
  username: Schema.String,
  email: Schema.String,
  active: Schema.Boolean,
});

const notesTable = Table.make("notes", NoteSchema).index("by_priority", [
  "priority",
]);

const usersTable = Table.make("users", UserSchema)
  .index("by_username", ["username"])
  .searchIndex("search_email", { searchField: "email", filterFields: [] });

const _embeddingsTable = Table.make(
  "embeddings",
  Schema.Struct({
    embedding: Schema.Array(Schema.Number),
    category: Schema.String,
  }),
).vectorIndex("by_embedding", {
  vectorField: "embedding",
  dimensions: 1536,
  filterFields: ["category"],
});

type NotesTable = typeof notesTable;
type UsersTable = typeof usersTable;
type EmbeddingsTable = typeof _embeddingsTable;

describe("isConfectTable", () => {
  test("returns true for ConfectTable instances", () => {
    expect(Table.isTable(notesTable)).toBe(true);
    expect(Table.isTable(usersTable)).toBe(true);
  });

  test("returns false for non-ConfectTable values", () => {
    expect(Table.isTable({})).toBe(false);
    expect(Table.isTable(null)).toBe(false);
    expect(Table.isTable(undefined)).toBe(false);
    expect(Table.isTable("string")).toBe(false);
    expect(Table.isTable(123)).toBe(false);
  });

  test("is a type guard for ConfectTable.Any", () => {
    const maybeTable: unknown = notesTable;
    if (Table.isTable(maybeTable)) {
      expectTypeOf(maybeTable).toExtend<Table.Any>();
    }
  });
});

describe("ConfectTable interface", () => {
  describe("TypeId property", () => {
    test("has TypeId property with correct value", () => {
      type TypeIdKey = typeof Table.TypeId;
      expectTypeOf<NotesTable[TypeIdKey]>().toEqualTypeOf<
        typeof Table.TypeId
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
    const _tableWithIndex = Table.make(
      "test",
      Schema.Struct({ field1: Schema.String }),
    ).index("by_field1", ["field1"]);

    expectTypeOf<
      (typeof _tableWithIndex)["indexes"]["by_field1"]
    >().toEqualTypeOf<["field1", "_creationTime"]>();
  });

  test("can chain multiple indexes", () => {
    const _tableWithIndexes = Table.make(
      "test",
      Schema.Struct({
        field1: Schema.String,
        field2: Schema.Number,
      }),
    )
      .index("by_field1", ["field1"])
      .index("by_field2", ["field2"]);

    expectTypeOf<
      (typeof _tableWithIndexes)["indexes"]["by_field1"]
    >().toEqualTypeOf<["field1", "_creationTime"]>();
    expectTypeOf<
      (typeof _tableWithIndexes)["indexes"]["by_field2"]
    >().toEqualTypeOf<["field2", "_creationTime"]>();
  });

  test("supports compound indexes", () => {
    const _tableWithCompoundIndex = Table.make(
      "test",
      Schema.Struct({
        field1: Schema.String,
        field2: Schema.Number,
      }),
    ).index("by_field1_and_field2", ["field1", "field2"]);

    expectTypeOf<
      (typeof _tableWithCompoundIndex)["indexes"]["by_field1_and_field2"]
    >().toEqualTypeOf<["field1", "field2", "_creationTime"]>();
  });

  test("supports indexing on system fields", () => {
    const _tableWithSystemFieldIndex = Table.make(
      "test",
      Schema.Struct({ field1: Schema.String }),
    ).index("by_creation_time", ["_creationTime"]);

    expectTypeOf<
      (typeof _tableWithSystemFieldIndex)["indexes"]["by_creation_time"]
    >().toEqualTypeOf<["_creationTime", "_creationTime"]>();
  });
});

describe("ConfectTable.searchIndex", () => {
  test("adds search index to the table definition", () => {
    const tableWithSearch = Table.make(
      "test",
      Schema.Struct({
        content: Schema.String,
        category: Schema.String,
      }),
    ).searchIndex("search_content", {
      searchField: "content",
      filterFields: ["category"],
    });

    expectTypeOf(tableWithSearch).toExtend<Table.Any>();
    expect(tableWithSearch.name).toBe("test");
  });

  test("can be chained with index", () => {
    const _table = Table.make(
      "test",
      Schema.Struct({
        content: Schema.String,
        category: Schema.String,
      }),
    )
      .index("by_category", ["category"])
      .searchIndex("search_content", {
        searchField: "content",
        filterFields: [],
      });

    expectTypeOf<(typeof _table)["indexes"]["by_category"]>().toEqualTypeOf<
      ["category", "_creationTime"]
    >();
  });
});

describe("ConfectTable.vectorIndex", () => {
  test("adds vector index to the table definition", () => {
    const tableWithVector = Table.make(
      "test",
      Schema.Struct({
        embedding: Schema.Array(Schema.Number),
        category: Schema.String,
      }),
    ).vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["category"],
    });

    expectTypeOf(tableWithVector).toExtend<Table.Any>();
    expect(tableWithVector.name).toBe("test");
  });

  test("can be chained with index and searchIndex", () => {
    const _table = Table.make(
      "test",
      Schema.Struct({
        embedding: Schema.Array(Schema.Number),
        content: Schema.String,
        category: Schema.String,
      }),
    )
      .index("by_category", ["category"])
      .searchIndex("search_content", {
        searchField: "content",
        filterFields: [],
      })
      .vectorIndex("by_embedding", {
        vectorField: "embedding",
        dimensions: 1536,
      });

    expectTypeOf<(typeof _table)["indexes"]["by_category"]>().toEqualTypeOf<
      ["category", "_creationTime"]
    >();
  });
});

describe("ConfectTable.Any", () => {
  test("has TypeId property", () => {
    type TypeIdKey = typeof Table.TypeId;
    type Any = Table.Any;
    expectTypeOf<Any[TypeIdKey]>().toEqualTypeOf<typeof Table.TypeId>();
  });

  test("ConfectTable extends Any", () => {
    expectTypeOf<NotesTable>().toExtend<Table.Any>();
  });

  test("UsersTable extends Any", () => {
    expectTypeOf<UsersTable>().toExtend<Table.Any>();
  });
});

describe("ConfectTable.AnyWithProps", () => {
  test("extends Any", () => {
    expectTypeOf<Table.AnyWithProps>().toExtend<Table.Any>();
  });

  test("has name property", () => {
    type AnyWithProps = Table.AnyWithProps;
    expectTypeOf<AnyWithProps["name"]>().toExtend<string>();
  });

  test("has Fields property", () => {
    type AnyWithProps = Table.AnyWithProps;
    expectTypeOf<
      AnyWithProps["Fields"]
    >().toExtend<Schema.Schema.AnyNoContext>();
  });

  test("has tableDefinition property", () => {
    type AnyWithProps = Table.AnyWithProps;
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
    type AnyWithProps = Table.AnyWithProps;
    expectTypeOf<AnyWithProps["indexes"]>().toExtend<GenericTableIndexes>();
  });

  test("ConfectTable extends AnyWithProps", () => {
    expectTypeOf<NotesTable>().toExtend<Table.AnyWithProps>();
  });
});

describe("ConfectTable.Name", () => {
  test("extracts table name from NotesTable", () => {
    type Name = Table.Name<NotesTable>;
    expectTypeOf<Name>().toEqualTypeOf<"notes">();
  });

  test("extracts table name from UsersTable", () => {
    type Name = Table.Name<UsersTable>;
    expectTypeOf<Name>().toEqualTypeOf<"users">();
  });

  test("extracts table name from EmbeddingsTable", () => {
    type Name = Table.Name<EmbeddingsTable>;
    expectTypeOf<Name>().toEqualTypeOf<"embeddings">();
  });
});

describe("ConfectTable.TableSchema", () => {
  test("extracts TableSchema from NotesTable", () => {
    type TableSchema = Table.TableSchema<NotesTable>;
    expectTypeOf<TableSchema>().toEqualTypeOf<typeof NoteSchema>();
  });

  test("extracts TableSchema from UsersTable", () => {
    type TableSchema = Table.TableSchema<UsersTable>;
    expectTypeOf<TableSchema>().toEqualTypeOf<typeof UserSchema>();
  });
});

describe("ConfectTable.TableValidator", () => {
  test("extracts TableValidator from NotesTable", () => {
    type TableValidator = Table.TableValidator<NotesTable>;
    expectTypeOf<TableValidator>().toExtend<GenericValidator>();
  });

  test("extracts TableValidator from UsersTable", () => {
    type TableValidator = Table.TableValidator<UsersTable>;
    expectTypeOf<TableValidator>().toExtend<GenericValidator>();
  });
});

describe("ConfectTable.Indexes", () => {
  test("extracts Indexes from NotesTable", () => {
    type Indexes = Table.Indexes<NotesTable>;
    expectTypeOf<Indexes>().toEqualTypeOf<{
      by_priority: ["priority", "_creationTime"];
    }>();
  });

  test("extracts Indexes from UsersTable", () => {
    type Indexes = Table.Indexes<UsersTable>;
    expectTypeOf<Indexes>().toEqualTypeOf<{
      by_username: ["username", "_creationTime"];
    }>();
  });

  test("extracts empty Indexes from table without indexes", () => {
    const _tableNoIndexes = Table.make(
      "no_indexes",
      Schema.Struct({ field: Schema.String }),
    );
    type Indexes = Table.Indexes<typeof _tableNoIndexes>;
    expectTypeOf<Indexes>().toEqualTypeOf<{}>();
  });
});

describe("ConfectTable.SearchIndexes", () => {
  test("extracts SearchIndexes from NotesTable (empty)", () => {
    type SearchIndexes = Table.SearchIndexes<NotesTable>;
    expectTypeOf<SearchIndexes>().toEqualTypeOf<{}>();
  });

  test("extracts SearchIndexes from UsersTable", () => {
    type SearchIndexes = Table.SearchIndexes<UsersTable>;
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
    type VectorIndexes = Table.VectorIndexes<NotesTable>;
    expectTypeOf<VectorIndexes>().toEqualTypeOf<{}>();
  });

  test("extracts VectorIndexes from EmbeddingsTable", () => {
    type VectorIndexes = Table.VectorIndexes<EmbeddingsTable>;
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
    type Doc = Table.Doc<NotesTable>;
    expectTypeOf<Doc>().toEqualTypeOf<
      ExtendWithSystemFields<"notes", typeof NoteSchema>
    >();
  });

  test("extracts Doc type from UsersTable", () => {
    type Doc = Table.Doc<UsersTable>;
    expectTypeOf<Doc>().toEqualTypeOf<
      ExtendWithSystemFields<"users", typeof UserSchema>
    >();
  });
});

describe("ConfectTable.Fields", () => {
  test("extracts Fields from NotesTable", () => {
    type Fields = Table.Fields<NotesTable>;
    expectTypeOf<Fields>().toEqualTypeOf<typeof NoteSchema>();
  });

  test("extracts Fields from UsersTable", () => {
    type Fields = Table.Fields<UsersTable>;
    expectTypeOf<Fields>().toEqualTypeOf<typeof UserSchema>();
  });
});

describe("ConfectTable.WithName", () => {
  type AllTables = NotesTable | UsersTable | EmbeddingsTable;

  test("extracts NotesTable by name", () => {
    type Result = Table.WithName<AllTables, "notes">;
    expectTypeOf<Result>().toEqualTypeOf<NotesTable>();
  });

  test("extracts UsersTable by name", () => {
    type Result = Table.WithName<AllTables, "users">;
    expectTypeOf<Result>().toEqualTypeOf<UsersTable>();
  });

  test("extracts EmbeddingsTable by name", () => {
    type Result = Table.WithName<AllTables, "embeddings">;
    expectTypeOf<Result>().toEqualTypeOf<EmbeddingsTable>();
  });
});

describe("ConfectTable.TablesRecord", () => {
  type AllTables = NotesTable | UsersTable;

  test("creates record keyed by table name", () => {
    type Record = Table.TablesRecord<AllTables>;
    expectTypeOf<keyof Record>().toEqualTypeOf<"notes" | "users">();
  });

  test("record values are the correct tables", () => {
    type Record = Table.TablesRecord<AllTables>;
    expectTypeOf<Record["notes"]>().toEqualTypeOf<NotesTable>();
    expectTypeOf<Record["users"]>().toEqualTypeOf<UsersTable>();
  });
});

describe("make", () => {
  test("creates ConfectTable with correct name", () => {
    const table = Table.make(
      "test_table",
      Schema.Struct({ field: Schema.String }),
    );

    expect(table.name).toBe("test_table");
    expectTypeOf<(typeof table)["name"]>().toEqualTypeOf<"test_table">();
  });

  test("creates ConfectTable with correct Fields", () => {
    const fields = Schema.Struct({ field: Schema.String });
    const _table = Table.make("test_table", fields);

    expectTypeOf<(typeof _table)["Fields"]>().toEqualTypeOf<typeof fields>();
  });

  test("creates ConfectTable with empty indexes", () => {
    const table = Table.make(
      "test_table",
      Schema.Struct({ field: Schema.String }),
    );

    expect(table.indexes).toEqual({});
  });

  test("returns a ConfectTable that passes isConfectTable", () => {
    const table = Table.make(
      "test_table",
      Schema.Struct({ field: Schema.String }),
    );

    expect(Table.isTable(table)).toBe(true);
  });
});

describe("System tables", () => {
  describe("scheduledFunctionsTable", () => {
    test("has correct name", () => {
      expect(Table.scheduledFunctionsTable.name).toBe("_scheduled_functions");
    });

    test("is a ConfectTable", () => {
      expect(Table.isTable(Table.scheduledFunctionsTable)).toBe(true);
    });

    test("has correct name type", () => {
      expectTypeOf<
        (typeof Table.scheduledFunctionsTable)["name"]
      >().toEqualTypeOf<"_scheduled_functions">();
    });
  });

  describe("storageTable", () => {
    test("has correct name", () => {
      expect(Table.storageTable.name).toBe("_storage");
    });

    test("is a ConfectTable", () => {
      expect(Table.isTable(Table.storageTable)).toBe(true);
    });

    test("has correct name type", () => {
      expectTypeOf<
        (typeof Table.storageTable)["name"]
      >().toEqualTypeOf<"_storage">();
    });
  });

  describe("systemTables", () => {
    test("contains _scheduled_functions", () => {
      expect(Table.systemTables._scheduled_functions).toBe(
        Table.scheduledFunctionsTable,
      );
    });

    test("contains _storage", () => {
      expect(Table.systemTables._storage).toBe(Table.storageTable);
    });

    test("has correct keys", () => {
      expectTypeOf<keyof typeof Table.systemTables>().toEqualTypeOf<
        "_scheduled_functions" | "_storage"
      >();
    });
  });

  describe("ConfectSystemTables type", () => {
    test("is union of system tables", () => {
      expectTypeOf<Table.SystemTables>().toEqualTypeOf<
        typeof Table.scheduledFunctionsTable | typeof Table.storageTable
      >();
    });

    test("extends ConfectTable.Any", () => {
      expectTypeOf<Table.SystemTables>().toExtend<Table.Any>();
    });
  });
});

// ----- Edge cases and complex scenarios -----

describe("Edge cases", () => {
  describe("table with optional fields", () => {
    const tableWithOptional = Table.make(
      "with_optional",
      Schema.Struct({
        required: Schema.String,
        optional: Schema.optional(Schema.Number),
      }),
    );

    test("creates table successfully", () => {
      expect(tableWithOptional.name).toBe("with_optional");
      expect(Table.isTable(tableWithOptional)).toBe(true);
    });
  });

  describe("table with nested struct", () => {
    const tableWithNested = Table.make(
      "with_nested",
      Schema.Struct({
        nested: Schema.Struct({
          inner: Schema.String,
          value: Schema.Number,
        }),
      }),
    );

    test("creates table successfully", () => {
      expect(tableWithNested.name).toBe("with_nested");
    });
  });

  describe("table with array fields", () => {
    const tableWithArray = Table.make(
      "with_array",
      Schema.Struct({
        items: Schema.Array(Schema.String),
        numbers: Schema.Array(Schema.Number),
      }),
    );

    test("creates table successfully", () => {
      expect(tableWithArray.name).toBe("with_array");
    });
  });

  describe("table with union fields", () => {
    const tableWithUnion = Table.make(
      "with_union",
      Schema.Struct({
        status: Schema.Union(
          Schema.Literal("pending"),
          Schema.Literal("active"),
          Schema.Literal("completed"),
        ),
      }),
    );

    test("creates table successfully", () => {
      expect(tableWithUnion.name).toBe("with_union");
    });
  });

  describe("chaining all index types", () => {
    const fullTable = Table.make(
      "full",
      Schema.Struct({
        field1: Schema.String,
        field2: Schema.Number,
        embedding: Schema.Array(Schema.Number),
        searchable: Schema.String,
      }),
    )
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
      expect(Table.isTable(fullTable)).toBe(true);
    });
  });

  describe("preserves table identity through chaining", () => {
    const baseTable = Table.make(
      "base",
      Schema.Struct({ field: Schema.String }),
    );

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
      expect(Table.isTable(withIndex)).toBe(true);
    });
  });
});
