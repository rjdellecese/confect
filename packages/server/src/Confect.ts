import type * as DatabaseSchema from "./DatabaseSchema";
import type * as DataModel from "./DataModel";

/**
 * The decoded document type for a table in a given schema.
 *
 * Codegen emits one nominal `interface <table> extends Confect.Doc<typeof
 * schemaDefinition, "<table>"> {}` per table (plus a `ConfectDocs` registry).
 * Because an `interface` is a named symbol, declaration emit prints the table
 * name instead of expanding the row structure — while `extends Confect.Doc<…>`
 * keeps it structurally exact. Hand-written code can also use this as a compact
 * return annotation, e.g. `Confect.Doc<typeof schemaDefinition, "notes">`.
 */
export type Doc<
  Schema_ extends DatabaseSchema.AnyWithProps,
  TableName extends DatabaseSchema.TableNames<Schema_>,
> = DataModel.DocumentByName<DataModel.FromSchema<Schema_>, TableName>;
