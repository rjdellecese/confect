import { Schema } from "@effect/schema";
import { GenericDataModel, GenericTableInfo } from "convex/server";
import { GenericId } from "convex/values";
import { describe, expectTypeOf, test } from "vitest";

import {
  DataModelFromConfectDataModel,
  GenericConfectDataModel,
  TableInfoFromConfectTableInfo,
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
