import { Schema } from "@effect/schema";
import { GenericDataModel, GenericTableInfo } from "convex/server";
import { GenericId } from "convex/values";
import { Brand } from "effect";
import { describe, expectTypeOf, test } from "vitest";

import {
  DataModelFromConfectDataModel,
  GenericConfectDataModel,
  TableInfoFromConfectTableInfo,
  WithIdAndSystemFields,
  WithIdField,
  WithSystemFields,
} from "~/src/data-model";
import {
  ConfectDataModelFromConfectSchema,
  ConfectSchemaFromConfectSchemaDefinition,
  defineConfectSchema,
  defineConfectTable,
  GenericConfectSchema,
} from "~/src/schema";

describe("ConfectDataModelFromConfectSchema", () => {
  test("extends GenericConfectDataModel and equals correct document and confectDocument types", () => {
    const TableSchema = Schema.Struct({
      content: Schema.String,
    });
    const confectTableDefinition = defineConfectTable(TableSchema);
    const confectSchemaDefinition = defineConfectSchema({
      notes: confectTableDefinition,
    });
    type ConfectSchema = ConfectSchemaFromConfectSchemaDefinition<
      typeof confectSchemaDefinition
    >;

    type ConfectDataModel = ConfectDataModelFromConfectSchema<ConfectSchema>;

    expectTypeOf<ConfectDataModel>().toMatchTypeOf<GenericConfectDataModel>();
    expectTypeOf<ConfectDataModel["notes"]["confectDocument"]>().toEqualTypeOf<{
      readonly _id: GenericId<"notes">;
      readonly _creationTime: number;
      readonly content: string;
    }>();
    expectTypeOf<ConfectDataModel["notes"]["convexDocument"]>().toEqualTypeOf<{
      _id: GenericId<"notes">;
      _creationTime: number;
      content: string;
    }>();
  });
});

describe("ConfectSchemaFromConfectSchemaDefinition", () => {
  test("extends GenericConfectSchema", () => {
    const NoteSchema = Schema.Struct({
      content: Schema.String,
    });
    const notesTableDefinition = defineConfectTable(NoteSchema);
    const schemaDefinition = defineConfectSchema({
      notes: notesTableDefinition,
    });

    type ConfectSchema = ConfectSchemaFromConfectSchemaDefinition<
      typeof schemaDefinition
    >;

    expectTypeOf<ConfectSchema>().toMatchTypeOf<GenericConfectSchema>();
  });
});

describe("WithIdField", () => {
  test("accepts a GenericDocument or GenericConfectDocument and adds an _id field for the given table name", () => {
    type TableName = "emails";
    type Document = { email: string };
    type Email = string & Brand.Brand<"Email">;
    type ConfectDocument = { readonly email: Email };

    type WithIdDocument = WithIdField<Document, TableName>;
    type WithIdConfectDocument = WithIdField<ConfectDocument, TableName>;

    expectTypeOf<WithIdDocument>().toEqualTypeOf<{
      _id: GenericId<TableName>;
      email: string;
    }>();
    expectTypeOf<WithIdConfectDocument>().toEqualTypeOf<{
      readonly _id: GenericId<TableName>;
      readonly email: Email;
    }>();
  });
});

describe("WithSystemFields", () => {
  test("accepts a GenericDocument or GenericConfectDocument and adds the system fields", () => {
    type Document = { email: string };
    type Email = string & Brand.Brand<"Email">;
    type ConfectDocument = { readonly email: Email };

    type WithSystemFieldsDocument = WithSystemFields<Document>;
    type WithSystemFieldsConfectDocument = WithSystemFields<ConfectDocument>;

    expectTypeOf<WithSystemFieldsDocument>().toEqualTypeOf<{
      _creationTime: number;
      email: string;
    }>();
    expectTypeOf<WithSystemFieldsConfectDocument>().toEqualTypeOf<{
      readonly _creationTime: number;
      readonly email: Email;
    }>();
  });
});

describe("WithIdAndSystemFields", () => {
  test("accepts a GenericDocument or GenericConfectDocument and adds an _id field and system fields", () => {
    type TableName = "users";
    type Document = { name: string; age: number };
    type User = {
      name: string & Brand.Brand<"Name">;
      age: number & Brand.Brand<"Age">;
    };
    type ConfectDocument = {
      readonly name: User["name"];
      readonly age: User["age"];
    };

    type WithIdAndSystemFieldsDocument = WithIdAndSystemFields<
      Document,
      TableName
    >;
    type WithIdAndSystemFieldsConfectDocument = WithIdAndSystemFields<
      ConfectDocument,
      TableName
    >;

    expectTypeOf<WithIdAndSystemFieldsDocument>().toEqualTypeOf<{
      _id: GenericId<TableName>;
      _creationTime: number;
      name: string;
      age: number;
    }>();
    expectTypeOf<WithIdAndSystemFieldsConfectDocument>().toEqualTypeOf<{
      readonly _id: GenericId<TableName>;
      readonly _creationTime: number;
      readonly name: User["name"];
      readonly age: User["age"];
    }>();
  });
});

describe("TableInfoFromConfectTableInfo", () => {
  test("extends GenericTableInfo", () => {
    const TableSchema = Schema.Struct({
      content: Schema.String,
    });
    const confectTableDefinition = defineConfectTable(TableSchema);
    const confectSchemaDefinition = defineConfectSchema({
      notes: confectTableDefinition,
    });
    type ConfectSchema = ConfectSchemaFromConfectSchemaDefinition<
      typeof confectSchemaDefinition
    >;
    type ConfectDataModel = ConfectDataModelFromConfectSchema<ConfectSchema>;
    type ConfectTableInfo = ConfectDataModel["notes"];

    type TableInfo = TableInfoFromConfectTableInfo<ConfectTableInfo>;

    expectTypeOf<TableInfo>().toMatchTypeOf<GenericTableInfo>();
  });
});

describe("DataModelFromConfectDataModel", () => {
  test("extends GenericDataModel", () => {
    const TableSchema = Schema.Struct({
      content: Schema.String,
    });
    const confectTableDefinition = defineConfectTable(TableSchema);
    const confectSchemaDefinition = defineConfectSchema({
      notes: confectTableDefinition,
    });
    type ConfectSchema = ConfectSchemaFromConfectSchemaDefinition<
      typeof confectSchemaDefinition
    >;
    type ConfectDataModel = ConfectDataModelFromConfectSchema<ConfectSchema>;

    type DataModel = DataModelFromConfectDataModel<ConfectDataModel>;

    expectTypeOf<DataModel>().toMatchTypeOf<GenericDataModel>();
  });
});
