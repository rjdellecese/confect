import { defineConfectSchema } from "~/src/schema";
import * as basic_schema_operations from "~/test/convex/basic_schema_operations__schema";

export const confectSchema = defineConfectSchema({
  ...basic_schema_operations.schema.tables,
});

export default confectSchema.schemaDefinition;
