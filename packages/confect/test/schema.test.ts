import { describe, expectTypeOf, test } from "@effect/vitest";
import type { SystemDataModel } from "convex/server";
import { Schema } from "effect";
import type {
  DataModelFromConfectDataModel,
  GenericConfectDataModel,
} from "../src/server/ConfectDataModel";
import {
  type ConfectDataModelFromConfectSchema,
  type ConfectSystemDataModel,
  type ConfectTableDefinition,
  type confectSystemTableDefinitions,
  type confectSystemTableSchemas,
  defineConfectTable,
} from "../src/server/ConfectSchema";

describe("ConfectDataModelFromConfectSchema", () => {
  test("produces a type which is assignable to GenericConfectDataModel", () => {
    const NoteSchema = Schema.Struct({
      content: Schema.String,
    });

    const _notesTableDefinition = defineConfectTable({
      name: "notes",
      fields: NoteSchema,
    });

    type ConfectSchema = [typeof _notesTableDefinition];

    type ConfectDataModel = ConfectDataModelFromConfectSchema<ConfectSchema>;

    expectTypeOf<ConfectDataModel>().toExtend<GenericConfectDataModel>();
  });
});

describe("ConfectSystemDataModel", () => {
  test("when converted to a Convex DataModel, is equivalent to SystemDataModel", () => {
    type Actual = DataModelFromConfectDataModel<ConfectSystemDataModel>;
    type Expected = SystemDataModel;

    expectTypeOf<Actual>().toEqualTypeOf<Expected>();
  });
});

describe("confectTableSchemas", () => {
  test("matches confectSystemTableDefinitions", () => {
    type ConfectTableSchemas = typeof confectSystemTableSchemas;
    type ConfectSystemTableDefinitions = typeof confectSystemTableDefinitions;

    type ConfectTableSchemasFromConfectSystemTableDefinitions = {
      [K in ConfectSystemTableDefinitions[number] as K extends ConfectTableDefinition<
        infer TableName,
        any,
        any,
        any,
        any,
        any
      >
        ? TableName
        : never]: K extends ConfectTableDefinition<
        any,
        infer S,
        any,
        any,
        any,
        any
      >
        ? S
        : never;
    };

    type Actual = ConfectTableSchemas;
    type Expected = ConfectTableSchemasFromConfectSystemTableDefinitions;

    expectTypeOf<Actual>().toEqualTypeOf<Expected>();
  });
});
