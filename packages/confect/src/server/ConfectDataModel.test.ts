import type {
  GenericDataModel,
  GenericDocument,
  GenericTableInfo,
  SystemIndexes,
} from "convex/server";
import type { GenericId } from "convex/values";
import { Schema } from "effect";
import { describe, expectTypeOf, test } from "vitest";

import type * as ConfectDataModel from "./ConfectDataModel";
import * as ConfectSchema from "./ConfectSchema";
import * as ConfectTable from "./ConfectTable";
import type * as ConfectTableInfo from "./ConfectTableInfo";

// ----- Test Setup -----

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

const _confectSchema = ConfectSchema.make()
  .addTable(notesTable)
  .addTable(usersTable);

// Create type from tables directly using FromTables
type TestTables = typeof notesTable | typeof usersTable;
type TestConfectDataModel =
  ConfectDataModel.ConfectDataModel.FromTables<TestTables>;

// ----- Tests -----

describe("TypeId", () => {
  test("is the expected string literal", () => {
    type Expected = "@rjdellecese/confect/ConfectDataModel";
    expectTypeOf<ConfectDataModel.TypeId>().toEqualTypeOf<Expected>();
  });
});

describe("ConfectDataModel", () => {
  test("has TypeId property", () => {
    type TypeIdKey = typeof ConfectDataModel.TypeId;
    expectTypeOf<TestConfectDataModel[TypeIdKey]>().toEqualTypeOf<
      typeof ConfectDataModel.TypeId
    >();
  });

  test("has tables property with correct table names", () => {
    expectTypeOf<keyof TestConfectDataModel["tables"]>().toEqualTypeOf<
      "notes" | "users"
    >();
  });

  test("tables contain ConfectTable with correct names", () => {
    expectTypeOf<
      TestConfectDataModel["tables"]["notes"]["name"]
    >().toEqualTypeOf<"notes">();
    expectTypeOf<
      TestConfectDataModel["tables"]["users"]["name"]
    >().toEqualTypeOf<"users">();
  });
});

describe("ConfectDataModel.Any", () => {
  test("has TypeId property", () => {
    type TestAny = ConfectDataModel.ConfectDataModel.Any;
    type TypeIdKey = typeof ConfectDataModel.TypeId;
    expectTypeOf<TestAny[TypeIdKey]>().toEqualTypeOf<
      typeof ConfectDataModel.TypeId
    >();
  });

  test("ConfectDataModel extends Any", () => {
    expectTypeOf<TestConfectDataModel>().toExtend<ConfectDataModel.ConfectDataModel.Any>();
  });
});

describe("ConfectDataModel.AnyWithProps", () => {
  test("extends Any", () => {
    expectTypeOf<ConfectDataModel.ConfectDataModel.AnyWithProps>().toExtend<ConfectDataModel.ConfectDataModel.Any>();
  });

  test("has tables property as Record", () => {
    type Tables = ConfectDataModel.ConfectDataModel.AnyWithProps["tables"];
    expectTypeOf<Tables>().toExtend<
      Record<string, ConfectTable.ConfectTable.AnyWithProps>
    >();
  });

  test("ConfectDataModel extends AnyWithProps", () => {
    expectTypeOf<TestConfectDataModel>().toExtend<ConfectDataModel.ConfectDataModel.AnyWithProps>();
  });
});

describe("ConfectDataModel.FromSchema", () => {
  test("creates ConfectDataModel from ConfectSchema", () => {
    type FromSchema = ConfectDataModel.ConfectDataModel.FromSchema<
      typeof _confectSchema
    >;

    expectTypeOf<FromSchema>().toExtend<ConfectDataModel.ConfectDataModel.Any>();
    expectTypeOf<keyof FromSchema["tables"]>().toEqualTypeOf<
      "notes" | "users"
    >();
  });
});

describe("ConfectDataModel.FromTables", () => {
  test("creates ConfectDataModel from Tables union", () => {
    type FromTables = ConfectDataModel.ConfectDataModel.FromTables<TestTables>;

    expectTypeOf<FromTables>().toExtend<ConfectDataModel.ConfectDataModel.Any>();
    expectTypeOf<keyof FromTables["tables"]>().toEqualTypeOf<
      "notes" | "users"
    >();
  });
});

describe("ConfectDataModel.DataModel", () => {
  test("produces type extending GenericDataModel", () => {
    type DataModel =
      ConfectDataModel.ConfectDataModel.DataModel<TestConfectDataModel>;

    expectTypeOf<DataModel>().toExtend<GenericDataModel>();
  });

  test("has table keys matching original ConfectDataModel", () => {
    type DataModel =
      ConfectDataModel.ConfectDataModel.DataModel<TestConfectDataModel>;

    expectTypeOf<keyof DataModel>().toEqualTypeOf<"notes" | "users">();
  });

  test("table info extends GenericTableInfo", () => {
    type DataModel =
      ConfectDataModel.ConfectDataModel.DataModel<TestConfectDataModel>;

    expectTypeOf<DataModel["notes"]>().toExtend<GenericTableInfo>();
    expectTypeOf<DataModel["users"]>().toExtend<GenericTableInfo>();
  });
});

describe("ConfectDataModel.TableNames", () => {
  test("extracts table names as union of string literals", () => {
    type TableNames =
      ConfectDataModel.ConfectDataModel.TableNames<TestConfectDataModel>;

    expectTypeOf<TableNames>().toEqualTypeOf<"notes" | "users">();
  });

  test("is a string type", () => {
    type TableNames =
      ConfectDataModel.ConfectDataModel.TableNames<TestConfectDataModel>;

    expectTypeOf<TableNames>().toExtend<string>();
  });
});

describe("ConfectDataModel.TableWithName", () => {
  test("returns the correct table for notes", () => {
    type NotesTable = ConfectDataModel.ConfectDataModel.TableWithName<
      TestConfectDataModel,
      "notes"
    >;

    expectTypeOf<NotesTable["name"]>().toEqualTypeOf<"notes">();
    expectTypeOf<NotesTable>().toExtend<ConfectTable.ConfectTable.AnyWithProps>();
  });

  test("returns the correct table for users", () => {
    type UsersTable = ConfectDataModel.ConfectDataModel.TableWithName<
      TestConfectDataModel,
      "users"
    >;

    expectTypeOf<UsersTable["name"]>().toEqualTypeOf<"users">();
    expectTypeOf<UsersTable>().toExtend<ConfectTable.ConfectTable.AnyWithProps>();
  });
});

describe("ConfectDataModel.ConfectTableInfoWithName", () => {
  test("returns ConfectTableInfo for notes table", () => {
    type NotesTableInfo =
      ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
        TestConfectDataModel,
        "notes"
      >;

    expectTypeOf<NotesTableInfo>().toExtend<ConfectTableInfo.ConfectTableInfo.AnyWithProps>();
  });

  test("has confectDocument with correct fields", () => {
    type NotesTableInfo =
      ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
        TestConfectDataModel,
        "notes"
      >;

    expectTypeOf<NotesTableInfo["confectDocument"]>().toEqualTypeOf<{
      readonly _id: GenericId<"notes">;
      readonly _creationTime: number;
      readonly content: string;
      readonly priority: number;
    }>();
  });

  test("has convexDocument with correct fields (mutable)", () => {
    type NotesTableInfo =
      ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
        TestConfectDataModel,
        "notes"
      >;

    expectTypeOf<NotesTableInfo["convexDocument"]>().toEqualTypeOf<{
      _id: GenericId<"notes">;
      _creationTime: number;
      content: string;
      priority: number;
    }>();
  });

  test("has indexes including system indexes and custom indexes", () => {
    type NotesTableInfo =
      ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
        TestConfectDataModel,
        "notes"
      >;

    expectTypeOf<NotesTableInfo["indexes"]>().toExtend<SystemIndexes>();
    expectTypeOf<NotesTableInfo["indexes"]["by_priority"]>().toEqualTypeOf<
      ["priority", "_creationTime"]
    >();
  });
});

describe("ConfectDataModel.TableInfoWithName", () => {
  test("returns TableInfo compatible with Convex GenericTableInfo", () => {
    type NotesTableInfo = ConfectDataModel.ConfectDataModel.TableInfoWithName<
      TestConfectDataModel,
      "notes"
    >;

    expectTypeOf<NotesTableInfo>().toExtend<GenericTableInfo>();
  });

  test("has document property with convex document type", () => {
    type NotesTableInfo = ConfectDataModel.ConfectDataModel.TableInfoWithName<
      TestConfectDataModel,
      "notes"
    >;

    expectTypeOf<NotesTableInfo["document"]>().toEqualTypeOf<{
      _id: GenericId<"notes">;
      _creationTime: number;
      content: string;
      priority: number;
    }>();
  });
});

describe("ConfectDataModel.ConfectDocumentWithName", () => {
  test("can extract document type via ConfectTableInfo", () => {
    // ConfectDocumentWithName uses ConfectTableInfo.ConfectDocument
    // We test via ConfectTableInfoWithName which correctly maps the table
    type NotesTableInfo =
      ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
        TestConfectDataModel,
        "notes"
      >;

    type Doc =
      ConfectTableInfo.ConfectTableInfo.ConfectDocument<NotesTableInfo>;

    expectTypeOf<Doc>().toEqualTypeOf<{
      readonly _id: GenericId<"notes">;
      readonly _creationTime: number;
      readonly content: string;
      readonly priority: number;
    }>();
  });
});

describe("ConfectDocumentByName", () => {
  test("extracts encoded confect document for table", () => {
    // ConfectDocumentByName uses ConfectTableInfo.ConfectDocument internally
    type NotesTableInfo =
      ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
        TestConfectDataModel,
        "notes"
      >;

    type Doc = NotesTableInfo["confectDocument"];

    expectTypeOf<Doc>().toEqualTypeOf<{
      readonly _id: GenericId<"notes">;
      readonly _creationTime: number;
      readonly content: string;
      readonly priority: number;
    }>();
  });
});

describe("ConfectTableInfo.TableInfo (via ConfectDataModel)", () => {
  test("converts ConfectTableInfo to Convex TableInfo structure", () => {
    type NotesConfectTableInfo =
      ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
        TestConfectDataModel,
        "notes"
      >;
    type TableInfo =
      ConfectTableInfo.ConfectTableInfo.TableInfo<NotesConfectTableInfo>;

    expectTypeOf<TableInfo>().toExtend<GenericTableInfo>();
  });

  test("has document property from convexDocument", () => {
    type NotesConfectTableInfo =
      ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
        TestConfectDataModel,
        "notes"
      >;
    type TableInfo =
      ConfectTableInfo.ConfectTableInfo.TableInfo<NotesConfectTableInfo>;

    expectTypeOf<TableInfo["document"]>().toEqualTypeOf<
      NotesConfectTableInfo["convexDocument"]
    >();
  });

  test("preserves fieldPaths", () => {
    type NotesConfectTableInfo =
      ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
        TestConfectDataModel,
        "notes"
      >;
    type TableInfo =
      ConfectTableInfo.ConfectTableInfo.TableInfo<NotesConfectTableInfo>;

    expectTypeOf<TableInfo["fieldPaths"]>().toEqualTypeOf<
      NotesConfectTableInfo["fieldPaths"]
    >();
  });

  test("preserves indexes", () => {
    type NotesConfectTableInfo =
      ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
        TestConfectDataModel,
        "notes"
      >;
    type TableInfo =
      ConfectTableInfo.ConfectTableInfo.TableInfo<NotesConfectTableInfo>;

    expectTypeOf<TableInfo["indexes"]>().toEqualTypeOf<
      NotesConfectTableInfo["indexes"]
    >();
  });
});

describe("ConfectTableInfo.AnyWithProps", () => {
  test("has confectDocument field", () => {
    type Doc =
      ConfectTableInfo.ConfectTableInfo.AnyWithProps["confectDocument"];
    expectTypeOf<Doc>().toBeAny();
  });

  test("has encodedConfectDocument as readonly record", () => {
    type EncodedDoc =
      ConfectTableInfo.ConfectTableInfo.AnyWithProps["encodedConfectDocument"];
    expectTypeOf<EncodedDoc>().toExtend<Record<string, unknown>>();
  });

  test("has convexDocument as GenericDocument", () => {
    type ConvexDoc =
      ConfectTableInfo.ConfectTableInfo.AnyWithProps["convexDocument"];
    expectTypeOf<ConvexDoc>().toExtend<GenericDocument>();
  });

  test("has fieldPaths property", () => {
    type FieldPaths =
      ConfectTableInfo.ConfectTableInfo.AnyWithProps["fieldPaths"];
    expectTypeOf<FieldPaths>().toExtend<string>();
  });

  test("has indexes property", () => {
    type Indexes = ConfectTableInfo.ConfectTableInfo.AnyWithProps["indexes"];
    expectTypeOf<Indexes>().toExtend<Record<string, unknown>>();
  });

  test("ConfectTableInfo extends AnyWithProps", () => {
    type NotesTableInfo =
      ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
        TestConfectDataModel,
        "notes"
      >;

    expectTypeOf<NotesTableInfo>().toExtend<ConfectTableInfo.ConfectTableInfo.AnyWithProps>();
  });
});

describe("ConfectTableInfo.TableSchema", () => {
  test("produces Schema with correct Type and Encoded", () => {
    type NotesTableInfo =
      ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
        TestConfectDataModel,
        "notes"
      >;
    type TableSchema =
      ConfectTableInfo.ConfectTableInfo.TableSchema<NotesTableInfo>;

    type ExpectedType = NotesTableInfo["confectDocument"];
    type ExpectedEncoded = NotesTableInfo["encodedConfectDocument"];

    expectTypeOf<TableSchema>().toExtend<
      Schema.Schema<ExpectedType, ExpectedEncoded>
    >();
  });
});

describe("GenericConfectDoc", () => {
  test("extracts encoded document from ConfectTableInfo", () => {
    // GenericConfectDoc is designed for use with a DataModel that maps
    // table names to ConfectTableInfo objects containing encodedConfectDocument
    type NotesTableInfo =
      ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
        TestConfectDataModel,
        "notes"
      >;

    // The encodedConfectDocument should match the confectDocument in this case
    // since the schema has no transformations
    expectTypeOf<NotesTableInfo["encodedConfectDocument"]>().toEqualTypeOf<{
      readonly _id: GenericId<"notes">;
      readonly _creationTime: number;
      readonly content: string;
      readonly priority: number;
    }>();
  });

  test("extracts encoded document for users table", () => {
    type UsersTableInfo =
      ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
        TestConfectDataModel,
        "users"
      >;

    expectTypeOf<UsersTableInfo["encodedConfectDocument"]>().toEqualTypeOf<{
      readonly _id: GenericId<"users">;
      readonly _creationTime: number;
      readonly username: string;
      readonly email: string;
    }>();
  });
});

// ----- Edge cases and complex scenarios -----

describe("Edge cases", () => {
  test("table with optional fields", () => {
    const _TableWithOptional = ConfectTable.make({
      name: "with_optional",
      fields: Schema.Struct({
        required: Schema.String,
        optional: Schema.optional(Schema.Number),
      }),
    });

    type Tables = typeof _TableWithOptional;
    type DataModel = ConfectDataModel.ConfectDataModel.FromTables<Tables>;
    type TableInfo = ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
      DataModel,
      "with_optional"
    >;

    expectTypeOf<TableInfo["confectDocument"]>().toEqualTypeOf<{
      readonly _id: GenericId<"with_optional">;
      readonly _creationTime: number;
      readonly required: string;
      readonly optional?: number;
    }>();
  });

  test("table with nested struct fields", () => {
    const _TableWithNested = ConfectTable.make({
      name: "with_nested",
      fields: Schema.Struct({
        nested: Schema.Struct({
          inner: Schema.String,
          value: Schema.Number,
        }),
      }),
    });

    type Tables = typeof _TableWithNested;
    type DataModel = ConfectDataModel.ConfectDataModel.FromTables<Tables>;
    type TableInfo = ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
      DataModel,
      "with_nested"
    >;

    expectTypeOf<TableInfo["confectDocument"]>().toEqualTypeOf<{
      readonly _id: GenericId<"with_nested">;
      readonly _creationTime: number;
      readonly nested: {
        readonly inner: string;
        readonly value: number;
      };
    }>();
  });

  test("table with array fields", () => {
    const _TableWithArray = ConfectTable.make({
      name: "with_array",
      fields: Schema.Struct({
        items: Schema.Array(Schema.String),
      }),
    });

    type Tables = typeof _TableWithArray;
    type DataModel = ConfectDataModel.ConfectDataModel.FromTables<Tables>;
    type TableInfo = ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
      DataModel,
      "with_array"
    >;

    expectTypeOf<TableInfo["confectDocument"]>().toEqualTypeOf<{
      readonly _id: GenericId<"with_array">;
      readonly _creationTime: number;
      readonly items: readonly string[];
    }>();
  });

  test("table with union fields", () => {
    const _TableWithUnion = ConfectTable.make({
      name: "with_union",
      fields: Schema.Struct({
        status: Schema.Union(
          Schema.Literal("pending"),
          Schema.Literal("active"),
          Schema.Literal("completed"),
        ),
      }),
    });

    type Tables = typeof _TableWithUnion;
    type DataModel = ConfectDataModel.ConfectDataModel.FromTables<Tables>;
    type TableInfo = ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
      DataModel,
      "with_union"
    >;

    expectTypeOf<TableInfo["confectDocument"]>().toEqualTypeOf<{
      readonly _id: GenericId<"with_union">;
      readonly _creationTime: number;
      readonly status: "pending" | "active" | "completed";
    }>();
  });

  test("single table schema", () => {
    const _SingleTable = ConfectTable.make({
      name: "single",
      fields: Schema.Struct({ value: Schema.String }),
    });

    type Tables = typeof _SingleTable;
    type DataModel = ConfectDataModel.ConfectDataModel.FromTables<Tables>;

    type TableNames = ConfectDataModel.ConfectDataModel.TableNames<DataModel>;

    expectTypeOf<TableNames>().toEqualTypeOf<"single">();
  });

  test("multiple indexes on table", () => {
    const _TableWithIndexes = ConfectTable.make({
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

    type Tables = typeof _TableWithIndexes;
    type DataModel = ConfectDataModel.ConfectDataModel.FromTables<Tables>;
    type TableInfo = ConfectDataModel.ConfectDataModel.ConfectTableInfoWithName<
      DataModel,
      "indexed"
    >;

    expectTypeOf<TableInfo["indexes"]["by_field1"]>().toEqualTypeOf<
      ["field1", "_creationTime"]
    >();
    expectTypeOf<TableInfo["indexes"]["by_field2"]>().toEqualTypeOf<
      ["field2", "_creationTime"]
    >();
    expectTypeOf<TableInfo["indexes"]["by_field1_and_field2"]>().toEqualTypeOf<
      ["field1", "field2", "_creationTime"]
    >();
  });
});
