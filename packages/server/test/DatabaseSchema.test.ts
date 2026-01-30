import { describe, expectTypeOf, it } from "@effect/vitest";
import type { GenericSchema, SchemaDefinition } from "convex/server";
import type confectSchema from "./confect/schema";

describe("ConvexSchemaFromTables", () => {
  it("should be able to create a database schema", () => {
    type ConvexSchemaDefinition = typeof confectSchema.convexSchemaDefinition;

    expectTypeOf<ConvexSchemaDefinition>().toExtend<
      SchemaDefinition<GenericSchema, true>
    >();
  });
});
