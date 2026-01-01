import { describe, expectTypeOf, test } from "@effect/vitest";
import type { SystemDataModel } from "convex/server";
import { Schema } from "effect";
import type * as DataModel from "../src/server/DataModel";
import * as DatabaseSchema from "../src/server/DatabaseSchema";
import * as Table from "../src/server/Table";

describe("DataModel.FromSchema", () => {
  test("produces a type which is assignable to DataModel.Any", () => {
    const NoteSchema = Schema.Struct({
      content: Schema.String,
    });

    const notesTable = Table.make("notes", NoteSchema);

    const confectSchema = DatabaseSchema.make().addTable(notesTable);

    type ConfectDataModel = DataModel.DataModel.FromSchema<
      typeof confectSchema
    >;

    expectTypeOf<ConfectDataModel>().toExtend<DataModel.DataModel.Any>();
  });
});

describe("SystemSchema DataModel", () => {
  test("when converted to a Convex DataModel, is equivalent to SystemDataModel", () => {
    type SystemSchemaDataModel = DataModel.DataModel.FromSchema<
      typeof DatabaseSchema.systemSchema
    >;
    type Actual = DataModel.DataModel.ToConvex<SystemSchemaDataModel>;
    type Expected = SystemDataModel;

    expectTypeOf<Actual>().toEqualTypeOf<Expected>();
  });
});

describe("systemSchema", () => {
  test("has correct table names", () => {
    type TableNames = DatabaseSchema.DatabaseSchema.TableNames<typeof DatabaseSchema.systemSchema>;

    expectTypeOf<TableNames>().toEqualTypeOf<
      "_scheduled_functions" | "_storage"
    >();
  });
});
