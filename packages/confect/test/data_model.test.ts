import type { GenericDataModel, GenericTableInfo } from "convex/server";
import type { GenericId } from "convex/values";
import { Schema } from "effect";
import { describe, expectTypeOf, test } from "vitest";

import type {
  DataModelFromConfectDataModel,
  GenericConfectDataModel,
  TableInfoFromConfectTableInfo,
} from "../src/server/ConfectDataModel";
import {
  type ConfectDataModelFromConfectSchema,
  type ConfectSchemaFromConfectSchemaDefinition,
  defineConfectTable,
  type GenericConfectSchema,
  make,
} from "../src/server/ConfectSchema";

describe("ConfectDataModelFromConfectSchema", () => {
  test("extends GenericConfectDataModel and equals correct document and confectDocument types", () => {
    const TableSchema = Schema.Struct({
      content: Schema.String,
    });
    const confectTableDefinition = defineConfectTable({
      name: "notes",
      fields: TableSchema,
    });
    const _confectSchemaDefinition = make(confectTableDefinition);
    type ConfectSchema = ConfectSchemaFromConfectSchemaDefinition<
      typeof _confectSchemaDefinition
    >;

    type ConfectDataModel = ConfectDataModelFromConfectSchema<ConfectSchema>;

    expectTypeOf<ConfectDataModel>().toExtend<GenericConfectDataModel>();
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
    const notesTableDefinition = defineConfectTable({
      name: "notes",
      fields: NoteSchema,
    });
    const _schemaDefinition = make(notesTableDefinition);

    type ConfectSchema = ConfectSchemaFromConfectSchemaDefinition<
      typeof _schemaDefinition
    >;

    expectTypeOf<ConfectSchema>().toExtend<GenericConfectSchema>();
  });
});

describe("TableInfoFromConfectTableInfo", () => {
  test("extends GenericTableInfo", () => {
    const TableSchema = Schema.Struct({
      content: Schema.String,
    });
    const confectTableDefinition = defineConfectTable({
      name: "notes",
      fields: TableSchema,
    });
    const _confectSchemaDefinition = make(confectTableDefinition);
    type ConfectSchema = ConfectSchemaFromConfectSchemaDefinition<
      typeof _confectSchemaDefinition
    >;
    type ConfectDataModel = ConfectDataModelFromConfectSchema<ConfectSchema>;
    type ConfectTableInfo = ConfectDataModel["notes"];

    type TableInfo = TableInfoFromConfectTableInfo<ConfectTableInfo>;

    expectTypeOf<TableInfo>().toExtend<GenericTableInfo>();
  });
});

describe("DataModelFromConfectDataModel", () => {
  test("extends GenericDataModel", () => {
    const TableSchema = Schema.Struct({
      content: Schema.String,
    });
    const confectTableDefinition = defineConfectTable({
      name: "notes",
      fields: TableSchema,
    });
    const _confectSchemaDefinition = make(confectTableDefinition);
    type ConfectSchema = ConfectSchemaFromConfectSchemaDefinition<
      typeof _confectSchemaDefinition
    >;
    type ConfectDataModel = ConfectDataModelFromConfectSchema<ConfectSchema>;

    type DataModel = DataModelFromConfectDataModel<ConfectDataModel>;

    expectTypeOf<DataModel>().toExtend<GenericDataModel>();
  });
});
