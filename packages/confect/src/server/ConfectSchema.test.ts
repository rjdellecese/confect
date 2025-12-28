import type { GenericSchema, SchemaDefinition } from "convex/server";
import { Schema } from "effect";
import { describe, expect, expectTypeOf, test } from "vitest";

import * as ConfectSchema from "./ConfectSchema";
import * as ConfectTable from "./ConfectTable";

const NoteSchema = Schema.Struct({
  content: Schema.String,
  priority: Schema.Number,
});

const UserSchema = Schema.Struct({
  username: Schema.String,
  email: Schema.String,
});

const notesTable = ConfectTable.make({
  name: "notes",
  fields: NoteSchema,
}).index("by_priority", ["priority"]);

const usersTable = ConfectTable.make({
  name: "users",
  fields: UserSchema,
});

const confectSchema = ConfectSchema.make()
  .addTable(notesTable)
  .addTable(usersTable);

type TestConfectSchema = typeof confectSchema;
type NotesTable = typeof notesTable;
type UsersTable = typeof usersTable;

describe("TypeId", () => {
  test("is the expected string literal", () => {
    type Expected = "@rjdellecese/confect/server/ConfectSchema";
    expectTypeOf<ConfectSchema.TypeId>().toEqualTypeOf<Expected>();
  });

  test("runtime value matches type", () => {
    expect(ConfectSchema.TypeId).toBe(
      "@rjdellecese/confect/server/ConfectSchema",
    );
  });
});

describe("isConfectSchema", () => {
  test("returns true for ConfectSchema instances", () => {
    const schema = ConfectSchema.make();
    expect(ConfectSchema.isConfectSchema(schema)).toBe(true);
  });

  test("returns true for schema with tables", () => {
    expect(ConfectSchema.isConfectSchema(confectSchema)).toBe(true);
  });

  test("returns false for non-ConfectSchema values", () => {
    expect(ConfectSchema.isConfectSchema({})).toBe(false);
    expect(ConfectSchema.isConfectSchema(null)).toBe(false);
    expect(ConfectSchema.isConfectSchema(undefined)).toBe(false);
    expect(ConfectSchema.isConfectSchema("string")).toBe(false);
    expect(ConfectSchema.isConfectSchema(123)).toBe(false);
  });

  test("returns false for ConfectTable (similar structure but different TypeId)", () => {
    expect(ConfectSchema.isConfectSchema(notesTable)).toBe(false);
  });

  test("is a type guard for ConfectSchema.Any", () => {
    const maybeSchema: unknown = confectSchema;
    if (ConfectSchema.isConfectSchema(maybeSchema)) {
      expectTypeOf(maybeSchema).toExtend<ConfectSchema.ConfectSchema.Any>();
    }
  });
});

describe("ConfectSchema interface", () => {
  describe("TypeId property", () => {
    test("has TypeId property with correct value", () => {
      type TypeIdKey = typeof ConfectSchema.TypeId;
      expectTypeOf<TestConfectSchema[TypeIdKey]>().toEqualTypeOf<
        typeof ConfectSchema.TypeId
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

describe("ConfectSchema.addTable", () => {
  test("adds table to the schema", () => {
    const _schema = ConfectSchema.make();
    const _schemaWithNotes = _schema.addTable(notesTable);

    expectTypeOf<
      keyof (typeof _schemaWithNotes)["tables"]
    >().toEqualTypeOf<"notes">();
  });

  test("can chain multiple addTable calls", () => {
    const _schema = ConfectSchema.make()
      .addTable(notesTable)
      .addTable(usersTable);

    expectTypeOf<keyof (typeof _schema)["tables"]>().toEqualTypeOf<
      "notes" | "users"
    >();
  });

  test("runtime tables are accumulated", () => {
    const schema = ConfectSchema.make();
    expect(Object.keys(schema.tables)).toEqual([]);

    const schemaWithNotes = schema.addTable(notesTable);
    expect(Object.keys(schemaWithNotes.tables)).toEqual(["notes"]);

    const schemaWithBoth = schemaWithNotes.addTable(usersTable);
    expect(Object.keys(schemaWithBoth.tables)).toEqual(["notes", "users"]);
  });

  test("returns a ConfectSchema that passes isConfectSchema", () => {
    const schema = ConfectSchema.make().addTable(notesTable);
    expect(ConfectSchema.isConfectSchema(schema)).toBe(true);
  });

  test("preserves table references", () => {
    const schema = ConfectSchema.make().addTable(notesTable);
    expect(schema.tables.notes).toBe(notesTable);
  });
});

describe("ConfectSchema.Any", () => {
  test("has TypeId property", () => {
    type TypeIdKey = typeof ConfectSchema.TypeId;
    type Any = ConfectSchema.ConfectSchema.Any;
    expectTypeOf<Any[TypeIdKey]>().toEqualTypeOf<typeof ConfectSchema.TypeId>();
  });

  test("ConfectSchema extends Any", () => {
    expectTypeOf<TestConfectSchema>().toExtend<ConfectSchema.ConfectSchema.Any>();
  });

  test("empty schema extends Any", () => {
    const _emptySchema = ConfectSchema.make();
    expectTypeOf<
      typeof _emptySchema
    >().toExtend<ConfectSchema.ConfectSchema.Any>();
  });
});

describe("ConfectSchema.AnyWithProps", () => {
  test("extends Any", () => {
    expectTypeOf<ConfectSchema.ConfectSchema.AnyWithProps>().toExtend<ConfectSchema.ConfectSchema.Any>();
  });

  test("has tables property as Record", () => {
    type Tables = ConfectSchema.ConfectSchema.AnyWithProps["tables"];
    expectTypeOf<Tables>().toExtend<
      Record<string, ConfectTable.ConfectTable.AnyWithProps>
    >();
  });

  test("has convexSchemaDefinition property", () => {
    type ConvexSchemaDef =
      ConfectSchema.ConfectSchema.AnyWithProps["convexSchemaDefinition"];
    expectTypeOf<ConvexSchemaDef>().toExtend<
      SchemaDefinition<GenericSchema, true>
    >();
  });

  test("has addTable method", () => {
    type AddTable = ConfectSchema.ConfectSchema.AnyWithProps["addTable"];
    expectTypeOf<AddTable>().toBeFunction();
  });

  test("ConfectSchema extends AnyWithProps", () => {
    expectTypeOf<TestConfectSchema>().toExtend<ConfectSchema.ConfectSchema.AnyWithProps>();
  });
});

describe("ConfectSchema.Tables", () => {
  test("extracts tables union from schema", () => {
    type Tables = ConfectSchema.ConfectSchema.Tables<TestConfectSchema>;
    expectTypeOf<Tables>().toEqualTypeOf<NotesTable | UsersTable>();
  });

  test("single table schema returns that table", () => {
    const _singleTableSchema = ConfectSchema.make().addTable(notesTable);
    type Tables = ConfectSchema.ConfectSchema.Tables<typeof _singleTableSchema>;
    expectTypeOf<Tables>().toEqualTypeOf<NotesTable>();
  });
});

describe("ConfectSchema.TableNames", () => {
  test("extracts table names as union of string literals", () => {
    type TableNames = ConfectSchema.ConfectSchema.TableNames<TestConfectSchema>;
    expectTypeOf<TableNames>().toEqualTypeOf<"notes" | "users">();
  });

  test("is a string type", () => {
    type TableNames = ConfectSchema.ConfectSchema.TableNames<TestConfectSchema>;
    expectTypeOf<TableNames>().toExtend<string>();
  });

  test("single table schema has single name", () => {
    const _singleTableSchema = ConfectSchema.make().addTable(notesTable);
    type TableNames = ConfectSchema.ConfectSchema.TableNames<
      typeof _singleTableSchema
    >;
    expectTypeOf<TableNames>().toEqualTypeOf<"notes">();
  });
});

describe("ConfectSchema.TableWithName", () => {
  test("returns the correct table for notes", () => {
    type Table = ConfectSchema.ConfectSchema.TableWithName<
      TestConfectSchema,
      "notes"
    >;

    expectTypeOf<Table["name"]>().toEqualTypeOf<"notes">();
    expectTypeOf<Table>().toEqualTypeOf<NotesTable>();
  });

  test("returns the correct table for users", () => {
    type Table = ConfectSchema.ConfectSchema.TableWithName<
      TestConfectSchema,
      "users"
    >;

    expectTypeOf<Table["name"]>().toEqualTypeOf<"users">();
    expectTypeOf<Table>().toEqualTypeOf<UsersTable>();
  });

  test("preserves table indexes", () => {
    type NotesTableFromSchema = ConfectSchema.ConfectSchema.TableWithName<
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
    const schema = ConfectSchema.make();
    expect(Object.keys(schema.tables)).toEqual([]);
  });

  test("returns a ConfectSchema that passes isConfectSchema", () => {
    const schema = ConfectSchema.make();
    expect(ConfectSchema.isConfectSchema(schema)).toBe(true);
  });

  test("has convexSchemaDefinition", () => {
    const schema = ConfectSchema.make();
    expect(schema.convexSchemaDefinition).toBeDefined();
  });

  test("tables type is never for empty schema", () => {
    const _schema = ConfectSchema.make();
    type Tables = ConfectSchema.ConfectSchema.Tables<typeof _schema>;
    expectTypeOf<Tables>().toEqualTypeOf<never>();
  });
});

describe("confectSystemSchema", () => {
  test("is a ConfectSchema", () => {
    expect(
      ConfectSchema.isConfectSchema(ConfectSchema.confectSystemSchema),
    ).toBe(true);
  });

  test("contains _scheduled_functions table", () => {
    expect(ConfectSchema.confectSystemSchema.tables._scheduled_functions).toBe(
      ConfectTable.scheduledFunctionsTable,
    );
  });

  test("contains _storage table", () => {
    expect(ConfectSchema.confectSystemSchema.tables._storage).toBe(
      ConfectTable.storageTable,
    );
  });

  test("has correct table names", () => {
    type TableNames = ConfectSchema.ConfectSchema.TableNames<
      typeof ConfectSchema.confectSystemSchema
    >;
    expectTypeOf<TableNames>().toEqualTypeOf<
      "_scheduled_functions" | "_storage"
    >();
  });
});

describe("extendWithConfectSystemTables", () => {
  test("return type is a record with original table names as keys", () => {
    type TestTables = NotesTable | UsersTable;
    const tablesRecord: ConfectTable.ConfectTable.TablesRecord<TestTables> = {
      notes: notesTable,
      users: usersTable,
    };

    const _extended = ConfectSchema.extendWithConfectSystemTables(tablesRecord);

    expectTypeOf<keyof typeof _extended>().toEqualTypeOf<
      "notes" | "users" | "_scheduled_functions" | "_storage"
    >();
  });

  test("return type has correct table types at each key", () => {
    type TestTables = NotesTable | UsersTable;
    const tablesRecord: ConfectTable.ConfectTable.TablesRecord<TestTables> = {
      notes: notesTable,
      users: usersTable,
    };

    const _extended = ConfectSchema.extendWithConfectSystemTables(tablesRecord);

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
    const tablesRecord: ConfectTable.ConfectTable.TablesRecord<TestTables> = {
      notes: notesTable,
      users: usersTable,
    };

    const extended = ConfectSchema.extendWithConfectSystemTables(tablesRecord);

    expect(extended._scheduled_functions).toBe(
      ConfectTable.scheduledFunctionsTable,
    );
    expect(extended._storage).toBe(ConfectTable.storageTable);
  });

  test("allows type-safe property access for original tables", () => {
    type TestTables = NotesTable | UsersTable;
    const tablesRecord: ConfectTable.ConfectTable.TablesRecord<TestTables> = {
      notes: notesTable,
      users: usersTable,
    };

    const extended = ConfectSchema.extendWithConfectSystemTables(tablesRecord);

    expect(extended.notes).toBe(notesTable);
    expect(extended.users).toBe(usersTable);
  });

  test("return type extends TablesRecord of extended tables union", () => {
    type TestTables = NotesTable | UsersTable;
    type ExtendedTables = TestTables | ConfectTable.ConfectSystemTables;

    const tablesRecord: ConfectTable.ConfectTable.TablesRecord<TestTables> = {
      notes: notesTable,
      users: usersTable,
    };

    const extended = ConfectSchema.extendWithConfectSystemTables(tablesRecord);

    expectTypeOf(extended).toExtend<
      ConfectTable.ConfectTable.TablesRecord<ExtendedTables>
    >();
  });
});

describe("ExtendWithConfectSystemTables", () => {
  test("is a record type with all table names as keys", () => {
    type TestTables = NotesTable | UsersTable;
    type Extended = ConfectSchema.ExtendWithConfectSystemTables<TestTables>;

    expectTypeOf<keyof Extended>().toEqualTypeOf<
      "notes" | "users" | "_scheduled_functions" | "_storage"
    >();
  });

  test("maps original table names to their table types", () => {
    type TestTables = NotesTable | UsersTable;
    type Extended = ConfectSchema.ExtendWithConfectSystemTables<TestTables>;

    expectTypeOf<Extended["notes"]>().toEqualTypeOf<NotesTable>();
    expectTypeOf<Extended["users"]>().toEqualTypeOf<UsersTable>();
  });

  test("maps system table names to their table types", () => {
    type TestTables = NotesTable | UsersTable;
    type Extended = ConfectSchema.ExtendWithConfectSystemTables<TestTables>;

    expectTypeOf<Extended["_scheduled_functions"]>().toEqualTypeOf<
      typeof ConfectTable.scheduledFunctionsTable
    >();
    expectTypeOf<Extended["_storage"]>().toEqualTypeOf<
      typeof ConfectTable.storageTable
    >();
  });

  test("is equivalent to TablesRecord of extended tables union", () => {
    type TestTables = NotesTable | UsersTable;
    type ExtendedTablesUnion = TestTables | ConfectTable.ConfectSystemTables;
    type Extended = ConfectSchema.ExtendWithConfectSystemTables<TestTables>;

    expectTypeOf<Extended>().toEqualTypeOf<
      ConfectTable.ConfectTable.TablesRecord<ExtendedTablesUnion>
    >();
  });

  test("works with single table input", () => {
    type TestTables = NotesTable;
    type Extended = ConfectSchema.ExtendWithConfectSystemTables<TestTables>;

    expectTypeOf<keyof Extended>().toEqualTypeOf<
      "notes" | "_scheduled_functions" | "_storage"
    >();
    expectTypeOf<Extended["notes"]>().toEqualTypeOf<NotesTable>();
  });
});

describe("Edge cases", () => {
  describe("schema with table with optional fields", () => {
    const tableWithOptional = ConfectTable.make({
      name: "with_optional",
      fields: Schema.Struct({
        required: Schema.String,
        optional: Schema.optional(Schema.Number),
      }),
    });

    const schemaWithOptional = ConfectSchema.make().addTable(tableWithOptional);

    test("creates schema successfully", () => {
      expect(ConfectSchema.isConfectSchema(schemaWithOptional)).toBe(true);
    });

    test("has correct table names", () => {
      type TableNames = ConfectSchema.ConfectSchema.TableNames<
        typeof schemaWithOptional
      >;
      expectTypeOf<TableNames>().toEqualTypeOf<"with_optional">();
    });
  });

  describe("schema with table with nested struct", () => {
    const tableWithNested = ConfectTable.make({
      name: "with_nested",
      fields: Schema.Struct({
        nested: Schema.Struct({
          inner: Schema.String,
          value: Schema.Number,
        }),
      }),
    });

    const schemaWithNested = ConfectSchema.make().addTable(tableWithNested);

    test("creates schema successfully", () => {
      expect(ConfectSchema.isConfectSchema(schemaWithNested)).toBe(true);
    });
  });

  describe("schema with table with multiple indexes", () => {
    const tableWithIndexes = ConfectTable.make({
      name: "indexed",
      fields: Schema.Struct({
        field1: Schema.String,
        field2: Schema.Number,
        field3: Schema.Boolean,
      }),
    })
      .index("by_field1", ["field1"])
      .index("by_field2", ["field2"])
      .index("by_field1_and_field2", ["field1", "field2"]);

    const _schemaWithIndexes = ConfectSchema.make().addTable(tableWithIndexes);

    test("preserves indexes in schema table", () => {
      type Table = ConfectSchema.ConfectSchema.TableWithName<
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
    const table1 = ConfectTable.make({
      name: "table1",
      fields: Schema.Struct({ a: Schema.String }),
    });
    const table2 = ConfectTable.make({
      name: "table2",
      fields: Schema.Struct({ b: Schema.Number }),
    });
    const table3 = ConfectTable.make({
      name: "table3",
      fields: Schema.Struct({ c: Schema.Boolean }),
    });
    const table4 = ConfectTable.make({
      name: "table4",
      fields: Schema.Struct({ d: Schema.Array(Schema.String) }),
    });

    const largeSchema = ConfectSchema.make()
      .addTable(table1)
      .addTable(table2)
      .addTable(table3)
      .addTable(table4);

    test("contains all tables", () => {
      type TableNames = ConfectSchema.ConfectSchema.TableNames<
        typeof largeSchema
      >;
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
    const tableWithSearch = ConfectTable.make({
      name: "searchable",
      fields: Schema.Struct({
        content: Schema.String,
        category: Schema.String,
      }),
    }).searchIndex("search_content", {
      searchField: "content",
      filterFields: ["category"],
    });

    const tableWithVector = ConfectTable.make({
      name: "vectorized",
      fields: Schema.Struct({
        embedding: Schema.Array(Schema.Number),
        label: Schema.String,
      }),
    }).vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["label"],
    });

    const schemaWithAdvancedIndexes = ConfectSchema.make()
      .addTable(tableWithSearch)
      .addTable(tableWithVector);

    test("creates schema successfully", () => {
      expect(ConfectSchema.isConfectSchema(schemaWithAdvancedIndexes)).toBe(
        true,
      );
    });

    test("has correct table names", () => {
      type TableNames = ConfectSchema.ConfectSchema.TableNames<
        typeof schemaWithAdvancedIndexes
      >;
      expectTypeOf<TableNames>().toEqualTypeOf<"searchable" | "vectorized">();
    });
  });

  describe("empty schema behavior", () => {
    const emptySchema = ConfectSchema.make();

    test("tables record is empty", () => {
      expect(Object.keys(emptySchema.tables)).toHaveLength(0);
    });

    test("TableNames is never", () => {
      type TableNames = ConfectSchema.ConfectSchema.TableNames<
        typeof emptySchema
      >;
      expectTypeOf<TableNames>().toEqualTypeOf<never>();
    });

    test("Tables is never", () => {
      type Tables = ConfectSchema.ConfectSchema.Tables<typeof emptySchema>;
      expectTypeOf<Tables>().toEqualTypeOf<never>();
    });
  });

  describe("schema identity through chaining", () => {
    const base = ConfectSchema.make();
    const withNotes = base.addTable(notesTable);
    const withBoth = withNotes.addTable(usersTable);

    test("each step is a valid ConfectSchema", () => {
      expect(ConfectSchema.isConfectSchema(base)).toBe(true);
      expect(ConfectSchema.isConfectSchema(withNotes)).toBe(true);
      expect(ConfectSchema.isConfectSchema(withBoth)).toBe(true);
    });

    test("each step has progressively more tables", () => {
      expect(Object.keys(base.tables)).toHaveLength(0);
      expect(Object.keys(withNotes.tables)).toHaveLength(1);
      expect(Object.keys(withBoth.tables)).toHaveLength(2);
    });
  });
});
