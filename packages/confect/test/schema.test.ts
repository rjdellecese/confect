import { describe, expectTypeOf, test } from "@effect/vitest";
import type { SystemDataModel } from "convex/server";
import { Schema } from "effect";
import type {
  DataModelFromConfectDataModel,
  GenericConfectDataModel,
} from "../src/server/data_model";
import {
  type ConfectDataModelFromConfectSchema,
  type ConfectSystemDataModel,
  type ConfectTableDefinition,
  type confectSystemSchema,
  confectSystemSchemaDefinition,
  type confectSystemTableSchemas,
  defineConfectSchema,
  defineConfectTable,
} from "../src/server/schema";
import { extendWithSystemFields } from "../src/server/schemas/SystemFields";

describe("ConfectDataModelFromConfectSchema", () => {
  test("produces a type which is assignable to GenericConfectDataModel", () => {
    const NoteSchema = Schema.Struct({
      content: Schema.String,
    });

    const _notesTableDefinition = defineConfectTable(NoteSchema);

    type ConfectSchema = {
      notes: typeof _notesTableDefinition;
    };

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

describe("tableSchemas", () => {
  test("extends the table schemas with system fields", () => {
    const NoteSchema = Schema.Struct({
      content: Schema.String,
    });

    const _confectTableSchemas = defineConfectSchema({
      notes: defineConfectTable(NoteSchema),
    }).tableSchemas;

    type Actual = typeof _confectTableSchemas;

    const _expectedTableSchemas = {
      notes: schemaToTableSchemas("notes", NoteSchema),
      ...systemTableSchemas,
    };

    type Expected = typeof _expectedTableSchemas;

    expectTypeOf<Actual>().toEqualTypeOf<Expected>();
  });

  test("permits unions of structs", () => {
    const NoteSchema = Schema.Struct({
      content: Schema.String,
    });

    const ImageSchema = Schema.Struct({
      url: Schema.String,
    });

    const ItemSchema = Schema.Union(NoteSchema, ImageSchema);

    const _confectTableSchemas = defineConfectSchema({
      items: defineConfectTable(ItemSchema),
    }).tableSchemas;

    type Actual = typeof _confectTableSchemas;

    const _expectedTableSchemas = {
      items: schemaToTableSchemas("items", ItemSchema),
      ...systemTableSchemas,
    };

    type Expected = typeof _expectedTableSchemas;

    expectTypeOf<Actual>().toEqualTypeOf<Expected>();
  });
});

describe("confectTableSchemas", () => {
  test("matches confectSystemSchema", () => {
    type ConfectTableSchemas = typeof confectSystemTableSchemas;
    type ConfectSystemSchema = typeof confectSystemSchema;

    type ConfectTableSchemasFromConfectSystemSchema = {
      [K in keyof ConfectSystemSchema]: ConfectSystemSchema[K] extends ConfectTableDefinition<
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
    type Expected = ConfectTableSchemasFromConfectSystemSchema;

    expectTypeOf<Actual>().toEqualTypeOf<Expected>();
  });
});

const schemaToTableSchemas = <
  TableName extends string,
  TableSchema extends Schema.Schema.AnyNoContext,
>(
  name: TableName,
  schema: TableSchema,
) => ({
  withSystemFields: extendWithSystemFields(name, schema),
  withoutSystemFields: schema,
});

const systemTableSchemas = {
  _scheduled_functions: {
    withSystemFields: extendWithSystemFields(
      "_scheduled_functions",
      confectSystemSchemaDefinition.confectSchema._scheduled_functions
        .tableSchema,
    ),
    withoutSystemFields:
      confectSystemSchemaDefinition.confectSchema._scheduled_functions
        .tableSchema,
  },
  _storage: {
    withSystemFields: extendWithSystemFields(
      "_storage",
      confectSystemSchemaDefinition.confectSchema._storage.tableSchema,
    ),
    withoutSystemFields:
      confectSystemSchemaDefinition.confectSchema._storage.tableSchema,
  },
};
