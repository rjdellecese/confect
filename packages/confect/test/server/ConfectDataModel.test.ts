import type {
  GenericDataModel,
  GenericDocument,
  GenericTableInfo,
  SystemIndexes,
} from "convex/server";
import type { GenericId } from "convex/values";
import { Schema } from "effect";
import { describe, expectTypeOf, test } from "vitest";

import type * as ConfectDataModel from "../../src/server/DataModel";
import * as DatabaseSchema from "../../src/server/DatabaseSchema";
import * as ConfectTable from "../../src/server/Table";
import type * as ConfectTableInfo from "../../src/server/TableInfo";

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

const _confectSchema = DatabaseSchema.make()
  .addTable(notesTable)
  .addTable(usersTable);

// Create type from tables directly using FromTables
type TestTables = typeof notesTable | typeof usersTable;
type TestConfectDataModel = ConfectDataModel.DataModel.FromTables<TestTables>;

describe("TypeId", () => {
  test("is the expected string literal", () => {
    type Expected = "@rjdellecese/confect/server/DataModel";
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
    type TestAny = ConfectDataModel.DataModel.Any;
    type TypeIdKey = typeof ConfectDataModel.TypeId;
    expectTypeOf<TestAny[TypeIdKey]>().toEqualTypeOf<
      typeof ConfectDataModel.TypeId
    >();
  });

  test("ConfectDataModel extends Any", () => {
    expectTypeOf<TestConfectDataModel>().toExtend<ConfectDataModel.DataModel.Any>();
  });
});

describe("ConfectDataModel.AnyWithProps", () => {
  test("extends Any", () => {
    expectTypeOf<ConfectDataModel.DataModel.AnyWithProps>().toExtend<ConfectDataModel.DataModel.Any>();
  });

  test("has tables property as Record", () => {
    type Tables = ConfectDataModel.DataModel.AnyWithProps["tables"];
    expectTypeOf<Tables>().toExtend<
      Record<string, ConfectTable.Table.AnyWithProps>
    >();
  });

  test("ConfectDataModel extends AnyWithProps", () => {
    expectTypeOf<TestConfectDataModel>().toExtend<ConfectDataModel.DataModel.AnyWithProps>();
  });
});

describe("ConfectDataModel.FromSchema", () => {
  test("creates ConfectDataModel from ConfectSchema", () => {
    type FromSchema = ConfectDataModel.DataModel.FromSchema<
      typeof _confectSchema
    >;

    expectTypeOf<FromSchema>().toExtend<ConfectDataModel.DataModel.Any>();
    expectTypeOf<keyof FromSchema["tables"]>().toEqualTypeOf<
      "notes" | "users"
    >();
  });
});

describe("ConfectDataModel.FromTables", () => {
  test("creates ConfectDataModel from Tables union", () => {
    type FromTables = ConfectDataModel.DataModel.FromTables<TestTables>;

    expectTypeOf<FromTables>().toExtend<ConfectDataModel.DataModel.Any>();
    expectTypeOf<keyof FromTables["tables"]>().toEqualTypeOf<
      "notes" | "users"
    >();
  });
});

describe("ConfectDataModel.DataModel", () => {
  test("produces type extending GenericDataModel", () => {
    type DataModel = ConfectDataModel.DataModel.ToConvex<TestConfectDataModel>;

    expectTypeOf<DataModel>().toExtend<GenericDataModel>();
  });

  test("has table keys matching original ConfectDataModel", () => {
    type DataModel = ConfectDataModel.DataModel.ToConvex<TestConfectDataModel>;

    expectTypeOf<keyof DataModel>().toEqualTypeOf<"notes" | "users">();
  });

  test("table info extends GenericTableInfo", () => {
    type DataModel = ConfectDataModel.DataModel.ToConvex<TestConfectDataModel>;

    expectTypeOf<DataModel["notes"]>().toExtend<GenericTableInfo>();
    expectTypeOf<DataModel["users"]>().toExtend<GenericTableInfo>();
  });
});

describe("ConfectDataModel.TableNames", () => {
  test("extracts table names as union of string literals", () => {
    type TableNames =
      ConfectDataModel.DataModel.TableNames<TestConfectDataModel>;

    expectTypeOf<TableNames>().toEqualTypeOf<"notes" | "users">();
  });

  test("is a string type", () => {
    type TableNames =
      ConfectDataModel.DataModel.TableNames<TestConfectDataModel>;

    expectTypeOf<TableNames>().toExtend<string>();
  });
});

describe("ConfectDataModel.TableWithName", () => {
  test("returns the correct table for notes", () => {
    type NotesTable = ConfectDataModel.DataModel.TableWithName<
      TestConfectDataModel,
      "notes"
    >;

    expectTypeOf<NotesTable["name"]>().toEqualTypeOf<"notes">();
    expectTypeOf<NotesTable>().toExtend<ConfectTable.Table.AnyWithProps>();
  });

  test("returns the correct table for users", () => {
    type UsersTable = ConfectDataModel.DataModel.TableWithName<
      TestConfectDataModel,
      "users"
    >;

    expectTypeOf<UsersTable["name"]>().toEqualTypeOf<"users">();
    expectTypeOf<UsersTable>().toExtend<ConfectTable.Table.AnyWithProps>();
  });
});

describe("ConfectDataModel.ConfectTableInfoWithName", () => {
  test("returns ConfectTableInfo for notes table", () => {
    type NotesTableInfo = ConfectDataModel.DataModel.TableInfoWithName_<
      TestConfectDataModel,
      "notes"
    >;

    expectTypeOf<NotesTableInfo>().toExtend<ConfectTableInfo.TableInfo.AnyWithProps>();
  });

  test("has document with correct fields", () => {
    type NotesTableInfo = ConfectDataModel.DataModel.TableInfoWithName_<
      TestConfectDataModel,
      "notes"
    >;

    expectTypeOf<NotesTableInfo["document"]>().toEqualTypeOf<{
      readonly _id: GenericId<"notes">;
      readonly _creationTime: number;
      readonly content: string;
      readonly priority: number;
    }>();
  });

  test("has convexDocument with correct fields (mutable)", () => {
    type NotesTableInfo = ConfectDataModel.DataModel.TableInfoWithName_<
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
    type NotesTableInfo = ConfectDataModel.DataModel.TableInfoWithName_<
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
    type NotesTableInfo = ConfectDataModel.DataModel.TableInfoWithName<
      TestConfectDataModel,
      "notes"
    >;

    expectTypeOf<NotesTableInfo>().toExtend<GenericTableInfo>();
  });

  test("has document property with convex document type", () => {
    type NotesTableInfo = ConfectDataModel.DataModel.TableInfoWithName<
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
    type NotesTableInfo = ConfectDataModel.DataModel.TableInfoWithName_<
      TestConfectDataModel,
      "notes"
    >;

    type Doc = ConfectTableInfo.TableInfo.Document<NotesTableInfo>;

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
    type NotesTableInfo = ConfectDataModel.DataModel.TableInfoWithName_<
      TestConfectDataModel,
      "notes"
    >;

    type Doc = NotesTableInfo["document"];

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
    type NotesConfectTableInfo = ConfectDataModel.DataModel.TableInfoWithName_<
      TestConfectDataModel,
      "notes"
    >;
    type TableInfo =
      ConfectTableInfo.TableInfo.TableInfo<NotesConfectTableInfo>;

    expectTypeOf<TableInfo>().toExtend<GenericTableInfo>();
  });

  test("has document property from convexDocument", () => {
    type NotesConfectTableInfo = ConfectDataModel.DataModel.TableInfoWithName_<
      TestConfectDataModel,
      "notes"
    >;
    type TableInfo =
      ConfectTableInfo.TableInfo.TableInfo<NotesConfectTableInfo>;

    expectTypeOf<TableInfo["document"]>().toEqualTypeOf<
      NotesConfectTableInfo["convexDocument"]
    >();
  });

  test("preserves fieldPaths", () => {
    type NotesConfectTableInfo = ConfectDataModel.DataModel.TableInfoWithName_<
      TestConfectDataModel,
      "notes"
    >;
    type TableInfo =
      ConfectTableInfo.TableInfo.TableInfo<NotesConfectTableInfo>;

    expectTypeOf<TableInfo["fieldPaths"]>().toEqualTypeOf<
      NotesConfectTableInfo["fieldPaths"]
    >();
  });

  test("preserves indexes", () => {
    type NotesConfectTableInfo = ConfectDataModel.DataModel.TableInfoWithName_<
      TestConfectDataModel,
      "notes"
    >;
    type TableInfo =
      ConfectTableInfo.TableInfo.TableInfo<NotesConfectTableInfo>;

    expectTypeOf<TableInfo["indexes"]>().toEqualTypeOf<
      NotesConfectTableInfo["indexes"]
    >();
  });
});

describe("ConfectTableInfo.AnyWithProps", () => {
  test("has document field", () => {
    type Doc = ConfectTableInfo.TableInfo.AnyWithProps["document"];
    expectTypeOf<Doc>().toBeAny();
  });

  test("has encodedDocument as readonly record", () => {
    type EncodedDoc =
      ConfectTableInfo.TableInfo.AnyWithProps["encodedDocument"];
    expectTypeOf<EncodedDoc>().toExtend<Record<string, unknown>>();
  });

  test("has convexDocument as GenericDocument", () => {
    type ConvexDoc = ConfectTableInfo.TableInfo.AnyWithProps["convexDocument"];
    expectTypeOf<ConvexDoc>().toExtend<GenericDocument>();
  });

  test("has fieldPaths property", () => {
    type FieldPaths = ConfectTableInfo.TableInfo.AnyWithProps["fieldPaths"];
    expectTypeOf<FieldPaths>().toExtend<string>();
  });

  test("has indexes property", () => {
    type Indexes = ConfectTableInfo.TableInfo.AnyWithProps["indexes"];
    expectTypeOf<Indexes>().toExtend<Record<string, unknown>>();
  });

  test("ConfectTableInfo extends AnyWithProps", () => {
    type NotesTableInfo = ConfectDataModel.DataModel.TableInfoWithName_<
      TestConfectDataModel,
      "notes"
    >;

    expectTypeOf<NotesTableInfo>().toExtend<ConfectTableInfo.TableInfo.AnyWithProps>();
  });
});

describe("ConfectTableInfo.TableSchema", () => {
  test("produces Schema with correct Type and Encoded", () => {
    type NotesTableInfo = ConfectDataModel.DataModel.TableInfoWithName_<
      TestConfectDataModel,
      "notes"
    >;
    type TableSchema = ConfectTableInfo.TableInfo.TableSchema<NotesTableInfo>;

    type ExpectedType = NotesTableInfo["document"];
    type ExpectedEncoded = NotesTableInfo["encodedDocument"];

    expectTypeOf<TableSchema>().toExtend<
      Schema.Schema<ExpectedType, ExpectedEncoded>
    >();
  });
});

describe("GenericConfectDoc", () => {
  test("extracts encoded document from ConfectTableInfo", () => {
    type NotesTableInfo = ConfectDataModel.DataModel.TableInfoWithName_<
      TestConfectDataModel,
      "notes"
    >;

    expectTypeOf<NotesTableInfo["encodedDocument"]>().toEqualTypeOf<{
      readonly _id: GenericId<"notes">;
      readonly _creationTime: number;
      readonly content: string;
      readonly priority: number;
    }>();
  });

  test("extracts encoded document for users table", () => {
    type UsersTableInfo = ConfectDataModel.DataModel.TableInfoWithName_<
      TestConfectDataModel,
      "users"
    >;

    expectTypeOf<UsersTableInfo["encodedDocument"]>().toEqualTypeOf<{
      readonly _id: GenericId<"users">;
      readonly _creationTime: number;
      readonly username: string;
      readonly email: string;
    }>();
  });
});

describe("Edge cases", () => {
  test("table with optional fields", () => {
    const _TableWithOptional = ConfectTable.make(
      "with_optional",
      Schema.Struct({
        required: Schema.String,
        optional: Schema.optional(Schema.Number),
      }),
    );

    type Tables = typeof _TableWithOptional;
    type DataModel = ConfectDataModel.DataModel.FromTables<Tables>;
    type TableInfo = ConfectDataModel.DataModel.TableInfoWithName_<
      DataModel,
      "with_optional"
    >;

    expectTypeOf<TableInfo["document"]>().toEqualTypeOf<{
      readonly _id: GenericId<"with_optional">;
      readonly _creationTime: number;
      readonly required: string;
      readonly optional?: number;
    }>();
  });

  test("table with nested struct fields", () => {
    const _TableWithNested = ConfectTable.make(
      "with_nested",
      Schema.Struct({
        nested: Schema.Struct({
          inner: Schema.String,
          value: Schema.Number,
        }),
      }),
    );

    type Tables = typeof _TableWithNested;
    type DataModel = ConfectDataModel.DataModel.FromTables<Tables>;
    type TableInfo = ConfectDataModel.DataModel.TableInfoWithName_<
      DataModel,
      "with_nested"
    >;

    expectTypeOf<TableInfo["document"]>().toEqualTypeOf<{
      readonly _id: GenericId<"with_nested">;
      readonly _creationTime: number;
      readonly nested: {
        readonly inner: string;
        readonly value: number;
      };
    }>();
  });

  test("table with array fields", () => {
    const _TableWithArray = ConfectTable.make(
      "with_array",
      Schema.Struct({
        items: Schema.Array(Schema.String),
      }),
    );

    type Tables = typeof _TableWithArray;
    type DataModel = ConfectDataModel.DataModel.FromTables<Tables>;
    type TableInfo = ConfectDataModel.DataModel.TableInfoWithName_<
      DataModel,
      "with_array"
    >;

    expectTypeOf<TableInfo["document"]>().toEqualTypeOf<{
      readonly _id: GenericId<"with_array">;
      readonly _creationTime: number;
      readonly items: readonly string[];
    }>();
  });

  test("table with union fields", () => {
    const _TableWithUnion = ConfectTable.make(
      "with_union",
      Schema.Struct({
        status: Schema.Union(
          Schema.Literal("pending"),
          Schema.Literal("active"),
          Schema.Literal("completed"),
        ),
      }),
    );

    type Tables = typeof _TableWithUnion;
    type DataModel = ConfectDataModel.DataModel.FromTables<Tables>;
    type TableInfo = ConfectDataModel.DataModel.TableInfoWithName_<
      DataModel,
      "with_union"
    >;

    expectTypeOf<TableInfo["document"]>().toEqualTypeOf<{
      readonly _id: GenericId<"with_union">;
      readonly _creationTime: number;
      readonly status: "pending" | "active" | "completed";
    }>();
  });

  test("single table schema", () => {
    const _SingleTable = ConfectTable.make("single", Schema.Struct({ value: Schema.String }));

    type Tables = typeof _SingleTable;
    type DataModel = ConfectDataModel.DataModel.FromTables<Tables>;

    type TableNames = ConfectDataModel.DataModel.TableNames<DataModel>;

    expectTypeOf<TableNames>().toEqualTypeOf<"single">();
  });

  test("multiple indexes on table", () => {
    const _TableWithIndexes = ConfectTable.make(
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

    type Tables = typeof _TableWithIndexes;
    type DataModel = ConfectDataModel.DataModel.FromTables<Tables>;
    type TableInfo = ConfectDataModel.DataModel.TableInfoWithName_<
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
