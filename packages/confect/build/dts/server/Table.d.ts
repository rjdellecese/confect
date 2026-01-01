import { ExtendWithSystemFields } from "../api/SystemFields.js";
import { TableSchemaToTableValidator } from "./SchemaToValidator.js";
import { Schema } from "effect";
import { Expand, GenericTableIndexes, GenericTableSearchIndexes, GenericTableVectorIndexes, IndexTiebreakerField, SearchIndexConfig, SystemFields, TableDefinition, VectorIndexConfig } from "convex/server";
import * as convex_values1038 from "convex/values";
import { GenericValidator, Validator } from "convex/values";

//#region src/server/Table.d.ts
declare namespace Table_d_exports {
  export { SystemTables, Table, TypeId, isTable, make, scheduledFunctionsTable, storageTable, systemTables };
}
declare const TypeId = "@rjdellecese/confect/server/Table";
type TypeId = typeof TypeId;
declare const isTable: (u: unknown) => u is Table.Any;
interface Table<TableName$1 extends string, TableSchema extends Schema.Schema.AnyNoContext, TableValidator extends GenericValidator = TableSchemaToTableValidator<TableSchema>, Indexes$1 extends GenericTableIndexes = {}, SearchIndexes$1 extends GenericTableSearchIndexes = {}, VectorIndexes extends GenericTableVectorIndexes = {}> {
  readonly [TypeId]: TypeId;
  readonly tableDefinition: TableDefinition<TableValidator, Indexes$1, SearchIndexes$1, VectorIndexes>;
  readonly name: TableName$1;
  readonly Fields: TableSchema;
  readonly Doc: ExtendWithSystemFields<TableName$1, TableSchema>;
  readonly indexes: Indexes$1;
  index<IndexName extends string, FirstFieldPath extends ExtractFieldPaths<TableValidator>, RestFieldPaths extends ExtractFieldPaths<TableValidator>[]>(name: IndexName, fields: [FirstFieldPath, ...RestFieldPaths]): Table<TableName$1, TableSchema, TableValidator, Expand<Indexes$1 & Record<IndexName, [FirstFieldPath, ...RestFieldPaths, IndexTiebreakerField]>>, SearchIndexes$1, VectorIndexes>;
  searchIndex<IndexName extends string, SearchField extends ExtractFieldPaths<TableValidator>, FilterFields extends ExtractFieldPaths<TableValidator> = never>(name: IndexName, indexConfig: Expand<SearchIndexConfig<SearchField, FilterFields>>): Table<TableName$1, TableSchema, TableValidator, Indexes$1, Expand<SearchIndexes$1 & Record<IndexName, {
    searchField: SearchField;
    filterFields: FilterFields;
  }>>, VectorIndexes>;
  vectorIndex<IndexName extends string, VectorField extends ExtractFieldPaths<TableValidator>, FilterFields extends ExtractFieldPaths<TableValidator> = never>(name: IndexName, indexConfig: Expand<VectorIndexConfig<VectorField, FilterFields>>): Table<TableName$1, TableSchema, TableValidator, Indexes$1, SearchIndexes$1, Expand<VectorIndexes & Record<IndexName, {
    vectorField: VectorField;
    dimensions: number;
    filterFields: FilterFields;
  }>>>;
}
declare namespace Table {
  interface Any {
    readonly [TypeId]: TypeId;
  }
  type AnyWithProps = Table<any, Schema.Schema.AnyNoContext, GenericValidator, GenericTableIndexes, GenericTableSearchIndexes, GenericTableVectorIndexes>;
  type Name<TableDef extends AnyWithProps> = TableDef extends Table<infer TableName, infer _TableSchema, infer _TableValidator, infer _Indexes, infer _SearchIndexes, infer _VectorIndexes> ? TableName & string : never;
  type TableSchema<TableDef extends AnyWithProps> = TableDef extends Table<infer _TableName, infer TableSchema_, infer _TableValidator, infer _Indexes, infer _SearchIndexes, infer _VectorIndexes> ? TableSchema_ : never;
  type TableValidator<TableDef extends AnyWithProps> = TableDef extends Table<infer _TableName, infer _TableSchema, infer TableValidator_, infer _Indexes, infer _SearchIndexes, infer _VectorIndexes> ? TableValidator_ : never;
  type Indexes<TableDef extends AnyWithProps> = TableDef extends Table<infer _TableName, infer _TableSchema, infer _TableValidator, infer Indexes_, infer _SearchIndexes, infer _VectorIndexes> ? Indexes_ : never;
  type SearchIndexes<TableDef extends AnyWithProps> = TableDef extends Table<infer _TableName, infer _TableSchema, infer _TableValidator, infer _Indexes, infer SearchIndexes_, infer _VectorIndexes> ? SearchIndexes_ : never;
  type VectorIndexes<TableDef extends AnyWithProps> = TableDef extends Table<infer _TableName, infer _TableSchema, infer _TableValidator, infer _Indexes, infer _SearchIndexes, infer VectorIndexes_> ? VectorIndexes_ : never;
  type Doc<TableDef extends AnyWithProps> = TableDef extends Table<infer TableName, infer TableSchema_, infer _TableValidator, infer _Indexes, infer _SearchIndexes, infer _VectorIndexes> ? ExtendWithSystemFields<TableName, TableSchema_> : never;
  type Fields<TableDef extends AnyWithProps> = TableDef extends Table<infer _TableName, infer TableSchema_, infer _TableValidator, infer _Indexes, infer _SearchIndexes, infer _VectorIndexes> ? TableSchema_ : never;
  type WithName<TableDef extends AnyWithProps, Name_ extends string> = TableDef extends {
    readonly name: Name_;
  } ? TableDef : never;
  type TablesRecord<Tables extends AnyWithProps> = { readonly [TableName_ in Name<Tables>]: WithName<Tables, TableName_> };
}
/**
 * Create a table.
 */
declare const make: <const TableName$1 extends string, TableSchema extends Schema.Schema.AnyNoContext>(name: TableName$1, fields: TableSchema) => Table<TableName$1, TableSchema>;
declare const scheduledFunctionsTable: Table<"_scheduled_functions", Schema.Struct<{
  name: typeof Schema.String;
  args: Schema.Array$<typeof Schema.Any>;
  scheduledTime: typeof Schema.Number;
  completedTime: Schema.optionalWith<typeof Schema.Number, {
    exact: true;
  }>;
  state: Schema.Union<[Schema.Struct<{
    kind: Schema.Literal<["pending"]>;
  }>, Schema.Struct<{
    kind: Schema.Literal<["inProgress"]>;
  }>, Schema.Struct<{
    kind: Schema.Literal<["success"]>;
  }>, Schema.Struct<{
    kind: Schema.Literal<["failed"]>;
    error: typeof Schema.String;
  }>, Schema.Struct<{
    kind: Schema.Literal<["canceled"]>;
  }>]>;
}>, convex_values1038.VObject<{
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
  name: convex_values1038.VString<string, "required">;
  args: convex_values1038.VArray<any[], convex_values1038.VAny<any, "required", string>, "required">;
  scheduledTime: convex_values1038.VFloat64<number, "required">;
  state: convex_values1038.VObject<{
    kind: "pending";
  }, {
    kind: convex_values1038.VLiteral<"pending", "required">;
  }, "required", "kind"> | convex_values1038.VObject<{
    kind: "inProgress";
  }, {
    kind: convex_values1038.VLiteral<"inProgress", "required">;
  }, "required", "kind"> | convex_values1038.VObject<{
    kind: "success";
  }, {
    kind: convex_values1038.VLiteral<"success", "required">;
  }, "required", "kind"> | convex_values1038.VObject<{
    kind: "failed";
    error: string;
  }, {
    kind: convex_values1038.VLiteral<"failed", "required">;
    error: convex_values1038.VString<string, "required">;
  }, "required", "kind" | "error"> | convex_values1038.VObject<{
    kind: "canceled";
  }, {
    kind: convex_values1038.VLiteral<"canceled", "required">;
  }, "required", "kind">;
  completedTime: convex_values1038.VFloat64<number | undefined, "optional">;
}, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>;
declare const storageTable: Table<"_storage", Schema.Struct<{
  sha256: typeof Schema.String;
  size: typeof Schema.Number;
  contentType: Schema.optionalWith<typeof Schema.String, {
    exact: true;
  }>;
}>, convex_values1038.VObject<{
  sha256: string;
  size: number;
  contentType?: string | undefined;
}, {
  sha256: convex_values1038.VString<string, "required">;
  size: convex_values1038.VFloat64<number, "required">;
  contentType: convex_values1038.VString<string | undefined, "optional">;
}, "required", "sha256" | "size" | "contentType">, {}, {}, {}>;
declare const systemTables: {
  readonly _scheduled_functions: Table<"_scheduled_functions", Schema.Struct<{
    name: typeof Schema.String;
    args: Schema.Array$<typeof Schema.Any>;
    scheduledTime: typeof Schema.Number;
    completedTime: Schema.optionalWith<typeof Schema.Number, {
      exact: true;
    }>;
    state: Schema.Union<[Schema.Struct<{
      kind: Schema.Literal<["pending"]>;
    }>, Schema.Struct<{
      kind: Schema.Literal<["inProgress"]>;
    }>, Schema.Struct<{
      kind: Schema.Literal<["success"]>;
    }>, Schema.Struct<{
      kind: Schema.Literal<["failed"]>;
      error: typeof Schema.String;
    }>, Schema.Struct<{
      kind: Schema.Literal<["canceled"]>;
    }>]>;
  }>, convex_values1038.VObject<{
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
    name: convex_values1038.VString<string, "required">;
    args: convex_values1038.VArray<any[], convex_values1038.VAny<any, "required", string>, "required">;
    scheduledTime: convex_values1038.VFloat64<number, "required">;
    state: convex_values1038.VObject<{
      kind: "pending";
    }, {
      kind: convex_values1038.VLiteral<"pending", "required">;
    }, "required", "kind"> | convex_values1038.VObject<{
      kind: "inProgress";
    }, {
      kind: convex_values1038.VLiteral<"inProgress", "required">;
    }, "required", "kind"> | convex_values1038.VObject<{
      kind: "success";
    }, {
      kind: convex_values1038.VLiteral<"success", "required">;
    }, "required", "kind"> | convex_values1038.VObject<{
      kind: "failed";
      error: string;
    }, {
      kind: convex_values1038.VLiteral<"failed", "required">;
      error: convex_values1038.VString<string, "required">;
    }, "required", "kind" | "error"> | convex_values1038.VObject<{
      kind: "canceled";
    }, {
      kind: convex_values1038.VLiteral<"canceled", "required">;
    }, "required", "kind">;
    completedTime: convex_values1038.VFloat64<number | undefined, "optional">;
  }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>;
  readonly _storage: Table<"_storage", Schema.Struct<{
    sha256: typeof Schema.String;
    size: typeof Schema.Number;
    contentType: Schema.optionalWith<typeof Schema.String, {
      exact: true;
    }>;
  }>, convex_values1038.VObject<{
    sha256: string;
    size: number;
    contentType?: string | undefined;
  }, {
    sha256: convex_values1038.VString<string, "required">;
    size: convex_values1038.VFloat64<number, "required">;
    contentType: convex_values1038.VString<string | undefined, "optional">;
  }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>;
};
type SystemTables = typeof scheduledFunctionsTable | typeof storageTable;
/**
 * Extract all of the index field paths within a {@link Validator}.
 *
 * This is used within {@link defineTable}.
 * @public
 */
type ExtractFieldPaths<T extends Validator<any, any, any>> = T["fieldPaths"] | keyof SystemFields;
//#endregion
export { SystemTables, Table, Table_d_exports, TypeId, isTable, make, scheduledFunctionsTable, storageTable, systemTables };
//# sourceMappingURL=Table.d.ts.map