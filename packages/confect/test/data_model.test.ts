import type { GenericDataModel, GenericTableInfo } from "convex/server";
import type { GenericId } from "convex/values";
import { Schema } from "effect";
import { describe, expectTypeOf, test } from "vitest";

import type * as DataModel from "../src/server/DataModel";
import * as DatabaseSchema from "../src/server/DatabaseSchema";
import * as Table from "../src/server/Table";
import type * as TableInfo from "../src/server/TableInfo";

describe("DataModel.FromSchema", () => {
  test("extends GenericConfectDataModel and equals correct document and document types", () => {
    const TableSchema = Schema.Struct({
      content: Schema.String,
    });
    const confectTableDefinition = Table.make("notes", TableSchema);
    const confectSchema = DatabaseSchema.make().addTable(confectTableDefinition);
    type ConfectDataModel = DataModel.DataModel.FromSchema<
      typeof confectSchema
    >;

    expectTypeOf<ConfectDataModel>().toExtend<DataModel.DataModel.Any>();
    expectTypeOf<
      DataModel.DataModel.TableInfoWithName_<
        ConfectDataModel,
        "notes"
      >["document"]
    >().toEqualTypeOf<{
      readonly _id: GenericId<"notes">;
      readonly _creationTime: number;
      readonly content: string;
    }>();
    expectTypeOf<
      DataModel.DataModel.TableInfoWithName_<
        ConfectDataModel,
        "notes"
      >["convexDocument"]
    >().toEqualTypeOf<{
      _id: GenericId<"notes">;
      _creationTime: number;
      content: string;
    }>();
  });
});

describe("DatabaseSchema.Any", () => {
  test("extends DatabaseSchema.Any", () => {
    const NoteSchema = Schema.Struct({
      content: Schema.String,
    });
    const notesTable = Table.make("notes", NoteSchema);
    const confectSchema = DatabaseSchema.make().addTable(notesTable);

    expectTypeOf<typeof confectSchema>().toExtend<DatabaseSchema.DatabaseSchema.Any>();
  });
});

describe("TableInfo.TableInfo.TableInfo", () => {
  test("extends GenericTableInfo", () => {
    const TableSchema = Schema.Struct({
      content: Schema.String,
    });
    const confectTableDefinition = Table.make("notes", TableSchema);
    const confectSchema = DatabaseSchema.make().addTable(confectTableDefinition);
    type ConfectDataModel = DataModel.DataModel.FromSchema<
      typeof confectSchema
    >;
    type TableInfo_ = DataModel.DataModel.TableInfoWithName_<
      ConfectDataModel,
      "notes"
    >;

    type ConvexTableInfo = TableInfo.TableInfo.TableInfo<TableInfo_>;

    expectTypeOf<ConvexTableInfo>().toExtend<GenericTableInfo>();
  });
});

describe("DataModel.DataModel.ToConvex", () => {
  test("extends GenericDataModel", () => {
    const TableSchema = Schema.Struct({
      content: Schema.String,
    });
    const confectTableDefinition = Table.make("notes", TableSchema);
    const confectSchema = DatabaseSchema.make().addTable(confectTableDefinition);
    type ConfectDataModel = DataModel.DataModel.FromSchema<
      typeof confectSchema
    >;

    type ConvexDataModel = DataModel.DataModel.ToConvex<ConfectDataModel>;

    expectTypeOf<ConvexDataModel>().toExtend<GenericDataModel>();
  });
});
