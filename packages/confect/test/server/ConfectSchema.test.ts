import type { GenericSchema, SchemaDefinition } from "convex/server";
import { Schema } from "effect";
import { describe, expect, expectTypeOf, test } from "vitest";

import * as DatabaseSchema from "../../src/server/DatabaseSchema";
import * as ConfectTable from "../../src/server/Table";

const NoteSchema = Schema.Struct({
  content: Schema.String,
  priority: Schema.Number,
});

const UserSchema = Schema.Struct({
  username: Schema.String,
  email: Schema.String,
});

const notesTable = ConfectTable.make("notes", NoteSchema).index("by_priority", ["priority"]);

const usersTable = ConfectTable.make("users", UserSchema);

const confectSchema = DatabaseSchema.make()
  .addTable(notesTable)
  .addTable(usersTable);

type TestConfectSchema = typeof confectSchema;
type NotesTable = typeof notesTable;
type UsersTable = typeof usersTable;

describe("TypeId", () => {
  test("is the expected string literal", () => {
    type Expected = "@rjdellecese/confect/server/Schema";
    expectTypeOf<DatabaseSchema.TypeId>().toEqualTypeOf<Expected>();
  });

  test("runtime value matches type", () => {
    expect(DatabaseSchema.TypeId).toBe("@rjdellecese/confect/server/Schema");
  });
});

describe("isConfectSchema", () => {
  test("returns true for ConfectSchema instances", () => {
    const schema = DatabaseSchema.make();
    expect(DatabaseSchema.isSchema(schema)).toBe(true);
  });

  test("returns true for schema with tables", () => {
    expect(DatabaseSchema.isSchema(confectSchema)).toBe(true);
  });

  test("returns false for non-ConfectSchema values", () => {
    expect(DatabaseSchema.isSchema({})).toBe(false);
    expect(DatabaseSchema.isSchema(null)).toBe(false);
    expect(DatabaseSchema.isSchema(undefined)).toBe(false);
    expect(DatabaseSchema.isSchema("string")).toBe(false);
    expect(DatabaseSchema.isSchema(123)).toBe(false);
  });

  test("returns false for ConfectTable (similar structure but different TypeId)", () => {
    expect(DatabaseSchema.isSchema(notesTable)).toBe(false);
  });

  test("is a type guard for DatabaseSchema.Any", () => {
    const maybeSchema: unknown = confectSchema;
    if (DatabaseSchema.isSchema(maybeSchema)) {
      expectTypeOf(maybeSchema).toExtend<DatabaseSchema.DatabaseSchema.Any>();
    }
  });
});

describe("ConfectSchema interface", () => {
  describe("TypeId property", () => {
    test("has TypeId property with correct value", () => {
      type TypeIdKey = typeof DatabaseSchema.TypeId;
      expectTypeOf<TestConfectSchema[TypeIdKey]>().toEqualTypeOf<
        typeof DatabaseSchema.TypeId
      >();
    });
  });

  describe("tables property", () => {
    test("has tables property with correct table names as keys", () => {
      expectTypeOf<keyof TestConfectSchema["tables"]>().toEqualTypeOf<
        "notes" | "users"
      >();
    });

    test("tables property values are the correct ConfectTable types", () => {
      expectTypeOf<
        TestConfectSchema["tables"]["notes"]
      >().toEqualTypeOf<NotesTable>();
      expectTypeOf<
        TestConfectSchema["tables"]["users"]
      >().toEqualTypeOf<UsersTable>();
    });

    test("runtime tables are correct", () => {
      expect(Object.keys(confectSchema.tables)).toEqual(["notes", "users"]);
      expect(confectSchema.tables.notes).toBe(notesTable);
      expect(confectSchema.tables.users).toBe(usersTable);
    });
  });

  describe("convexSchemaDefinition property", () => {
    test("has convexSchemaDefinition property", () => {
      expectTypeOf<TestConfectSchema["convexSchemaDefinition"]>().toExtend<
        SchemaDefinition<GenericSchema, true>
      >();
    });

    test("runtime convexSchemaDefinition is a SchemaDefinition", () => {
      expect(confectSchema.convexSchemaDefinition).toBeDefined();
    });
  });
});

describe("DatabaseSchema.addTable", () => {
  test("adds table to the schema", () => {
    const _schema = DatabaseSchema.make();
    const _schemaWithNotes = _schema.addTable(notesTable);

    expectTypeOf<
      keyof (typeof _schemaWithNotes)["tables"]
    >().toEqualTypeOf<"notes">();
  });

  test("can chain multiple addTable calls", () => {
    const _schema = DatabaseSchema.make()
      .addTable(notesTable)
      .addTable(usersTable);

    expectTypeOf<keyof (typeof _schema)["tables"]>().toEqualTypeOf<
      "notes" | "users"
    >();
  });

  test("runtime tables are accumulated", () => {
    const schema = DatabaseSchema.make();
    expect(Object.keys(schema.tables)).toEqual([]);

    const schemaWithNotes = schema.addTable(notesTable);
    expect(Object.keys(schemaWithNotes.tables)).toEqual(["notes"]);

    const schemaWithBoth = schemaWithNotes.addTable(usersTable);
    expect(Object.keys(schemaWithBoth.tables)).toEqual(["notes", "users"]);
  });

  test("returns a ConfectSchema that passes isConfectSchema", () => {
    const schema = DatabaseSchema.make().addTable(notesTable);
    expect(DatabaseSchema.isSchema(schema)).toBe(true);
  });

  test("preserves table references", () => {
    const schema = DatabaseSchema.make().addTable(notesTable);
    expect(schema.tables.notes).toBe(notesTable);
  });
});

describe("DatabaseSchema.Any", () => {
  test("has TypeId property", () => {
    type TypeIdKey = typeof DatabaseSchema.TypeId;
    type Any = DatabaseSchema.DatabaseSchema.Any;
    expectTypeOf<Any[TypeIdKey]>().toEqualTypeOf<typeof DatabaseSchema.TypeId>();
  });

  test("ConfectSchema extends Any", () => {
    expectTypeOf<TestConfectSchema>().toExtend<DatabaseSchema.DatabaseSchema.Any>();
  });

  test("empty schema extends Any", () => {
    const _emptySchema = DatabaseSchema.make();
    expectTypeOf<typeof _emptySchema>().toExtend<DatabaseSchema.DatabaseSchema.Any>();
  });
});

describe("DatabaseSchema.AnyWithProps", () => {
  test("extends Any", () => {
    expectTypeOf<DatabaseSchema.DatabaseSchema.AnyWithProps>().toExtend<DatabaseSchema.DatabaseSchema.Any>();
  });

  test("has tables property as Record", () => {
    type Tables = DatabaseSchema.DatabaseSchema.AnyWithProps["tables"];
    expectTypeOf<Tables>().toExtend<
      Record<string, ConfectTable.Table.AnyWithProps>
    >();
  });

  test("has convexSchemaDefinition property", () => {
    type ConvexSchemaDef =
      DatabaseSchema.DatabaseSchema.AnyWithProps["convexSchemaDefinition"];
    expectTypeOf<ConvexSchemaDef>().toExtend<
      SchemaDefinition<GenericSchema, true>
    >();
  });

  test("has addTable method", () => {
    type AddTable = DatabaseSchema.DatabaseSchema.AnyWithProps["addTable"];
    expectTypeOf<AddTable>().toBeFunction();
  });

  test("ConfectSchema extends AnyWithProps", () => {
    expectTypeOf<TestConfectSchema>().toExtend<DatabaseSchema.DatabaseSchema.AnyWithProps>();
  });
});

describe("DatabaseSchema.Tables", () => {
  test("extracts tables union from schema", () => {
    type Tables = DatabaseSchema.DatabaseSchema.Tables<TestConfectSchema>;
    expectTypeOf<Tables>().toEqualTypeOf<NotesTable | UsersTable>();
  });

  test("single table schema returns that table", () => {
    const _singleTableSchema = DatabaseSchema.make().addTable(notesTable);
    type Tables = DatabaseSchema.DatabaseSchema.Tables<typeof _singleTableSchema>;
    expectTypeOf<Tables>().toEqualTypeOf<NotesTable>();
  });
});

describe("DatabaseSchema.TableNames", () => {
  test("extracts table names as union of string literals", () => {
    type TableNames = DatabaseSchema.DatabaseSchema.TableNames<TestConfectSchema>;
    expectTypeOf<TableNames>().toEqualTypeOf<"notes" | "users">();
  });

  test("is a string type", () => {
    type TableNames = DatabaseSchema.DatabaseSchema.TableNames<TestConfectSchema>;
    expectTypeOf<TableNames>().toExtend<string>();
  });

  test("single table schema has single name", () => {
    const _singleTableSchema = DatabaseSchema.make().addTable(notesTable);
    type TableNames = DatabaseSchema.DatabaseSchema.TableNames<
      typeof _singleTableSchema
    >;
    expectTypeOf<TableNames>().toEqualTypeOf<"notes">();
  });
});

describe("DatabaseSchema.TableWithName", () => {
  test("returns the correct table for notes", () => {
    type Table = DatabaseSchema.DatabaseSchema.TableWithName<TestConfectSchema, "notes">;

    expectTypeOf<Table["name"]>().toEqualTypeOf<"notes">();
    expectTypeOf<Table>().toEqualTypeOf<NotesTable>();
  });

  test("returns the correct table for users", () => {
    type Table = DatabaseSchema.DatabaseSchema.TableWithName<TestConfectSchema, "users">;

    expectTypeOf<Table["name"]>().toEqualTypeOf<"users">();
    expectTypeOf<Table>().toEqualTypeOf<UsersTable>();
  });

  test("preserves table indexes", () => {
    type NotesTableFromSchema = DatabaseSchema.DatabaseSchema.TableWithName<
      TestConfectSchema,
      "notes"
    >;

    expectTypeOf<
      NotesTableFromSchema["indexes"]["by_priority"]
    >().toEqualTypeOf<["priority", "_creationTime"]>();
  });
});

describe("make", () => {
  test("creates empty ConfectSchema", () => {
    const schema = DatabaseSchema.make();
    expect(Object.keys(schema.tables)).toEqual([]);
  });

  test("returns a ConfectSchema that passes isConfectSchema", () => {
    const schema = DatabaseSchema.make();
    expect(DatabaseSchema.isSchema(schema)).toBe(true);
  });

  test("has convexSchemaDefinition", () => {
    const schema = DatabaseSchema.make();
    expect(schema.convexSchemaDefinition).toBeDefined();
  });

  test("tables type is never for empty schema", () => {
    const _schema = DatabaseSchema.make();
    type Tables = DatabaseSchema.DatabaseSchema.Tables<typeof _schema>;
    expectTypeOf<Tables>().toEqualTypeOf<never>();
  });
});

describe("systemSchema", () => {
  test("is a ConfectSchema", () => {
    expect(DatabaseSchema.isSchema(DatabaseSchema.systemSchema)).toBe(true);
  });

  test("contains _scheduled_functions table", () => {
    expect(DatabaseSchema.systemSchema.tables._scheduled_functions).toBe(
      ConfectTable.scheduledFunctionsTable,
    );
  });

  test("contains _storage table", () => {
    expect(DatabaseSchema.systemSchema.tables._storage).toBe(
      ConfectTable.storageTable,
    );
  });

  test("has correct table names", () => {
    type TableNames = DatabaseSchema.DatabaseSchema.TableNames<
      typeof DatabaseSchema.systemSchema
    >;
    expectTypeOf<TableNames>().toEqualTypeOf<
      "_scheduled_functions" | "_storage"
    >();
  });
});

describe("extendWithSystemTables", () => {
  test("return type is a record with original table names as keys", () => {
    type TestTables = NotesTable | UsersTable;
    const tablesRecord: ConfectTable.Table.TablesRecord<TestTables> = {
      notes: notesTable,
      users: usersTable,
    };

    const _extended = DatabaseSchema.extendWithSystemTables(tablesRecord);

    expectTypeOf<keyof typeof _extended>().toEqualTypeOf<
      "notes" | "users" | "_scheduled_functions" | "_storage"
    >();
  });

  test("return type has correct table types at each key", () => {
    type TestTables = NotesTable | UsersTable;
    const tablesRecord: ConfectTable.Table.TablesRecord<TestTables> = {
      notes: notesTable,
      users: usersTable,
    };

    const _extended = DatabaseSchema.extendWithSystemTables(tablesRecord);

    expectTypeOf<(typeof _extended)["notes"]>().toEqualTypeOf<NotesTable>();
    expectTypeOf<(typeof _extended)["users"]>().toEqualTypeOf<UsersTable>();
    expectTypeOf<(typeof _extended)["_scheduled_functions"]>().toEqualTypeOf<
      typeof ConfectTable.scheduledFunctionsTable
    >();
    expectTypeOf<(typeof _extended)["_storage"]>().toEqualTypeOf<
      typeof ConfectTable.storageTable
    >();
  });

  test("allows type-safe property access for system tables", () => {
    type TestTables = NotesTable | UsersTable;
    const tablesRecord: ConfectTable.Table.TablesRecord<TestTables> = {
      notes: notesTable,
      users: usersTable,
    };

    const extended = DatabaseSchema.extendWithSystemTables(tablesRecord);

    expect(extended._scheduled_functions).toBe(
      ConfectTable.scheduledFunctionsTable,
    );
    expect(extended._storage).toBe(ConfectTable.storageTable);
  });

  test("allows type-safe property access for original tables", () => {
    type TestTables = NotesTable | UsersTable;
    const tablesRecord: ConfectTable.Table.TablesRecord<TestTables> = {
      notes: notesTable,
      users: usersTable,
    };

    const extended = DatabaseSchema.extendWithSystemTables(tablesRecord);

    expect(extended.notes).toBe(notesTable);
    expect(extended.users).toBe(usersTable);
  });

  test("return type extends TablesRecord of extended tables union", () => {
    type TestTables = NotesTable | UsersTable;
    type ExtendedTables = TestTables | ConfectTable.SystemTables;

    const tablesRecord: ConfectTable.Table.TablesRecord<TestTables> = {
      notes: notesTable,
      users: usersTable,
    };

    const extended = DatabaseSchema.extendWithSystemTables(tablesRecord);

    expectTypeOf(extended).toExtend<
      ConfectTable.Table.TablesRecord<ExtendedTables>
    >();
  });
});

describe("ExtendWithSystemTables", () => {
  test("is a record type with all table names as keys", () => {
    type TestTables = NotesTable | UsersTable;
    type Extended = DatabaseSchema.ExtendWithSystemTables<TestTables>;

    expectTypeOf<keyof Extended>().toEqualTypeOf<
      "notes" | "users" | "_scheduled_functions" | "_storage"
    >();
  });

  test("maps original table names to their table types", () => {
    type TestTables = NotesTable | UsersTable;
    type Extended = DatabaseSchema.ExtendWithSystemTables<TestTables>;

    expectTypeOf<Extended["notes"]>().toEqualTypeOf<NotesTable>();
    expectTypeOf<Extended["users"]>().toEqualTypeOf<UsersTable>();
  });

  test("maps system table names to their table types", () => {
    type TestTables = NotesTable | UsersTable;
    type Extended = DatabaseSchema.ExtendWithSystemTables<TestTables>;

    expectTypeOf<Extended["_scheduled_functions"]>().toEqualTypeOf<
      typeof ConfectTable.scheduledFunctionsTable
    >();
    expectTypeOf<Extended["_storage"]>().toEqualTypeOf<
      typeof ConfectTable.storageTable
    >();
  });

  test("is equivalent to TablesRecord of extended tables union", () => {
    type TestTables = NotesTable | UsersTable;
    type ExtendedTablesUnion = TestTables | ConfectTable.SystemTables;
    type Extended = DatabaseSchema.ExtendWithSystemTables<TestTables>;

    expectTypeOf<Extended>().toEqualTypeOf<
      ConfectTable.Table.TablesRecord<ExtendedTablesUnion>
    >();
  });

  test("works with single table input", () => {
    type TestTables = NotesTable;
    type Extended = DatabaseSchema.ExtendWithSystemTables<TestTables>;

    expectTypeOf<keyof Extended>().toEqualTypeOf<
      "notes" | "_scheduled_functions" | "_storage"
    >();
    expectTypeOf<Extended["notes"]>().toEqualTypeOf<NotesTable>();
  });
});

describe("Edge cases", () => {
  describe("schema with table with optional fields", () => {
    const tableWithOptional = ConfectTable.make(
      "with_optional",
      Schema.Struct({
        required: Schema.String,
        optional: Schema.optional(Schema.Number),
      }),
    );

    const schemaWithOptional = DatabaseSchema.make().addTable(tableWithOptional);

    test("creates schema successfully", () => {
      expect(DatabaseSchema.isSchema(schemaWithOptional)).toBe(true);
    });

    test("has correct table names", () => {
      type TableNames = DatabaseSchema.DatabaseSchema.TableNames<
        typeof schemaWithOptional
      >;
      expectTypeOf<TableNames>().toEqualTypeOf<"with_optional">();
    });
  });

  describe("schema with table with nested struct", () => {
    const tableWithNested = ConfectTable.make(
      "with_nested",
      Schema.Struct({
        nested: Schema.Struct({
          inner: Schema.String,
          value: Schema.Number,
        }),
      }),
    );

    const schemaWithNested = DatabaseSchema.make().addTable(tableWithNested);

    test("creates schema successfully", () => {
      expect(DatabaseSchema.isSchema(schemaWithNested)).toBe(true);
    });
  });

  describe("schema with table with multiple indexes", () => {
    const tableWithIndexes = ConfectTable.make(
      "indexed",
      Schema.Struct({
        field1: Schema.String,
        field2: Schema.Number,
        field3: Schema.Boolean,
      }),
    )
      .index("by_field1", ["field1"])
      .index("by_field2", ["field2"])
      .index("by_field1_and_field2", ["field1", "field2"]);

    const _schemaWithIndexes = DatabaseSchema.make().addTable(tableWithIndexes);

    test("preserves indexes in schema table", () => {
      type Table = DatabaseSchema.DatabaseSchema.TableWithName<
        typeof _schemaWithIndexes,
        "indexed"
      >;

      expectTypeOf<Table["indexes"]["by_field1"]>().toEqualTypeOf<
        ["field1", "_creationTime"]
      >();
      expectTypeOf<Table["indexes"]["by_field2"]>().toEqualTypeOf<
        ["field2", "_creationTime"]
      >();
      expectTypeOf<Table["indexes"]["by_field1_and_field2"]>().toEqualTypeOf<
        ["field1", "field2", "_creationTime"]
      >();
    });
  });

  describe("schema with many tables", () => {
    const table1 = ConfectTable.make("table1", Schema.Struct({ a: Schema.String }));
    const table2 = ConfectTable.make("table2", Schema.Struct({ b: Schema.Number }));
    const table3 = ConfectTable.make("table3", Schema.Struct({ c: Schema.Boolean }));
    const table4 = ConfectTable.make("table4", Schema.Struct({ d: Schema.Array(Schema.String) }));

    const largeSchema = DatabaseSchema.make()
      .addTable(table1)
      .addTable(table2)
      .addTable(table3)
      .addTable(table4);

    test("contains all tables", () => {
      type TableNames = DatabaseSchema.DatabaseSchema.TableNames<typeof largeSchema>;
      expectTypeOf<TableNames>().toEqualTypeOf<
        "table1" | "table2" | "table3" | "table4"
      >();
    });

    test("runtime tables are all present", () => {
      expect(Object.keys(largeSchema.tables).sort()).toEqual([
        "table1",
        "table2",
        "table3",
        "table4",
      ]);
    });
  });

  describe("schema with search and vector indexes", () => {
    const tableWithSearch = ConfectTable.make(
      "searchable",
      Schema.Struct({
        content: Schema.String,
        category: Schema.String,
      }),
    ).searchIndex("search_content", {
      searchField: "content",
      filterFields: ["category"],
    });

    const tableWithVector = ConfectTable.make(
      "vectorized",
      Schema.Struct({
        embedding: Schema.Array(Schema.Number),
        label: Schema.String,
      }),
    ).vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["label"],
    });

    const schemaWithAdvancedIndexes = DatabaseSchema.make()
      .addTable(tableWithSearch)
      .addTable(tableWithVector);

    test("creates schema successfully", () => {
      expect(DatabaseSchema.isSchema(schemaWithAdvancedIndexes)).toBe(true);
    });

    test("has correct table names", () => {
      type TableNames = DatabaseSchema.DatabaseSchema.TableNames<
        typeof schemaWithAdvancedIndexes
      >;
      expectTypeOf<TableNames>().toEqualTypeOf<"searchable" | "vectorized">();
    });
  });

  describe("empty schema behavior", () => {
    const emptySchema = DatabaseSchema.make();

    test("tables record is empty", () => {
      expect(Object.keys(emptySchema.tables)).toHaveLength(0);
    });

    test("TableNames is never", () => {
      type TableNames = DatabaseSchema.DatabaseSchema.TableNames<typeof emptySchema>;
      expectTypeOf<TableNames>().toEqualTypeOf<never>();
    });

    test("Tables is never", () => {
      type Tables = DatabaseSchema.DatabaseSchema.Tables<typeof emptySchema>;
      expectTypeOf<Tables>().toEqualTypeOf<never>();
    });
  });

  describe("schema identity through chaining", () => {
    const base = DatabaseSchema.make();
    const withNotes = base.addTable(notesTable);
    const withBoth = withNotes.addTable(usersTable);

    test("each step is a valid ConfectSchema", () => {
      expect(DatabaseSchema.isSchema(base)).toBe(true);
      expect(DatabaseSchema.isSchema(withNotes)).toBe(true);
      expect(DatabaseSchema.isSchema(withBoth)).toBe(true);
    });

    test("each step has progressively more tables", () => {
      expect(Object.keys(base.tables)).toHaveLength(0);
      expect(Object.keys(withNotes.tables)).toHaveLength(1);
      expect(Object.keys(withBoth.tables)).toHaveLength(2);
    });
  });
});
