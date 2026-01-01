import { SystemTables, Table } from "./Table.js";
import { GenericSchema, SchemaDefinition } from "convex/server";
import * as convex_values1017 from "convex/values";
import * as effect_Schema1151 from "effect/Schema";

//#region src/server/DatabaseSchema.d.ts
declare namespace DatabaseSchema_d_exports {
  export { DatabaseSchema, ExtendWithSystemTables, IncludeSystemTables, TypeId, extendWithSystemTables, isSchema, make, systemSchema };
}
declare const TypeId = "@rjdellecese/confect/server/Schema";
type TypeId = typeof TypeId;
declare const isSchema: (u: unknown) => u is DatabaseSchema.Any;
/**
 * A schema definition tracks the schema and its Convex schema definition.
 */
interface DatabaseSchema<Tables$1 extends Table.AnyWithProps = never> {
  readonly [TypeId]: TypeId;
  readonly tables: Table.TablesRecord<Tables$1>;
  readonly convexSchemaDefinition: SchemaDefinition<GenericSchema, true>;
  /**
   * Add a table definition to the schema.
   */
  addTable<TableDef extends Table.AnyWithProps>(table: TableDef): DatabaseSchema<Tables$1 | TableDef>;
}
declare namespace DatabaseSchema {
  interface Any {
    readonly [TypeId]: TypeId;
  }
  interface AnyWithProps {
    readonly [TypeId]: TypeId;
    readonly tables: Record<string, Table.AnyWithProps>;
    readonly convexSchemaDefinition: SchemaDefinition<GenericSchema, true>;
    addTable<TableDef extends Table.AnyWithProps>(table: TableDef): AnyWithProps;
  }
  type Tables<S extends AnyWithProps> = S extends DatabaseSchema<infer Tables_> ? Tables_ : never;
  type TableNames<S extends AnyWithProps> = Table.Name<Tables<S>> & string;
  type TableWithName<S extends AnyWithProps, TableName extends TableNames<S>> = Extract<Tables<S>, {
    readonly name: TableName;
  }>;
}
/**
 * Create an empty schema definition. Add tables incrementally via `addTable`.
 */
declare const make: () => DatabaseSchema<never>;
declare const systemSchema: DatabaseSchema<Table<"_scheduled_functions", effect_Schema1151.Struct<{
  name: typeof effect_Schema1151.String;
  args: effect_Schema1151.Array$<typeof effect_Schema1151.Any>;
  scheduledTime: typeof effect_Schema1151.Number;
  completedTime: effect_Schema1151.optionalWith<typeof effect_Schema1151.Number, {
    exact: true;
  }>;
  state: effect_Schema1151.Union<[effect_Schema1151.Struct<{
    kind: effect_Schema1151.Literal<["pending"]>;
  }>, effect_Schema1151.Struct<{
    kind: effect_Schema1151.Literal<["inProgress"]>;
  }>, effect_Schema1151.Struct<{
    kind: effect_Schema1151.Literal<["success"]>;
  }>, effect_Schema1151.Struct<{
    kind: effect_Schema1151.Literal<["failed"]>;
    error: typeof effect_Schema1151.String;
  }>, effect_Schema1151.Struct<{
    kind: effect_Schema1151.Literal<["canceled"]>;
  }>]>;
}>, convex_values1017.VObject<{
  name: string;
  args: any[];
  scheduledTime: number;
  state: {
    kind: "pending";
  } | {
    kind: "inProgress";
  } | {
    kind: "success";
  } | {
    kind: "failed";
    error: string;
  } | {
    kind: "canceled";
  };
  completedTime?: number | undefined;
}, {
  name: convex_values1017.VString<string, "required">;
  args: convex_values1017.VArray<any[], convex_values1017.VAny<any, "required", string>, "required">;
  scheduledTime: convex_values1017.VFloat64<number, "required">;
  state: convex_values1017.VObject<{
    kind: "pending";
  }, {
    kind: convex_values1017.VLiteral<"pending", "required">;
  }, "required", "kind"> | convex_values1017.VObject<{
    kind: "inProgress";
  }, {
    kind: convex_values1017.VLiteral<"inProgress", "required">;
  }, "required", "kind"> | convex_values1017.VObject<{
    kind: "success";
  }, {
    kind: convex_values1017.VLiteral<"success", "required">;
  }, "required", "kind"> | convex_values1017.VObject<{
    kind: "failed";
    error: string;
  }, {
    kind: convex_values1017.VLiteral<"failed", "required">;
    error: convex_values1017.VString<string, "required">;
  }, "required", "kind" | "error"> | convex_values1017.VObject<{
    kind: "canceled";
  }, {
    kind: convex_values1017.VLiteral<"canceled", "required">;
  }, "required", "kind">;
  completedTime: convex_values1017.VFloat64<number | undefined, "optional">;
}, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}> | Table<"_storage", effect_Schema1151.Struct<{
  sha256: typeof effect_Schema1151.String;
  size: typeof effect_Schema1151.Number;
  contentType: effect_Schema1151.optionalWith<typeof effect_Schema1151.String, {
    exact: true;
  }>;
}>, convex_values1017.VObject<{
  sha256: string;
  size: number;
  contentType?: string | undefined;
}, {
  sha256: convex_values1017.VString<string, "required">;
  size: convex_values1017.VFloat64<number, "required">;
  contentType: convex_values1017.VString<string | undefined, "optional">;
}, "required", "sha256" | "size" | "contentType">, {}, {}, {}>>;
declare const extendWithSystemTables: <Tables$1 extends Table.AnyWithProps>(tables: Table.TablesRecord<Tables$1>) => ExtendWithSystemTables<Tables$1>;
type ExtendWithSystemTables<Tables$1 extends Table.AnyWithProps> = Table.TablesRecord<Tables$1 | SystemTables>;
type IncludeSystemTables<Tables$1 extends Table.AnyWithProps> = Tables$1 | SystemTables;
//#endregion
export { DatabaseSchema, DatabaseSchema_d_exports, ExtendWithSystemTables, IncludeSystemTables, TypeId, extendWithSystemTables, isSchema, make, systemSchema };
//# sourceMappingURL=DatabaseSchema.d.ts.map