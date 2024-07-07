import { Schema } from "@effect/schema";
import { describe, test } from "@effect/vitest";

import { DatabaseSchemasFromConfectDataModel } from "~/src/database";
import {
  ConfectDataModelFromConfectSchema,
  defineConfectTable,
} from "~/src/schema";

describe("DatabaseSchemasFromConfectDataModel", () => {
  test("a", () => {
    const confectSchema = {
      notes: defineConfectTable(
        Schema.Struct({
          text: Schema.String,
        })
      ),
    };
    type ConfectSchema = typeof confectSchema;
    type ConfectDataModel = ConfectDataModelFromConfectSchema<ConfectSchema>;

    type DatabaseSchemas =
      DatabaseSchemasFromConfectDataModel<ConfectDataModel>;
  });
});
