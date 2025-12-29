import type { GenericTableInfo, SystemIndexes } from "convex/server";
import type { GenericId } from "convex/values";
import { Schema } from "effect";
import { describe, expectTypeOf, test } from "vitest";

import * as ConfectTable from "../server/ConfectTable";
import type * as ConfectTableInfo from "../server/ConfectTableInfo";

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

const _notesTable = ConfectTable.make({
  name: "notes",
  fields: NoteSchema,
}).index("by_priority", ["priority"]);

const _usersTable = ConfectTable.make({
  name: "users",
  fields: UserSchema,
})
  .index("by_username", ["username"])
  .searchIndex("search_email", { searchField: "email", filterFields: [] });

type NotesTable = typeof _notesTable;
type UsersTable = typeof _usersTable;

type NotesTableInfo = ConfectTableInfo.ConfectTableInfo<NotesTable>;
type UsersTableInfo = ConfectTableInfo.ConfectTableInfo<UsersTable>;

// ----- Tests -----

describe("TypeId", () => {
  test("is the expected string literal", () => {
    type Expected = "@rjdellecese/confect/server/ConfectTableInfo";
    expectTypeOf<ConfectTableInfo.TypeId>().toEqualTypeOf<Expected>();
  });
});

describe("ConfectTableInfo", () => {
  describe("TypeId property", () => {
    test("has TypeId property with correct value", () => {
      type TypeIdKey = typeof ConfectTableInfo.TypeId;
      expectTypeOf<NotesTableInfo[TypeIdKey]>().toEqualTypeOf<
        typeof ConfectTableInfo.TypeId
      >();
    });
  });

  describe("confectDocument", () => {
    test("contains readonly _id field with correct GenericId", () => {
      type Doc = NotesTableInfo["confectDocument"];
      expectTypeOf<Doc["_id"]>().toEqualTypeOf<GenericId<"notes">>();
    });

    test("contains readonly _creationTime field", () => {
      type Doc = NotesTableInfo["confectDocument"];
      expectTypeOf<Doc["_creationTime"]>().toEqualTypeOf<number>();
    });

    test("contains table fields with correct types", () => {
      type Doc = NotesTableInfo["confectDocument"];
      expectTypeOf<Doc["content"]>().toEqualTypeOf<string>();
      expectTypeOf<Doc["priority"]>().toEqualTypeOf<number>();
    });

    test("is readonly for system fields", () => {
      expectTypeOf<NotesTableInfo["confectDocument"]>().toEqualTypeOf<{
        readonly _id: GenericId<"notes">;
        readonly _creationTime: number;
        readonly content: string;
        readonly priority: number;
      }>();
    });

    test("correctly types users table document", () => {
      expectTypeOf<UsersTableInfo["confectDocument"]>().toEqualTypeOf<{
        readonly _id: GenericId<"users">;
        readonly _creationTime: number;
        readonly username: string;
        readonly email: string;
        readonly active: boolean;
      }>();
    });
  });

  describe("encodedConfectDocument", () => {
    test("contains readonly _id field with correct GenericId", () => {
      type EncodedDoc = NotesTableInfo["encodedConfectDocument"];
      expectTypeOf<EncodedDoc["_id"]>().toEqualTypeOf<GenericId<"notes">>();
    });

    test("contains readonly _creationTime field", () => {
      type EncodedDoc = NotesTableInfo["encodedConfectDocument"];
      expectTypeOf<EncodedDoc["_creationTime"]>().toEqualTypeOf<number>();
    });

    test("contains encoded table fields with correct types", () => {
      type EncodedDoc = NotesTableInfo["encodedConfectDocument"];
      expectTypeOf<EncodedDoc["content"]>().toEqualTypeOf<string>();
      expectTypeOf<EncodedDoc["priority"]>().toEqualTypeOf<number>();
    });

    test("is readonly", () => {
      expectTypeOf<NotesTableInfo["encodedConfectDocument"]>().toEqualTypeOf<{
        readonly _id: GenericId<"notes">;
        readonly _creationTime: number;
        readonly content: string;
        readonly priority: number;
      }>();
    });
  });

  describe("convexDocument", () => {
    test("contains mutable _id field with correct GenericId", () => {
      type ConvexDoc = NotesTableInfo["convexDocument"];
      expectTypeOf<ConvexDoc["_id"]>().toEqualTypeOf<GenericId<"notes">>();
    });

    test("contains mutable _creationTime field", () => {
      type ConvexDoc = NotesTableInfo["convexDocument"];
      expectTypeOf<ConvexDoc["_creationTime"]>().toEqualTypeOf<number>();
    });

    test("contains mutable table fields with correct types", () => {
      type ConvexDoc = NotesTableInfo["convexDocument"];
      expectTypeOf<ConvexDoc["content"]>().toEqualTypeOf<string>();
      expectTypeOf<ConvexDoc["priority"]>().toEqualTypeOf<number>();
    });

    test("is mutable (not readonly)", () => {
      expectTypeOf<NotesTableInfo["convexDocument"]>().toEqualTypeOf<{
        _id: GenericId<"notes">;
        _creationTime: number;
        content: string;
        priority: number;
      }>();
    });

    test("correctly types users table convex document", () => {
      expectTypeOf<UsersTableInfo["convexDocument"]>().toEqualTypeOf<{
        _id: GenericId<"users">;
        _creationTime: number;
        username: string;
        email: string;
        active: boolean;
      }>();
    });
  });

  describe("fieldPaths", () => {
    test("includes _id field path", () => {
      type FieldPaths = NotesTableInfo["fieldPaths"];
      expectTypeOf<"_id">().toExtend<FieldPaths>();
    });

    test("includes _creationTime field path", () => {
      type FieldPaths = NotesTableInfo["fieldPaths"];
      expectTypeOf<"_creationTime">().toExtend<FieldPaths>();
    });

    test("includes table field paths", () => {
      type FieldPaths = NotesTableInfo["fieldPaths"];
      expectTypeOf<"content">().toExtend<FieldPaths>();
      expectTypeOf<"priority">().toExtend<FieldPaths>();
    });

    test("notes table has correct field paths", () => {
      expectTypeOf<NotesTableInfo["fieldPaths"]>().toEqualTypeOf<
        "_id" | "_creationTime" | "content" | "priority"
      >();
    });

    test("users table has correct field paths", () => {
      expectTypeOf<UsersTableInfo["fieldPaths"]>().toEqualTypeOf<
        "_id" | "_creationTime" | "username" | "email" | "active"
      >();
    });
  });

  describe("indexes", () => {
    test("includes system indexes", () => {
      expectTypeOf<NotesTableInfo["indexes"]>().toExtend<SystemIndexes>();
    });

    test("includes custom indexes", () => {
      expectTypeOf<NotesTableInfo["indexes"]["by_priority"]>().toEqualTypeOf<
        ["priority", "_creationTime"]
      >();
    });

    test("users table indexes include by_username", () => {
      expectTypeOf<UsersTableInfo["indexes"]["by_username"]>().toEqualTypeOf<
        ["username", "_creationTime"]
      >();
    });
  });

  describe("searchIndexes", () => {
    test("notes table has empty search indexes", () => {
      expectTypeOf<NotesTableInfo["searchIndexes"]>().toEqualTypeOf<{}>();
    });

    test("users table has search_email index", () => {
      expectTypeOf<UsersTableInfo["searchIndexes"]>().toEqualTypeOf<{
        search_email: {
          searchField: "email";
          filterFields: never;
        };
      }>();
    });
  });

  describe("vectorIndexes", () => {
    test("notes table has empty vector indexes", () => {
      expectTypeOf<NotesTableInfo["vectorIndexes"]>().toEqualTypeOf<{}>();
    });

    test("users table has empty vector indexes", () => {
      expectTypeOf<UsersTableInfo["vectorIndexes"]>().toEqualTypeOf<{}>();
    });
  });
});

describe("ConfectTableInfo.Any", () => {
  test("has TypeId property", () => {
    type TypeIdKey = typeof ConfectTableInfo.TypeId;
    type Any = ConfectTableInfo.ConfectTableInfo.Any;
    expectTypeOf<Any[TypeIdKey]>().toEqualTypeOf<
      typeof ConfectTableInfo.TypeId
    >();
  });

  test("ConfectTableInfo extends Any", () => {
    expectTypeOf<NotesTableInfo>().toExtend<ConfectTableInfo.ConfectTableInfo.Any>();
  });

  test("UsersTableInfo extends Any", () => {
    expectTypeOf<UsersTableInfo>().toExtend<ConfectTableInfo.ConfectTableInfo.Any>();
  });
});

describe("ConfectTableInfo.AnyWithProps", () => {
  test("extends Any", () => {
    expectTypeOf<ConfectTableInfo.ConfectTableInfo.AnyWithProps>().toExtend<ConfectTableInfo.ConfectTableInfo.Any>();
  });

  test("ConfectTableInfo extends AnyWithProps", () => {
    expectTypeOf<NotesTableInfo>().toExtend<ConfectTableInfo.ConfectTableInfo.AnyWithProps>();
  });

  test("has confectDocument property", () => {
    type AnyWithProps = ConfectTableInfo.ConfectTableInfo.AnyWithProps;
    expectTypeOf<AnyWithProps["confectDocument"]>().not.toBeNever();
  });

  test("has convexDocument property", () => {
    type AnyWithProps = ConfectTableInfo.ConfectTableInfo.AnyWithProps;
    expectTypeOf<AnyWithProps["convexDocument"]>().not.toBeNever();
  });

  test("has fieldPaths property", () => {
    type AnyWithProps = ConfectTableInfo.ConfectTableInfo.AnyWithProps;
    expectTypeOf<AnyWithProps["fieldPaths"]>().not.toBeNever();
  });

  test("has indexes property", () => {
    type AnyWithProps = ConfectTableInfo.ConfectTableInfo.AnyWithProps;
    expectTypeOf<AnyWithProps["indexes"]>().not.toBeNever();
  });

  test("has TypeId property (inherited from Any)", () => {
    type AnyWithProps = ConfectTableInfo.ConfectTableInfo.AnyWithProps;
    type TypeIdKey = typeof ConfectTableInfo.TypeId;
    expectTypeOf<AnyWithProps[TypeIdKey]>().toEqualTypeOf<
      typeof ConfectTableInfo.TypeId
    >();
  });
});

describe("ConfectTableInfo.TableInfo", () => {
  test("extracts document from convexDocument", () => {
    type TableInfo =
      ConfectTableInfo.ConfectTableInfo.TableInfo<NotesTableInfo>;
    expectTypeOf<TableInfo["document"]>().toEqualTypeOf<
      NotesTableInfo["convexDocument"]
    >();
  });

  test("extracts fieldPaths", () => {
    type TableInfo =
      ConfectTableInfo.ConfectTableInfo.TableInfo<NotesTableInfo>;
    expectTypeOf<TableInfo["fieldPaths"]>().toEqualTypeOf<
      NotesTableInfo["fieldPaths"]
    >();
  });

  test("extracts indexes", () => {
    type TableInfo =
      ConfectTableInfo.ConfectTableInfo.TableInfo<NotesTableInfo>;
    expectTypeOf<TableInfo["indexes"]>().toEqualTypeOf<
      NotesTableInfo["indexes"]
    >();
  });

  test("extracts searchIndexes", () => {
    type TableInfo =
      ConfectTableInfo.ConfectTableInfo.TableInfo<NotesTableInfo>;
    expectTypeOf<TableInfo["searchIndexes"]>().toEqualTypeOf<
      NotesTableInfo["searchIndexes"]
    >();
  });

  test("extracts vectorIndexes", () => {
    type TableInfo =
      ConfectTableInfo.ConfectTableInfo.TableInfo<NotesTableInfo>;
    expectTypeOf<TableInfo["vectorIndexes"]>().toEqualTypeOf<
      NotesTableInfo["vectorIndexes"]
    >();
  });

  test("result is compatible with GenericTableInfo", () => {
    type TableInfo =
      ConfectTableInfo.ConfectTableInfo.TableInfo<NotesTableInfo>;
    expectTypeOf<TableInfo>().toExtend<GenericTableInfo>();
  });

  test("works for users table", () => {
    type TableInfo =
      ConfectTableInfo.ConfectTableInfo.TableInfo<UsersTableInfo>;
    expectTypeOf<TableInfo>().toExtend<GenericTableInfo>();
    expectTypeOf<TableInfo["document"]>().toEqualTypeOf<
      UsersTableInfo["convexDocument"]
    >();
  });
});

describe("ConfectTableInfo.TableSchema", () => {
  test("produces Schema with confectDocument as Type", () => {
    type TableSchema =
      ConfectTableInfo.ConfectTableInfo.TableSchema<NotesTableInfo>;
    type SchemaType =
      TableSchema extends Schema.Schema<infer T, any> ? T : never;
    expectTypeOf<SchemaType>().toEqualTypeOf<
      NotesTableInfo["confectDocument"]
    >();
  });

  test("produces Schema with encodedConfectDocument as Encoded", () => {
    type TableSchema =
      ConfectTableInfo.ConfectTableInfo.TableSchema<NotesTableInfo>;
    type SchemaEncoded =
      TableSchema extends Schema.Schema<any, infer E> ? E : never;
    expectTypeOf<SchemaEncoded>().toEqualTypeOf<
      NotesTableInfo["encodedConfectDocument"]
    >();
  });

  test("extends Schema.Schema", () => {
    type TableSchema =
      ConfectTableInfo.ConfectTableInfo.TableSchema<NotesTableInfo>;
    expectTypeOf<TableSchema>().toExtend<
      Schema.Schema<
        NotesTableInfo["confectDocument"],
        NotesTableInfo["encodedConfectDocument"]
      >
    >();
  });

  test("works for users table", () => {
    type TableSchema =
      ConfectTableInfo.ConfectTableInfo.TableSchema<UsersTableInfo>;
    expectTypeOf<TableSchema>().toExtend<
      Schema.Schema<
        UsersTableInfo["confectDocument"],
        UsersTableInfo["encodedConfectDocument"]
      >
    >();
  });
});

describe("ConfectTableInfo.ConfectDocument", () => {
  test("extracts confectDocument type", () => {
    type Doc =
      ConfectTableInfo.ConfectTableInfo.ConfectDocument<NotesTableInfo>;
    expectTypeOf<Doc>().toEqualTypeOf<NotesTableInfo["confectDocument"]>();
  });

  test("contains correct fields for notes table", () => {
    type Doc =
      ConfectTableInfo.ConfectTableInfo.ConfectDocument<NotesTableInfo>;
    expectTypeOf<Doc>().toEqualTypeOf<{
      readonly _id: GenericId<"notes">;
      readonly _creationTime: number;
      readonly content: string;
      readonly priority: number;
    }>();
  });

  test("contains correct fields for users table", () => {
    type Doc =
      ConfectTableInfo.ConfectTableInfo.ConfectDocument<UsersTableInfo>;
    expectTypeOf<Doc>().toEqualTypeOf<{
      readonly _id: GenericId<"users">;
      readonly _creationTime: number;
      readonly username: string;
      readonly email: string;
      readonly active: boolean;
    }>();
  });
});

// ----- Edge cases and complex scenarios -----

describe("Edge cases", () => {
  describe("table with optional fields", () => {
    const _tableWithOptional = ConfectTable.make({
      name: "with_optional",
      fields: Schema.Struct({
        required: Schema.String,
        optional: Schema.optional(Schema.Number),
      }),
    });

    type TableWithOptionalInfo = ConfectTableInfo.ConfectTableInfo<
      typeof _tableWithOptional
    >;

    test("confectDocument has optional field", () => {
      expectTypeOf<TableWithOptionalInfo["confectDocument"]>().toEqualTypeOf<{
        readonly _id: GenericId<"with_optional">;
        readonly _creationTime: number;
        readonly required: string;
        readonly optional?: number;
      }>();
    });

    test("encodedConfectDocument has optional field", () => {
      expectTypeOf<
        TableWithOptionalInfo["encodedConfectDocument"]
      >().toEqualTypeOf<{
        readonly _id: GenericId<"with_optional">;
        readonly _creationTime: number;
        readonly required: string;
        readonly optional?: number;
      }>();
    });
  });

  describe("table with nested struct", () => {
    const _tableWithNested = ConfectTable.make({
      name: "with_nested",
      fields: Schema.Struct({
        nested: Schema.Struct({
          inner: Schema.String,
          value: Schema.Number,
        }),
      }),
    });

    type TableWithNestedInfo = ConfectTableInfo.ConfectTableInfo<
      typeof _tableWithNested
    >;

    test("confectDocument has nested readonly struct", () => {
      expectTypeOf<TableWithNestedInfo["confectDocument"]>().toEqualTypeOf<{
        readonly _id: GenericId<"with_nested">;
        readonly _creationTime: number;
        readonly nested: {
          readonly inner: string;
          readonly value: number;
        };
      }>();
    });
  });

  describe("table with array fields", () => {
    const _tableWithArray = ConfectTable.make({
      name: "with_array",
      fields: Schema.Struct({
        items: Schema.Array(Schema.String),
        numbers: Schema.Array(Schema.Number),
      }),
    });

    type TableWithArrayInfo = ConfectTableInfo.ConfectTableInfo<
      typeof _tableWithArray
    >;

    test("confectDocument has readonly arrays", () => {
      expectTypeOf<TableWithArrayInfo["confectDocument"]>().toEqualTypeOf<{
        readonly _id: GenericId<"with_array">;
        readonly _creationTime: number;
        readonly items: readonly string[];
        readonly numbers: readonly number[];
      }>();
    });
  });

  describe("table with union fields", () => {
    const _tableWithUnion = ConfectTable.make({
      name: "with_union",
      fields: Schema.Struct({
        status: Schema.Union(
          Schema.Literal("pending"),
          Schema.Literal("active"),
          Schema.Literal("completed"),
        ),
      }),
    });

    type TableWithUnionInfo = ConfectTableInfo.ConfectTableInfo<
      typeof _tableWithUnion
    >;

    test("confectDocument has union type", () => {
      expectTypeOf<TableWithUnionInfo["confectDocument"]>().toEqualTypeOf<{
        readonly _id: GenericId<"with_union">;
        readonly _creationTime: number;
        readonly status: "pending" | "active" | "completed";
      }>();
    });

    test("fieldPaths includes status", () => {
      expectTypeOf<"status">().toExtend<TableWithUnionInfo["fieldPaths"]>();
    });
  });

  describe("table with multiple indexes", () => {
    const _tableWithMultipleIndexes = ConfectTable.make({
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

    type TableWithMultipleIndexesInfo = ConfectTableInfo.ConfectTableInfo<
      typeof _tableWithMultipleIndexes
    >;

    test("has all custom indexes", () => {
      type Indexes = TableWithMultipleIndexesInfo["indexes"];
      expectTypeOf<Indexes["by_field1"]>().toEqualTypeOf<
        ["field1", "_creationTime"]
      >();
      expectTypeOf<Indexes["by_field2"]>().toEqualTypeOf<
        ["field2", "_creationTime"]
      >();
      expectTypeOf<Indexes["by_field1_and_field2"]>().toEqualTypeOf<
        ["field1", "field2", "_creationTime"]
      >();
    });

    test("still includes system indexes", () => {
      type Indexes = TableWithMultipleIndexesInfo["indexes"];
      expectTypeOf<Indexes>().toExtend<SystemIndexes>();
    });
  });

  describe("table with vector index", () => {
    const _tableWithVectorIndex = ConfectTable.make({
      name: "with_vector",
      fields: Schema.Struct({
        embedding: Schema.Array(Schema.Number),
        category: Schema.String,
      }),
    }).vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["category"],
    });

    type TableWithVectorIndexInfo = ConfectTableInfo.ConfectTableInfo<
      typeof _tableWithVectorIndex
    >;

    test("has vector index with correct configuration", () => {
      expectTypeOf<
        TableWithVectorIndexInfo["vectorIndexes"]["by_embedding"]
      >().toEqualTypeOf<{
        vectorField: "embedding";
        dimensions: number;
        filterFields: "category";
      }>();
    });
  });

  describe("transforming schema (where Type differs from Encoded)", () => {
    // Schema where Type and Encoded differ
    const DateString = Schema.transform(Schema.String, Schema.DateFromSelf, {
      strict: true,
      decode: (s) => new Date(s),
      encode: (d) => d.toISOString(),
    });

    const _tableWithTransform = ConfectTable.make({
      name: "with_transform",
      fields: Schema.Struct({
        label: Schema.String,
        timestamp: DateString,
      }),
    });

    type TableWithTransformInfo = ConfectTableInfo.ConfectTableInfo<
      typeof _tableWithTransform
    >;

    test("confectDocument has decoded Type", () => {
      expectTypeOf<TableWithTransformInfo["confectDocument"]>().toEqualTypeOf<{
        readonly _id: GenericId<"with_transform">;
        readonly _creationTime: number;
        readonly label: string;
        readonly timestamp: Date;
      }>();
    });

    test("encodedConfectDocument has encoded Type", () => {
      expectTypeOf<
        TableWithTransformInfo["encodedConfectDocument"]
      >().toEqualTypeOf<{
        readonly _id: GenericId<"with_transform">;
        readonly _creationTime: number;
        readonly label: string;
        readonly timestamp: string;
      }>();
    });

    test("confectDocument and encodedConfectDocument differ for transformed fields", () => {
      type ConfectTimestamp =
        TableWithTransformInfo["confectDocument"]["timestamp"];
      type EncodedTimestamp =
        TableWithTransformInfo["encodedConfectDocument"]["timestamp"];

      expectTypeOf<ConfectTimestamp>().toEqualTypeOf<Date>();
      expectTypeOf<EncodedTimestamp>().toEqualTypeOf<string>();
    });
  });
});

