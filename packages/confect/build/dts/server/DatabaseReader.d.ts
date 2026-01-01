import { IndexFieldTypesForEq } from "../internal/typeUtils.js";
import { Table } from "./Table.js";
import { DatabaseSchema, IncludeSystemTables } from "./DatabaseSchema.js";
import { DataModel } from "./DataModel.js";
import { DocumentDecodeError } from "./Document.js";
import { TableInfo } from "./TableInfo.js";
import { OrderedQuery as OrderedQuery$1 } from "./OrderedQuery.js";
import { GetByIdFailure, GetByIndexFailure } from "./QueryInitializer.js";
import { Context, Layer } from "effect";
import * as convex_server0 from "convex/server";
import { GenericDatabaseReader } from "convex/server";
import * as convex_values5 from "convex/values";
import * as effect_Schema0 from "effect/Schema";
import * as effect_Effect0 from "effect/Effect";

//#region src/server/DatabaseReader.d.ts
declare namespace DatabaseReader_d_exports {
  export { DatabaseReader, layer, make };
}
declare const make: <Schema$1 extends DatabaseSchema.AnyWithProps>(schema: Schema$1, convexDatabaseReader: GenericDatabaseReader<DataModel.ToConvex<DataModel.FromSchema<Schema$1>>>) => {
  table: <const TableName extends Table.Name<IncludeSystemTables<DatabaseSchema.Tables<Schema$1>>>>(tableName: TableName) => {
    readonly get: {
      (id: convex_values5.GenericId<TableName>): effect_Effect0.Effect<(TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
        name: typeof effect_Schema0.String;
        args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
        scheduledTime: typeof effect_Schema0.Number;
        completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
          exact: true;
        }>;
        state: effect_Schema0.Union<[effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["pending"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["inProgress"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["success"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["failed"]>;
          error: typeof effect_Schema0.String;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["canceled"]>;
        }>]>;
      }>, convex_values5.VObject<{
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
        name: convex_values5.VString<string, "required">;
        args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
        scheduledTime: convex_values5.VFloat64<number, "required">;
        state: convex_values5.VObject<{
          kind: "pending";
        }, {
          kind: convex_values5.VLiteral<"pending", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "inProgress";
        }, {
          kind: convex_values5.VLiteral<"inProgress", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "success";
        }, {
          kind: convex_values5.VLiteral<"success", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "failed";
          error: string;
        }, {
          kind: convex_values5.VLiteral<"failed", "required">;
          error: convex_values5.VString<string, "required">;
        }, "required", "kind" | "error"> | convex_values5.VObject<{
          kind: "canceled";
        }, {
          kind: convex_values5.VLiteral<"canceled", "required">;
        }, "required", "kind">;
        completedTime: convex_values5.VFloat64<number | undefined, "optional">;
      }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
        sha256: typeof effect_Schema0.String;
        size: typeof effect_Schema0.Number;
        contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
          exact: true;
        }>;
      }>, convex_values5.VObject<{
        sha256: string;
        size: number;
        contentType?: string | undefined;
      }, {
        sha256: convex_values5.VString<string, "required">;
        size: convex_values5.VFloat64<number, "required">;
        contentType: convex_values5.VString<string | undefined, "optional">;
      }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>)["document"], DocumentDecodeError | GetByIdFailure, never>;
      <IndexName extends keyof (TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
        name: typeof effect_Schema0.String;
        args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
        scheduledTime: typeof effect_Schema0.Number;
        completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
          exact: true;
        }>;
        state: effect_Schema0.Union<[effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["pending"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["inProgress"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["success"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["failed"]>;
          error: typeof effect_Schema0.String;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["canceled"]>;
        }>]>;
      }>, convex_values5.VObject<{
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
        name: convex_values5.VString<string, "required">;
        args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
        scheduledTime: convex_values5.VFloat64<number, "required">;
        state: convex_values5.VObject<{
          kind: "pending";
        }, {
          kind: convex_values5.VLiteral<"pending", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "inProgress";
        }, {
          kind: convex_values5.VLiteral<"inProgress", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "success";
        }, {
          kind: convex_values5.VLiteral<"success", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "failed";
          error: string;
        }, {
          kind: convex_values5.VLiteral<"failed", "required">;
          error: convex_values5.VString<string, "required">;
        }, "required", "kind" | "error"> | convex_values5.VObject<{
          kind: "canceled";
        }, {
          kind: convex_values5.VLiteral<"canceled", "required">;
        }, "required", "kind">;
        completedTime: convex_values5.VFloat64<number | undefined, "optional">;
      }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
        sha256: typeof effect_Schema0.String;
        size: typeof effect_Schema0.Number;
        contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
          exact: true;
        }>;
      }>, convex_values5.VObject<{
        sha256: string;
        size: number;
        contentType?: string | undefined;
      }, {
        sha256: convex_values5.VString<string, "required">;
        size: convex_values5.VFloat64<number, "required">;
        contentType: convex_values5.VString<string | undefined, "optional">;
      }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>)["indexes"]>(indexName: IndexName, ...indexFieldValues: IndexFieldTypesForEq<DataModel.ToConvex<DataModel<IncludeSystemTables<DatabaseSchema.Tables<Schema$1>>>>, TableName, (TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
        name: typeof effect_Schema0.String;
        args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
        scheduledTime: typeof effect_Schema0.Number;
        completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
          exact: true;
        }>;
        state: effect_Schema0.Union<[effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["pending"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["inProgress"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["success"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["failed"]>;
          error: typeof effect_Schema0.String;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["canceled"]>;
        }>]>;
      }>, convex_values5.VObject<{
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
        name: convex_values5.VString<string, "required">;
        args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
        scheduledTime: convex_values5.VFloat64<number, "required">;
        state: convex_values5.VObject<{
          kind: "pending";
        }, {
          kind: convex_values5.VLiteral<"pending", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "inProgress";
        }, {
          kind: convex_values5.VLiteral<"inProgress", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "success";
        }, {
          kind: convex_values5.VLiteral<"success", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "failed";
          error: string;
        }, {
          kind: convex_values5.VLiteral<"failed", "required">;
          error: convex_values5.VString<string, "required">;
        }, "required", "kind" | "error"> | convex_values5.VObject<{
          kind: "canceled";
        }, {
          kind: convex_values5.VLiteral<"canceled", "required">;
        }, "required", "kind">;
        completedTime: convex_values5.VFloat64<number | undefined, "optional">;
      }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
        sha256: typeof effect_Schema0.String;
        size: typeof effect_Schema0.Number;
        contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
          exact: true;
        }>;
      }>, convex_values5.VObject<{
        sha256: string;
        size: number;
        contentType?: string | undefined;
      }, {
        sha256: convex_values5.VString<string, "required">;
        size: convex_values5.VFloat64<number, "required">;
        contentType: convex_values5.VString<string | undefined, "optional">;
      }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>)["indexes"][IndexName]>): effect_Effect0.Effect<(TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
        name: typeof effect_Schema0.String;
        args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
        scheduledTime: typeof effect_Schema0.Number;
        completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
          exact: true;
        }>;
        state: effect_Schema0.Union<[effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["pending"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["inProgress"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["success"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["failed"]>;
          error: typeof effect_Schema0.String;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["canceled"]>;
        }>]>;
      }>, convex_values5.VObject<{
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
        name: convex_values5.VString<string, "required">;
        args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
        scheduledTime: convex_values5.VFloat64<number, "required">;
        state: convex_values5.VObject<{
          kind: "pending";
        }, {
          kind: convex_values5.VLiteral<"pending", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "inProgress";
        }, {
          kind: convex_values5.VLiteral<"inProgress", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "success";
        }, {
          kind: convex_values5.VLiteral<"success", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "failed";
          error: string;
        }, {
          kind: convex_values5.VLiteral<"failed", "required">;
          error: convex_values5.VString<string, "required">;
        }, "required", "kind" | "error"> | convex_values5.VObject<{
          kind: "canceled";
        }, {
          kind: convex_values5.VLiteral<"canceled", "required">;
        }, "required", "kind">;
        completedTime: convex_values5.VFloat64<number | undefined, "optional">;
      }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
        sha256: typeof effect_Schema0.String;
        size: typeof effect_Schema0.Number;
        contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
          exact: true;
        }>;
      }>, convex_values5.VObject<{
        sha256: string;
        size: number;
        contentType?: string | undefined;
      }, {
        sha256: convex_values5.VString<string, "required">;
        size: convex_values5.VFloat64<number, "required">;
        contentType: convex_values5.VString<string | undefined, "optional">;
      }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>)["document"], DocumentDecodeError | GetByIndexFailure, never>;
    };
    readonly index: {
      <IndexName extends keyof (TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
        name: typeof effect_Schema0.String;
        args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
        scheduledTime: typeof effect_Schema0.Number;
        completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
          exact: true;
        }>;
        state: effect_Schema0.Union<[effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["pending"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["inProgress"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["success"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["failed"]>;
          error: typeof effect_Schema0.String;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["canceled"]>;
        }>]>;
      }>, convex_values5.VObject<{
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
        name: convex_values5.VString<string, "required">;
        args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
        scheduledTime: convex_values5.VFloat64<number, "required">;
        state: convex_values5.VObject<{
          kind: "pending";
        }, {
          kind: convex_values5.VLiteral<"pending", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "inProgress";
        }, {
          kind: convex_values5.VLiteral<"inProgress", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "success";
        }, {
          kind: convex_values5.VLiteral<"success", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "failed";
          error: string;
        }, {
          kind: convex_values5.VLiteral<"failed", "required">;
          error: convex_values5.VString<string, "required">;
        }, "required", "kind" | "error"> | convex_values5.VObject<{
          kind: "canceled";
        }, {
          kind: convex_values5.VLiteral<"canceled", "required">;
        }, "required", "kind">;
        completedTime: convex_values5.VFloat64<number | undefined, "optional">;
      }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
        sha256: typeof effect_Schema0.String;
        size: typeof effect_Schema0.Number;
        contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
          exact: true;
        }>;
      }>, convex_values5.VObject<{
        sha256: string;
        size: number;
        contentType?: string | undefined;
      }, {
        sha256: convex_values5.VString<string, "required">;
        size: convex_values5.VFloat64<number, "required">;
        contentType: convex_values5.VString<string | undefined, "optional">;
      }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>)["indexes"]>(indexName: IndexName, indexRange?: ((q: convex_server0.IndexRangeBuilder<(TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
        name: typeof effect_Schema0.String;
        args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
        scheduledTime: typeof effect_Schema0.Number;
        completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
          exact: true;
        }>;
        state: effect_Schema0.Union<[effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["pending"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["inProgress"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["success"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["failed"]>;
          error: typeof effect_Schema0.String;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["canceled"]>;
        }>]>;
      }>, convex_values5.VObject<{
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
        name: convex_values5.VString<string, "required">;
        args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
        scheduledTime: convex_values5.VFloat64<number, "required">;
        state: convex_values5.VObject<{
          kind: "pending";
        }, {
          kind: convex_values5.VLiteral<"pending", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "inProgress";
        }, {
          kind: convex_values5.VLiteral<"inProgress", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "success";
        }, {
          kind: convex_values5.VLiteral<"success", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "failed";
          error: string;
        }, {
          kind: convex_values5.VLiteral<"failed", "required">;
          error: convex_values5.VString<string, "required">;
        }, "required", "kind" | "error"> | convex_values5.VObject<{
          kind: "canceled";
        }, {
          kind: convex_values5.VLiteral<"canceled", "required">;
        }, "required", "kind">;
        completedTime: convex_values5.VFloat64<number | undefined, "optional">;
      }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
        sha256: typeof effect_Schema0.String;
        size: typeof effect_Schema0.Number;
        contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
          exact: true;
        }>;
      }>, convex_values5.VObject<{
        sha256: string;
        size: number;
        contentType?: string | undefined;
      }, {
        sha256: convex_values5.VString<string, "required">;
        size: convex_values5.VFloat64<number, "required">;
        contentType: convex_values5.VString<string | undefined, "optional">;
      }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>)["convexDocument"], convex_server0.NamedIndex<DataModel.TableInfoWithName<DataModel<IncludeSystemTables<DatabaseSchema.Tables<Schema$1>>>, TableName>, IndexName>, 0>) => convex_server0.IndexRange) | undefined, order?: "asc" | "desc"): OrderedQuery$1<TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
        name: typeof effect_Schema0.String;
        args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
        scheduledTime: typeof effect_Schema0.Number;
        completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
          exact: true;
        }>;
        state: effect_Schema0.Union<[effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["pending"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["inProgress"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["success"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["failed"]>;
          error: typeof effect_Schema0.String;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["canceled"]>;
        }>]>;
      }>, convex_values5.VObject<{
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
        name: convex_values5.VString<string, "required">;
        args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
        scheduledTime: convex_values5.VFloat64<number, "required">;
        state: convex_values5.VObject<{
          kind: "pending";
        }, {
          kind: convex_values5.VLiteral<"pending", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "inProgress";
        }, {
          kind: convex_values5.VLiteral<"inProgress", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "success";
        }, {
          kind: convex_values5.VLiteral<"success", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "failed";
          error: string;
        }, {
          kind: convex_values5.VLiteral<"failed", "required">;
          error: convex_values5.VString<string, "required">;
        }, "required", "kind" | "error"> | convex_values5.VObject<{
          kind: "canceled";
        }, {
          kind: convex_values5.VLiteral<"canceled", "required">;
        }, "required", "kind">;
        completedTime: convex_values5.VFloat64<number | undefined, "optional">;
      }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
        sha256: typeof effect_Schema0.String;
        size: typeof effect_Schema0.Number;
        contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
          exact: true;
        }>;
      }>, convex_values5.VObject<{
        sha256: string;
        size: number;
        contentType?: string | undefined;
      }, {
        sha256: convex_values5.VString<string, "required">;
        size: convex_values5.VFloat64<number, "required">;
        contentType: convex_values5.VString<string | undefined, "optional">;
      }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>, TableName>;
      <IndexName extends keyof (TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
        name: typeof effect_Schema0.String;
        args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
        scheduledTime: typeof effect_Schema0.Number;
        completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
          exact: true;
        }>;
        state: effect_Schema0.Union<[effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["pending"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["inProgress"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["success"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["failed"]>;
          error: typeof effect_Schema0.String;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["canceled"]>;
        }>]>;
      }>, convex_values5.VObject<{
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
        name: convex_values5.VString<string, "required">;
        args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
        scheduledTime: convex_values5.VFloat64<number, "required">;
        state: convex_values5.VObject<{
          kind: "pending";
        }, {
          kind: convex_values5.VLiteral<"pending", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "inProgress";
        }, {
          kind: convex_values5.VLiteral<"inProgress", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "success";
        }, {
          kind: convex_values5.VLiteral<"success", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "failed";
          error: string;
        }, {
          kind: convex_values5.VLiteral<"failed", "required">;
          error: convex_values5.VString<string, "required">;
        }, "required", "kind" | "error"> | convex_values5.VObject<{
          kind: "canceled";
        }, {
          kind: convex_values5.VLiteral<"canceled", "required">;
        }, "required", "kind">;
        completedTime: convex_values5.VFloat64<number | undefined, "optional">;
      }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
        sha256: typeof effect_Schema0.String;
        size: typeof effect_Schema0.Number;
        contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
          exact: true;
        }>;
      }>, convex_values5.VObject<{
        sha256: string;
        size: number;
        contentType?: string | undefined;
      }, {
        sha256: convex_values5.VString<string, "required">;
        size: convex_values5.VFloat64<number, "required">;
        contentType: convex_values5.VString<string | undefined, "optional">;
      }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>)["indexes"]>(indexName: IndexName, order?: "asc" | "desc"): OrderedQuery$1<TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
        name: typeof effect_Schema0.String;
        args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
        scheduledTime: typeof effect_Schema0.Number;
        completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
          exact: true;
        }>;
        state: effect_Schema0.Union<[effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["pending"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["inProgress"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["success"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["failed"]>;
          error: typeof effect_Schema0.String;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["canceled"]>;
        }>]>;
      }>, convex_values5.VObject<{
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
        name: convex_values5.VString<string, "required">;
        args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
        scheduledTime: convex_values5.VFloat64<number, "required">;
        state: convex_values5.VObject<{
          kind: "pending";
        }, {
          kind: convex_values5.VLiteral<"pending", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "inProgress";
        }, {
          kind: convex_values5.VLiteral<"inProgress", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "success";
        }, {
          kind: convex_values5.VLiteral<"success", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "failed";
          error: string;
        }, {
          kind: convex_values5.VLiteral<"failed", "required">;
          error: convex_values5.VString<string, "required">;
        }, "required", "kind" | "error"> | convex_values5.VObject<{
          kind: "canceled";
        }, {
          kind: convex_values5.VLiteral<"canceled", "required">;
        }, "required", "kind">;
        completedTime: convex_values5.VFloat64<number | undefined, "optional">;
      }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
        sha256: typeof effect_Schema0.String;
        size: typeof effect_Schema0.Number;
        contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
          exact: true;
        }>;
      }>, convex_values5.VObject<{
        sha256: string;
        size: number;
        contentType?: string | undefined;
      }, {
        sha256: convex_values5.VString<string, "required">;
        size: convex_values5.VFloat64<number, "required">;
        contentType: convex_values5.VString<string | undefined, "optional">;
      }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>, TableName>;
    };
    readonly search: <IndexName extends keyof (TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
      name: typeof effect_Schema0.String;
      args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
      scheduledTime: typeof effect_Schema0.Number;
      completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
        exact: true;
      }>;
      state: effect_Schema0.Union<[effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["pending"]>;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["inProgress"]>;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["success"]>;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["failed"]>;
        error: typeof effect_Schema0.String;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["canceled"]>;
      }>]>;
    }>, convex_values5.VObject<{
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
      name: convex_values5.VString<string, "required">;
      args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
      scheduledTime: convex_values5.VFloat64<number, "required">;
      state: convex_values5.VObject<{
        kind: "pending";
      }, {
        kind: convex_values5.VLiteral<"pending", "required">;
      }, "required", "kind"> | convex_values5.VObject<{
        kind: "inProgress";
      }, {
        kind: convex_values5.VLiteral<"inProgress", "required">;
      }, "required", "kind"> | convex_values5.VObject<{
        kind: "success";
      }, {
        kind: convex_values5.VLiteral<"success", "required">;
      }, "required", "kind"> | convex_values5.VObject<{
        kind: "failed";
        error: string;
      }, {
        kind: convex_values5.VLiteral<"failed", "required">;
        error: convex_values5.VString<string, "required">;
      }, "required", "kind" | "error"> | convex_values5.VObject<{
        kind: "canceled";
      }, {
        kind: convex_values5.VLiteral<"canceled", "required">;
      }, "required", "kind">;
      completedTime: convex_values5.VFloat64<number | undefined, "optional">;
    }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
      sha256: typeof effect_Schema0.String;
      size: typeof effect_Schema0.Number;
      contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
        exact: true;
      }>;
    }>, convex_values5.VObject<{
      sha256: string;
      size: number;
      contentType?: string | undefined;
    }, {
      sha256: convex_values5.VString<string, "required">;
      size: convex_values5.VFloat64<number, "required">;
      contentType: convex_values5.VString<string | undefined, "optional">;
    }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>)["searchIndexes"]>(indexName: IndexName, searchFilter: (q: convex_server0.SearchFilterBuilder<(TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
      name: typeof effect_Schema0.String;
      args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
      scheduledTime: typeof effect_Schema0.Number;
      completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
        exact: true;
      }>;
      state: effect_Schema0.Union<[effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["pending"]>;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["inProgress"]>;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["success"]>;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["failed"]>;
        error: typeof effect_Schema0.String;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["canceled"]>;
      }>]>;
    }>, convex_values5.VObject<{
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
      name: convex_values5.VString<string, "required">;
      args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
      scheduledTime: convex_values5.VFloat64<number, "required">;
      state: convex_values5.VObject<{
        kind: "pending";
      }, {
        kind: convex_values5.VLiteral<"pending", "required">;
      }, "required", "kind"> | convex_values5.VObject<{
        kind: "inProgress";
      }, {
        kind: convex_values5.VLiteral<"inProgress", "required">;
      }, "required", "kind"> | convex_values5.VObject<{
        kind: "success";
      }, {
        kind: convex_values5.VLiteral<"success", "required">;
      }, "required", "kind"> | convex_values5.VObject<{
        kind: "failed";
        error: string;
      }, {
        kind: convex_values5.VLiteral<"failed", "required">;
        error: convex_values5.VString<string, "required">;
      }, "required", "kind" | "error"> | convex_values5.VObject<{
        kind: "canceled";
      }, {
        kind: convex_values5.VLiteral<"canceled", "required">;
      }, "required", "kind">;
      completedTime: convex_values5.VFloat64<number | undefined, "optional">;
    }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
      sha256: typeof effect_Schema0.String;
      size: typeof effect_Schema0.Number;
      contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
        exact: true;
      }>;
    }>, convex_values5.VObject<{
      sha256: string;
      size: number;
      contentType?: string | undefined;
    }, {
      sha256: convex_values5.VString<string, "required">;
      size: convex_values5.VFloat64<number, "required">;
      contentType: convex_values5.VString<string | undefined, "optional">;
    }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>)["convexDocument"], convex_server0.NamedSearchIndex<DataModel.TableInfoWithName<DataModel<IncludeSystemTables<DatabaseSchema.Tables<Schema$1>>>, TableName>, IndexName>>) => convex_server0.SearchFilter) => OrderedQuery$1<TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
      name: typeof effect_Schema0.String;
      args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
      scheduledTime: typeof effect_Schema0.Number;
      completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
        exact: true;
      }>;
      state: effect_Schema0.Union<[effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["pending"]>;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["inProgress"]>;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["success"]>;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["failed"]>;
        error: typeof effect_Schema0.String;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["canceled"]>;
      }>]>;
    }>, convex_values5.VObject<{
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
      name: convex_values5.VString<string, "required">;
      args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
      scheduledTime: convex_values5.VFloat64<number, "required">;
      state: convex_values5.VObject<{
        kind: "pending";
      }, {
        kind: convex_values5.VLiteral<"pending", "required">;
      }, "required", "kind"> | convex_values5.VObject<{
        kind: "inProgress";
      }, {
        kind: convex_values5.VLiteral<"inProgress", "required">;
      }, "required", "kind"> | convex_values5.VObject<{
        kind: "success";
      }, {
        kind: convex_values5.VLiteral<"success", "required">;
      }, "required", "kind"> | convex_values5.VObject<{
        kind: "failed";
        error: string;
      }, {
        kind: convex_values5.VLiteral<"failed", "required">;
        error: convex_values5.VString<string, "required">;
      }, "required", "kind" | "error"> | convex_values5.VObject<{
        kind: "canceled";
      }, {
        kind: convex_values5.VLiteral<"canceled", "required">;
      }, "required", "kind">;
      completedTime: convex_values5.VFloat64<number | undefined, "optional">;
    }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
      sha256: typeof effect_Schema0.String;
      size: typeof effect_Schema0.Number;
      contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
        exact: true;
      }>;
    }>, convex_values5.VObject<{
      sha256: string;
      size: number;
      contentType?: string | undefined;
    }, {
      sha256: convex_values5.VString<string, "required">;
      size: convex_values5.VFloat64<number, "required">;
      contentType: convex_values5.VString<string | undefined, "optional">;
    }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>, TableName>;
  };
};
declare const DatabaseReader: <Schema$1 extends DatabaseSchema.AnyWithProps>() => Context.Tag<{
  table: <const TableName extends "_scheduled_functions" | "_storage" | Table.Name<DatabaseSchema.Tables<Schema$1>>>(tableName: TableName) => {
    readonly get: {
      (id: convex_values5.GenericId<TableName>): effect_Effect0.Effect<(TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
        name: typeof effect_Schema0.String;
        args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
        scheduledTime: typeof effect_Schema0.Number;
        completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
          exact: true;
        }>;
        state: effect_Schema0.Union<[effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["pending"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["inProgress"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["success"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["failed"]>;
          error: typeof effect_Schema0.String;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["canceled"]>;
        }>]>;
      }>, convex_values5.VObject<{
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
        name: convex_values5.VString<string, "required">;
        args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
        scheduledTime: convex_values5.VFloat64<number, "required">;
        state: convex_values5.VObject<{
          kind: "pending";
        }, {
          kind: convex_values5.VLiteral<"pending", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "inProgress";
        }, {
          kind: convex_values5.VLiteral<"inProgress", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "success";
        }, {
          kind: convex_values5.VLiteral<"success", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "failed";
          error: string;
        }, {
          kind: convex_values5.VLiteral<"failed", "required">;
          error: convex_values5.VString<string, "required">;
        }, "required", "kind" | "error"> | convex_values5.VObject<{
          kind: "canceled";
        }, {
          kind: convex_values5.VLiteral<"canceled", "required">;
        }, "required", "kind">;
        completedTime: convex_values5.VFloat64<number | undefined, "optional">;
      }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
        sha256: typeof effect_Schema0.String;
        size: typeof effect_Schema0.Number;
        contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
          exact: true;
        }>;
      }>, convex_values5.VObject<{
        sha256: string;
        size: number;
        contentType?: string | undefined;
      }, {
        sha256: convex_values5.VString<string, "required">;
        size: convex_values5.VFloat64<number, "required">;
        contentType: convex_values5.VString<string | undefined, "optional">;
      }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>)["document"], DocumentDecodeError | GetByIdFailure, never>;
      <IndexName extends keyof (TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
        name: typeof effect_Schema0.String;
        args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
        scheduledTime: typeof effect_Schema0.Number;
        completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
          exact: true;
        }>;
        state: effect_Schema0.Union<[effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["pending"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["inProgress"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["success"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["failed"]>;
          error: typeof effect_Schema0.String;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["canceled"]>;
        }>]>;
      }>, convex_values5.VObject<{
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
        name: convex_values5.VString<string, "required">;
        args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
        scheduledTime: convex_values5.VFloat64<number, "required">;
        state: convex_values5.VObject<{
          kind: "pending";
        }, {
          kind: convex_values5.VLiteral<"pending", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "inProgress";
        }, {
          kind: convex_values5.VLiteral<"inProgress", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "success";
        }, {
          kind: convex_values5.VLiteral<"success", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "failed";
          error: string;
        }, {
          kind: convex_values5.VLiteral<"failed", "required">;
          error: convex_values5.VString<string, "required">;
        }, "required", "kind" | "error"> | convex_values5.VObject<{
          kind: "canceled";
        }, {
          kind: convex_values5.VLiteral<"canceled", "required">;
        }, "required", "kind">;
        completedTime: convex_values5.VFloat64<number | undefined, "optional">;
      }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
        sha256: typeof effect_Schema0.String;
        size: typeof effect_Schema0.Number;
        contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
          exact: true;
        }>;
      }>, convex_values5.VObject<{
        sha256: string;
        size: number;
        contentType?: string | undefined;
      }, {
        sha256: convex_values5.VString<string, "required">;
        size: convex_values5.VFloat64<number, "required">;
        contentType: convex_values5.VString<string | undefined, "optional">;
      }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>)["indexes"]>(indexName: IndexName, ...indexFieldValues: IndexFieldTypesForEq<DataModel.ToConvex<DataModel<IncludeSystemTables<DatabaseSchema.Tables<Schema$1>>>>, TableName, (TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
        name: typeof effect_Schema0.String;
        args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
        scheduledTime: typeof effect_Schema0.Number;
        completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
          exact: true;
        }>;
        state: effect_Schema0.Union<[effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["pending"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["inProgress"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["success"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["failed"]>;
          error: typeof effect_Schema0.String;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["canceled"]>;
        }>]>;
      }>, convex_values5.VObject<{
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
        name: convex_values5.VString<string, "required">;
        args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
        scheduledTime: convex_values5.VFloat64<number, "required">;
        state: convex_values5.VObject<{
          kind: "pending";
        }, {
          kind: convex_values5.VLiteral<"pending", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "inProgress";
        }, {
          kind: convex_values5.VLiteral<"inProgress", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "success";
        }, {
          kind: convex_values5.VLiteral<"success", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "failed";
          error: string;
        }, {
          kind: convex_values5.VLiteral<"failed", "required">;
          error: convex_values5.VString<string, "required">;
        }, "required", "kind" | "error"> | convex_values5.VObject<{
          kind: "canceled";
        }, {
          kind: convex_values5.VLiteral<"canceled", "required">;
        }, "required", "kind">;
        completedTime: convex_values5.VFloat64<number | undefined, "optional">;
      }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
        sha256: typeof effect_Schema0.String;
        size: typeof effect_Schema0.Number;
        contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
          exact: true;
        }>;
      }>, convex_values5.VObject<{
        sha256: string;
        size: number;
        contentType?: string | undefined;
      }, {
        sha256: convex_values5.VString<string, "required">;
        size: convex_values5.VFloat64<number, "required">;
        contentType: convex_values5.VString<string | undefined, "optional">;
      }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>)["indexes"][IndexName]>): effect_Effect0.Effect<(TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
        name: typeof effect_Schema0.String;
        args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
        scheduledTime: typeof effect_Schema0.Number;
        completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
          exact: true;
        }>;
        state: effect_Schema0.Union<[effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["pending"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["inProgress"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["success"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["failed"]>;
          error: typeof effect_Schema0.String;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["canceled"]>;
        }>]>;
      }>, convex_values5.VObject<{
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
        name: convex_values5.VString<string, "required">;
        args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
        scheduledTime: convex_values5.VFloat64<number, "required">;
        state: convex_values5.VObject<{
          kind: "pending";
        }, {
          kind: convex_values5.VLiteral<"pending", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "inProgress";
        }, {
          kind: convex_values5.VLiteral<"inProgress", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "success";
        }, {
          kind: convex_values5.VLiteral<"success", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "failed";
          error: string;
        }, {
          kind: convex_values5.VLiteral<"failed", "required">;
          error: convex_values5.VString<string, "required">;
        }, "required", "kind" | "error"> | convex_values5.VObject<{
          kind: "canceled";
        }, {
          kind: convex_values5.VLiteral<"canceled", "required">;
        }, "required", "kind">;
        completedTime: convex_values5.VFloat64<number | undefined, "optional">;
      }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
        sha256: typeof effect_Schema0.String;
        size: typeof effect_Schema0.Number;
        contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
          exact: true;
        }>;
      }>, convex_values5.VObject<{
        sha256: string;
        size: number;
        contentType?: string | undefined;
      }, {
        sha256: convex_values5.VString<string, "required">;
        size: convex_values5.VFloat64<number, "required">;
        contentType: convex_values5.VString<string | undefined, "optional">;
      }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>)["document"], DocumentDecodeError | GetByIndexFailure, never>;
    };
    readonly index: {
      <IndexName extends keyof (TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
        name: typeof effect_Schema0.String;
        args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
        scheduledTime: typeof effect_Schema0.Number;
        completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
          exact: true;
        }>;
        state: effect_Schema0.Union<[effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["pending"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["inProgress"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["success"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["failed"]>;
          error: typeof effect_Schema0.String;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["canceled"]>;
        }>]>;
      }>, convex_values5.VObject<{
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
        name: convex_values5.VString<string, "required">;
        args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
        scheduledTime: convex_values5.VFloat64<number, "required">;
        state: convex_values5.VObject<{
          kind: "pending";
        }, {
          kind: convex_values5.VLiteral<"pending", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "inProgress";
        }, {
          kind: convex_values5.VLiteral<"inProgress", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "success";
        }, {
          kind: convex_values5.VLiteral<"success", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "failed";
          error: string;
        }, {
          kind: convex_values5.VLiteral<"failed", "required">;
          error: convex_values5.VString<string, "required">;
        }, "required", "kind" | "error"> | convex_values5.VObject<{
          kind: "canceled";
        }, {
          kind: convex_values5.VLiteral<"canceled", "required">;
        }, "required", "kind">;
        completedTime: convex_values5.VFloat64<number | undefined, "optional">;
      }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
        sha256: typeof effect_Schema0.String;
        size: typeof effect_Schema0.Number;
        contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
          exact: true;
        }>;
      }>, convex_values5.VObject<{
        sha256: string;
        size: number;
        contentType?: string | undefined;
      }, {
        sha256: convex_values5.VString<string, "required">;
        size: convex_values5.VFloat64<number, "required">;
        contentType: convex_values5.VString<string | undefined, "optional">;
      }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>)["indexes"]>(indexName: IndexName, indexRange?: ((q: convex_server0.IndexRangeBuilder<(TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
        name: typeof effect_Schema0.String;
        args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
        scheduledTime: typeof effect_Schema0.Number;
        completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
          exact: true;
        }>;
        state: effect_Schema0.Union<[effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["pending"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["inProgress"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["success"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["failed"]>;
          error: typeof effect_Schema0.String;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["canceled"]>;
        }>]>;
      }>, convex_values5.VObject<{
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
        name: convex_values5.VString<string, "required">;
        args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
        scheduledTime: convex_values5.VFloat64<number, "required">;
        state: convex_values5.VObject<{
          kind: "pending";
        }, {
          kind: convex_values5.VLiteral<"pending", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "inProgress";
        }, {
          kind: convex_values5.VLiteral<"inProgress", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "success";
        }, {
          kind: convex_values5.VLiteral<"success", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "failed";
          error: string;
        }, {
          kind: convex_values5.VLiteral<"failed", "required">;
          error: convex_values5.VString<string, "required">;
        }, "required", "kind" | "error"> | convex_values5.VObject<{
          kind: "canceled";
        }, {
          kind: convex_values5.VLiteral<"canceled", "required">;
        }, "required", "kind">;
        completedTime: convex_values5.VFloat64<number | undefined, "optional">;
      }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
        sha256: typeof effect_Schema0.String;
        size: typeof effect_Schema0.Number;
        contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
          exact: true;
        }>;
      }>, convex_values5.VObject<{
        sha256: string;
        size: number;
        contentType?: string | undefined;
      }, {
        sha256: convex_values5.VString<string, "required">;
        size: convex_values5.VFloat64<number, "required">;
        contentType: convex_values5.VString<string | undefined, "optional">;
      }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>)["convexDocument"], convex_server0.NamedIndex<DataModel.TableInfoWithName<DataModel<IncludeSystemTables<DatabaseSchema.Tables<Schema$1>>>, TableName>, IndexName>, 0>) => convex_server0.IndexRange) | undefined, order?: "asc" | "desc"): OrderedQuery$1<TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
        name: typeof effect_Schema0.String;
        args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
        scheduledTime: typeof effect_Schema0.Number;
        completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
          exact: true;
        }>;
        state: effect_Schema0.Union<[effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["pending"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["inProgress"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["success"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["failed"]>;
          error: typeof effect_Schema0.String;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["canceled"]>;
        }>]>;
      }>, convex_values5.VObject<{
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
        name: convex_values5.VString<string, "required">;
        args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
        scheduledTime: convex_values5.VFloat64<number, "required">;
        state: convex_values5.VObject<{
          kind: "pending";
        }, {
          kind: convex_values5.VLiteral<"pending", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "inProgress";
        }, {
          kind: convex_values5.VLiteral<"inProgress", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "success";
        }, {
          kind: convex_values5.VLiteral<"success", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "failed";
          error: string;
        }, {
          kind: convex_values5.VLiteral<"failed", "required">;
          error: convex_values5.VString<string, "required">;
        }, "required", "kind" | "error"> | convex_values5.VObject<{
          kind: "canceled";
        }, {
          kind: convex_values5.VLiteral<"canceled", "required">;
        }, "required", "kind">;
        completedTime: convex_values5.VFloat64<number | undefined, "optional">;
      }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
        sha256: typeof effect_Schema0.String;
        size: typeof effect_Schema0.Number;
        contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
          exact: true;
        }>;
      }>, convex_values5.VObject<{
        sha256: string;
        size: number;
        contentType?: string | undefined;
      }, {
        sha256: convex_values5.VString<string, "required">;
        size: convex_values5.VFloat64<number, "required">;
        contentType: convex_values5.VString<string | undefined, "optional">;
      }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>, TableName>;
      <IndexName extends keyof (TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
        name: typeof effect_Schema0.String;
        args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
        scheduledTime: typeof effect_Schema0.Number;
        completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
          exact: true;
        }>;
        state: effect_Schema0.Union<[effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["pending"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["inProgress"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["success"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["failed"]>;
          error: typeof effect_Schema0.String;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["canceled"]>;
        }>]>;
      }>, convex_values5.VObject<{
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
        name: convex_values5.VString<string, "required">;
        args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
        scheduledTime: convex_values5.VFloat64<number, "required">;
        state: convex_values5.VObject<{
          kind: "pending";
        }, {
          kind: convex_values5.VLiteral<"pending", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "inProgress";
        }, {
          kind: convex_values5.VLiteral<"inProgress", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "success";
        }, {
          kind: convex_values5.VLiteral<"success", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "failed";
          error: string;
        }, {
          kind: convex_values5.VLiteral<"failed", "required">;
          error: convex_values5.VString<string, "required">;
        }, "required", "kind" | "error"> | convex_values5.VObject<{
          kind: "canceled";
        }, {
          kind: convex_values5.VLiteral<"canceled", "required">;
        }, "required", "kind">;
        completedTime: convex_values5.VFloat64<number | undefined, "optional">;
      }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
        sha256: typeof effect_Schema0.String;
        size: typeof effect_Schema0.Number;
        contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
          exact: true;
        }>;
      }>, convex_values5.VObject<{
        sha256: string;
        size: number;
        contentType?: string | undefined;
      }, {
        sha256: convex_values5.VString<string, "required">;
        size: convex_values5.VFloat64<number, "required">;
        contentType: convex_values5.VString<string | undefined, "optional">;
      }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>)["indexes"]>(indexName: IndexName, order?: "asc" | "desc"): OrderedQuery$1<TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
        name: typeof effect_Schema0.String;
        args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
        scheduledTime: typeof effect_Schema0.Number;
        completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
          exact: true;
        }>;
        state: effect_Schema0.Union<[effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["pending"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["inProgress"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["success"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["failed"]>;
          error: typeof effect_Schema0.String;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["canceled"]>;
        }>]>;
      }>, convex_values5.VObject<{
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
        name: convex_values5.VString<string, "required">;
        args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
        scheduledTime: convex_values5.VFloat64<number, "required">;
        state: convex_values5.VObject<{
          kind: "pending";
        }, {
          kind: convex_values5.VLiteral<"pending", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "inProgress";
        }, {
          kind: convex_values5.VLiteral<"inProgress", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "success";
        }, {
          kind: convex_values5.VLiteral<"success", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "failed";
          error: string;
        }, {
          kind: convex_values5.VLiteral<"failed", "required">;
          error: convex_values5.VString<string, "required">;
        }, "required", "kind" | "error"> | convex_values5.VObject<{
          kind: "canceled";
        }, {
          kind: convex_values5.VLiteral<"canceled", "required">;
        }, "required", "kind">;
        completedTime: convex_values5.VFloat64<number | undefined, "optional">;
      }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
        sha256: typeof effect_Schema0.String;
        size: typeof effect_Schema0.Number;
        contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
          exact: true;
        }>;
      }>, convex_values5.VObject<{
        sha256: string;
        size: number;
        contentType?: string | undefined;
      }, {
        sha256: convex_values5.VString<string, "required">;
        size: convex_values5.VFloat64<number, "required">;
        contentType: convex_values5.VString<string | undefined, "optional">;
      }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>, TableName>;
    };
    readonly search: <IndexName extends keyof (TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
      name: typeof effect_Schema0.String;
      args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
      scheduledTime: typeof effect_Schema0.Number;
      completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
        exact: true;
      }>;
      state: effect_Schema0.Union<[effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["pending"]>;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["inProgress"]>;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["success"]>;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["failed"]>;
        error: typeof effect_Schema0.String;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["canceled"]>;
      }>]>;
    }>, convex_values5.VObject<{
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
      name: convex_values5.VString<string, "required">;
      args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
      scheduledTime: convex_values5.VFloat64<number, "required">;
      state: convex_values5.VObject<{
        kind: "pending";
      }, {
        kind: convex_values5.VLiteral<"pending", "required">;
      }, "required", "kind"> | convex_values5.VObject<{
        kind: "inProgress";
      }, {
        kind: convex_values5.VLiteral<"inProgress", "required">;
      }, "required", "kind"> | convex_values5.VObject<{
        kind: "success";
      }, {
        kind: convex_values5.VLiteral<"success", "required">;
      }, "required", "kind"> | convex_values5.VObject<{
        kind: "failed";
        error: string;
      }, {
        kind: convex_values5.VLiteral<"failed", "required">;
        error: convex_values5.VString<string, "required">;
      }, "required", "kind" | "error"> | convex_values5.VObject<{
        kind: "canceled";
      }, {
        kind: convex_values5.VLiteral<"canceled", "required">;
      }, "required", "kind">;
      completedTime: convex_values5.VFloat64<number | undefined, "optional">;
    }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
      sha256: typeof effect_Schema0.String;
      size: typeof effect_Schema0.Number;
      contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
        exact: true;
      }>;
    }>, convex_values5.VObject<{
      sha256: string;
      size: number;
      contentType?: string | undefined;
    }, {
      sha256: convex_values5.VString<string, "required">;
      size: convex_values5.VFloat64<number, "required">;
      contentType: convex_values5.VString<string | undefined, "optional">;
    }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>)["searchIndexes"]>(indexName: IndexName, searchFilter: (q: convex_server0.SearchFilterBuilder<(TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
      name: typeof effect_Schema0.String;
      args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
      scheduledTime: typeof effect_Schema0.Number;
      completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
        exact: true;
      }>;
      state: effect_Schema0.Union<[effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["pending"]>;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["inProgress"]>;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["success"]>;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["failed"]>;
        error: typeof effect_Schema0.String;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["canceled"]>;
      }>]>;
    }>, convex_values5.VObject<{
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
      name: convex_values5.VString<string, "required">;
      args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
      scheduledTime: convex_values5.VFloat64<number, "required">;
      state: convex_values5.VObject<{
        kind: "pending";
      }, {
        kind: convex_values5.VLiteral<"pending", "required">;
      }, "required", "kind"> | convex_values5.VObject<{
        kind: "inProgress";
      }, {
        kind: convex_values5.VLiteral<"inProgress", "required">;
      }, "required", "kind"> | convex_values5.VObject<{
        kind: "success";
      }, {
        kind: convex_values5.VLiteral<"success", "required">;
      }, "required", "kind"> | convex_values5.VObject<{
        kind: "failed";
        error: string;
      }, {
        kind: convex_values5.VLiteral<"failed", "required">;
        error: convex_values5.VString<string, "required">;
      }, "required", "kind" | "error"> | convex_values5.VObject<{
        kind: "canceled";
      }, {
        kind: convex_values5.VLiteral<"canceled", "required">;
      }, "required", "kind">;
      completedTime: convex_values5.VFloat64<number | undefined, "optional">;
    }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
      sha256: typeof effect_Schema0.String;
      size: typeof effect_Schema0.Number;
      contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
        exact: true;
      }>;
    }>, convex_values5.VObject<{
      sha256: string;
      size: number;
      contentType?: string | undefined;
    }, {
      sha256: convex_values5.VString<string, "required">;
      size: convex_values5.VFloat64<number, "required">;
      contentType: convex_values5.VString<string | undefined, "optional">;
    }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>)["convexDocument"], convex_server0.NamedSearchIndex<DataModel.TableInfoWithName<DataModel<IncludeSystemTables<DatabaseSchema.Tables<Schema$1>>>, TableName>, IndexName>>) => convex_server0.SearchFilter) => OrderedQuery$1<TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
      name: typeof effect_Schema0.String;
      args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
      scheduledTime: typeof effect_Schema0.Number;
      completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
        exact: true;
      }>;
      state: effect_Schema0.Union<[effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["pending"]>;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["inProgress"]>;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["success"]>;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["failed"]>;
        error: typeof effect_Schema0.String;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["canceled"]>;
      }>]>;
    }>, convex_values5.VObject<{
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
      name: convex_values5.VString<string, "required">;
      args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
      scheduledTime: convex_values5.VFloat64<number, "required">;
      state: convex_values5.VObject<{
        kind: "pending";
      }, {
        kind: convex_values5.VLiteral<"pending", "required">;
      }, "required", "kind"> | convex_values5.VObject<{
        kind: "inProgress";
      }, {
        kind: convex_values5.VLiteral<"inProgress", "required">;
      }, "required", "kind"> | convex_values5.VObject<{
        kind: "success";
      }, {
        kind: convex_values5.VLiteral<"success", "required">;
      }, "required", "kind"> | convex_values5.VObject<{
        kind: "failed";
        error: string;
      }, {
        kind: convex_values5.VLiteral<"failed", "required">;
        error: convex_values5.VString<string, "required">;
      }, "required", "kind" | "error"> | convex_values5.VObject<{
        kind: "canceled";
      }, {
        kind: convex_values5.VLiteral<"canceled", "required">;
      }, "required", "kind">;
      completedTime: convex_values5.VFloat64<number | undefined, "optional">;
    }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
      sha256: typeof effect_Schema0.String;
      size: typeof effect_Schema0.Number;
      contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
        exact: true;
      }>;
    }>, convex_values5.VObject<{
      sha256: string;
      size: number;
      contentType?: string | undefined;
    }, {
      sha256: convex_values5.VString<string, "required">;
      size: convex_values5.VFloat64<number, "required">;
      contentType: convex_values5.VString<string | undefined, "optional">;
    }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>, TableName>;
  };
}, {
  table: <const TableName extends "_scheduled_functions" | "_storage" | Table.Name<DatabaseSchema.Tables<Schema$1>>>(tableName: TableName) => {
    readonly get: {
      (id: convex_values5.GenericId<TableName>): effect_Effect0.Effect<(TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
        name: typeof effect_Schema0.String;
        args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
        scheduledTime: typeof effect_Schema0.Number;
        completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
          exact: true;
        }>;
        state: effect_Schema0.Union<[effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["pending"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["inProgress"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["success"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["failed"]>;
          error: typeof effect_Schema0.String;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["canceled"]>;
        }>]>;
      }>, convex_values5.VObject<{
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
        name: convex_values5.VString<string, "required">;
        args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
        scheduledTime: convex_values5.VFloat64<number, "required">;
        state: convex_values5.VObject<{
          kind: "pending";
        }, {
          kind: convex_values5.VLiteral<"pending", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "inProgress";
        }, {
          kind: convex_values5.VLiteral<"inProgress", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "success";
        }, {
          kind: convex_values5.VLiteral<"success", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "failed";
          error: string;
        }, {
          kind: convex_values5.VLiteral<"failed", "required">;
          error: convex_values5.VString<string, "required">;
        }, "required", "kind" | "error"> | convex_values5.VObject<{
          kind: "canceled";
        }, {
          kind: convex_values5.VLiteral<"canceled", "required">;
        }, "required", "kind">;
        completedTime: convex_values5.VFloat64<number | undefined, "optional">;
      }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
        sha256: typeof effect_Schema0.String;
        size: typeof effect_Schema0.Number;
        contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
          exact: true;
        }>;
      }>, convex_values5.VObject<{
        sha256: string;
        size: number;
        contentType?: string | undefined;
      }, {
        sha256: convex_values5.VString<string, "required">;
        size: convex_values5.VFloat64<number, "required">;
        contentType: convex_values5.VString<string | undefined, "optional">;
      }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>)["document"], DocumentDecodeError | GetByIdFailure, never>;
      <IndexName extends keyof (TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
        name: typeof effect_Schema0.String;
        args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
        scheduledTime: typeof effect_Schema0.Number;
        completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
          exact: true;
        }>;
        state: effect_Schema0.Union<[effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["pending"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["inProgress"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["success"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["failed"]>;
          error: typeof effect_Schema0.String;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["canceled"]>;
        }>]>;
      }>, convex_values5.VObject<{
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
        name: convex_values5.VString<string, "required">;
        args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
        scheduledTime: convex_values5.VFloat64<number, "required">;
        state: convex_values5.VObject<{
          kind: "pending";
        }, {
          kind: convex_values5.VLiteral<"pending", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "inProgress";
        }, {
          kind: convex_values5.VLiteral<"inProgress", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "success";
        }, {
          kind: convex_values5.VLiteral<"success", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "failed";
          error: string;
        }, {
          kind: convex_values5.VLiteral<"failed", "required">;
          error: convex_values5.VString<string, "required">;
        }, "required", "kind" | "error"> | convex_values5.VObject<{
          kind: "canceled";
        }, {
          kind: convex_values5.VLiteral<"canceled", "required">;
        }, "required", "kind">;
        completedTime: convex_values5.VFloat64<number | undefined, "optional">;
      }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
        sha256: typeof effect_Schema0.String;
        size: typeof effect_Schema0.Number;
        contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
          exact: true;
        }>;
      }>, convex_values5.VObject<{
        sha256: string;
        size: number;
        contentType?: string | undefined;
      }, {
        sha256: convex_values5.VString<string, "required">;
        size: convex_values5.VFloat64<number, "required">;
        contentType: convex_values5.VString<string | undefined, "optional">;
      }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>)["indexes"]>(indexName: IndexName, ...indexFieldValues: IndexFieldTypesForEq<DataModel.ToConvex<DataModel<IncludeSystemTables<DatabaseSchema.Tables<Schema$1>>>>, TableName, (TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
        name: typeof effect_Schema0.String;
        args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
        scheduledTime: typeof effect_Schema0.Number;
        completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
          exact: true;
        }>;
        state: effect_Schema0.Union<[effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["pending"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["inProgress"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["success"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["failed"]>;
          error: typeof effect_Schema0.String;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["canceled"]>;
        }>]>;
      }>, convex_values5.VObject<{
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
        name: convex_values5.VString<string, "required">;
        args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
        scheduledTime: convex_values5.VFloat64<number, "required">;
        state: convex_values5.VObject<{
          kind: "pending";
        }, {
          kind: convex_values5.VLiteral<"pending", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "inProgress";
        }, {
          kind: convex_values5.VLiteral<"inProgress", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "success";
        }, {
          kind: convex_values5.VLiteral<"success", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "failed";
          error: string;
        }, {
          kind: convex_values5.VLiteral<"failed", "required">;
          error: convex_values5.VString<string, "required">;
        }, "required", "kind" | "error"> | convex_values5.VObject<{
          kind: "canceled";
        }, {
          kind: convex_values5.VLiteral<"canceled", "required">;
        }, "required", "kind">;
        completedTime: convex_values5.VFloat64<number | undefined, "optional">;
      }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
        sha256: typeof effect_Schema0.String;
        size: typeof effect_Schema0.Number;
        contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
          exact: true;
        }>;
      }>, convex_values5.VObject<{
        sha256: string;
        size: number;
        contentType?: string | undefined;
      }, {
        sha256: convex_values5.VString<string, "required">;
        size: convex_values5.VFloat64<number, "required">;
        contentType: convex_values5.VString<string | undefined, "optional">;
      }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>)["indexes"][IndexName]>): effect_Effect0.Effect<(TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
        name: typeof effect_Schema0.String;
        args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
        scheduledTime: typeof effect_Schema0.Number;
        completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
          exact: true;
        }>;
        state: effect_Schema0.Union<[effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["pending"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["inProgress"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["success"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["failed"]>;
          error: typeof effect_Schema0.String;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["canceled"]>;
        }>]>;
      }>, convex_values5.VObject<{
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
        name: convex_values5.VString<string, "required">;
        args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
        scheduledTime: convex_values5.VFloat64<number, "required">;
        state: convex_values5.VObject<{
          kind: "pending";
        }, {
          kind: convex_values5.VLiteral<"pending", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "inProgress";
        }, {
          kind: convex_values5.VLiteral<"inProgress", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "success";
        }, {
          kind: convex_values5.VLiteral<"success", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "failed";
          error: string;
        }, {
          kind: convex_values5.VLiteral<"failed", "required">;
          error: convex_values5.VString<string, "required">;
        }, "required", "kind" | "error"> | convex_values5.VObject<{
          kind: "canceled";
        }, {
          kind: convex_values5.VLiteral<"canceled", "required">;
        }, "required", "kind">;
        completedTime: convex_values5.VFloat64<number | undefined, "optional">;
      }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
        sha256: typeof effect_Schema0.String;
        size: typeof effect_Schema0.Number;
        contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
          exact: true;
        }>;
      }>, convex_values5.VObject<{
        sha256: string;
        size: number;
        contentType?: string | undefined;
      }, {
        sha256: convex_values5.VString<string, "required">;
        size: convex_values5.VFloat64<number, "required">;
        contentType: convex_values5.VString<string | undefined, "optional">;
      }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>)["document"], DocumentDecodeError | GetByIndexFailure, never>;
    };
    readonly index: {
      <IndexName extends keyof (TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
        name: typeof effect_Schema0.String;
        args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
        scheduledTime: typeof effect_Schema0.Number;
        completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
          exact: true;
        }>;
        state: effect_Schema0.Union<[effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["pending"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["inProgress"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["success"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["failed"]>;
          error: typeof effect_Schema0.String;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["canceled"]>;
        }>]>;
      }>, convex_values5.VObject<{
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
        name: convex_values5.VString<string, "required">;
        args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
        scheduledTime: convex_values5.VFloat64<number, "required">;
        state: convex_values5.VObject<{
          kind: "pending";
        }, {
          kind: convex_values5.VLiteral<"pending", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "inProgress";
        }, {
          kind: convex_values5.VLiteral<"inProgress", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "success";
        }, {
          kind: convex_values5.VLiteral<"success", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "failed";
          error: string;
        }, {
          kind: convex_values5.VLiteral<"failed", "required">;
          error: convex_values5.VString<string, "required">;
        }, "required", "kind" | "error"> | convex_values5.VObject<{
          kind: "canceled";
        }, {
          kind: convex_values5.VLiteral<"canceled", "required">;
        }, "required", "kind">;
        completedTime: convex_values5.VFloat64<number | undefined, "optional">;
      }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
        sha256: typeof effect_Schema0.String;
        size: typeof effect_Schema0.Number;
        contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
          exact: true;
        }>;
      }>, convex_values5.VObject<{
        sha256: string;
        size: number;
        contentType?: string | undefined;
      }, {
        sha256: convex_values5.VString<string, "required">;
        size: convex_values5.VFloat64<number, "required">;
        contentType: convex_values5.VString<string | undefined, "optional">;
      }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>)["indexes"]>(indexName: IndexName, indexRange?: ((q: convex_server0.IndexRangeBuilder<(TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
        name: typeof effect_Schema0.String;
        args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
        scheduledTime: typeof effect_Schema0.Number;
        completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
          exact: true;
        }>;
        state: effect_Schema0.Union<[effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["pending"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["inProgress"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["success"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["failed"]>;
          error: typeof effect_Schema0.String;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["canceled"]>;
        }>]>;
      }>, convex_values5.VObject<{
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
        name: convex_values5.VString<string, "required">;
        args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
        scheduledTime: convex_values5.VFloat64<number, "required">;
        state: convex_values5.VObject<{
          kind: "pending";
        }, {
          kind: convex_values5.VLiteral<"pending", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "inProgress";
        }, {
          kind: convex_values5.VLiteral<"inProgress", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "success";
        }, {
          kind: convex_values5.VLiteral<"success", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "failed";
          error: string;
        }, {
          kind: convex_values5.VLiteral<"failed", "required">;
          error: convex_values5.VString<string, "required">;
        }, "required", "kind" | "error"> | convex_values5.VObject<{
          kind: "canceled";
        }, {
          kind: convex_values5.VLiteral<"canceled", "required">;
        }, "required", "kind">;
        completedTime: convex_values5.VFloat64<number | undefined, "optional">;
      }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
        sha256: typeof effect_Schema0.String;
        size: typeof effect_Schema0.Number;
        contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
          exact: true;
        }>;
      }>, convex_values5.VObject<{
        sha256: string;
        size: number;
        contentType?: string | undefined;
      }, {
        sha256: convex_values5.VString<string, "required">;
        size: convex_values5.VFloat64<number, "required">;
        contentType: convex_values5.VString<string | undefined, "optional">;
      }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>)["convexDocument"], convex_server0.NamedIndex<DataModel.TableInfoWithName<DataModel<IncludeSystemTables<DatabaseSchema.Tables<Schema$1>>>, TableName>, IndexName>, 0>) => convex_server0.IndexRange) | undefined, order?: "asc" | "desc"): OrderedQuery$1<TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
        name: typeof effect_Schema0.String;
        args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
        scheduledTime: typeof effect_Schema0.Number;
        completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
          exact: true;
        }>;
        state: effect_Schema0.Union<[effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["pending"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["inProgress"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["success"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["failed"]>;
          error: typeof effect_Schema0.String;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["canceled"]>;
        }>]>;
      }>, convex_values5.VObject<{
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
        name: convex_values5.VString<string, "required">;
        args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
        scheduledTime: convex_values5.VFloat64<number, "required">;
        state: convex_values5.VObject<{
          kind: "pending";
        }, {
          kind: convex_values5.VLiteral<"pending", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "inProgress";
        }, {
          kind: convex_values5.VLiteral<"inProgress", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "success";
        }, {
          kind: convex_values5.VLiteral<"success", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "failed";
          error: string;
        }, {
          kind: convex_values5.VLiteral<"failed", "required">;
          error: convex_values5.VString<string, "required">;
        }, "required", "kind" | "error"> | convex_values5.VObject<{
          kind: "canceled";
        }, {
          kind: convex_values5.VLiteral<"canceled", "required">;
        }, "required", "kind">;
        completedTime: convex_values5.VFloat64<number | undefined, "optional">;
      }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
        sha256: typeof effect_Schema0.String;
        size: typeof effect_Schema0.Number;
        contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
          exact: true;
        }>;
      }>, convex_values5.VObject<{
        sha256: string;
        size: number;
        contentType?: string | undefined;
      }, {
        sha256: convex_values5.VString<string, "required">;
        size: convex_values5.VFloat64<number, "required">;
        contentType: convex_values5.VString<string | undefined, "optional">;
      }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>, TableName>;
      <IndexName extends keyof (TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
        name: typeof effect_Schema0.String;
        args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
        scheduledTime: typeof effect_Schema0.Number;
        completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
          exact: true;
        }>;
        state: effect_Schema0.Union<[effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["pending"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["inProgress"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["success"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["failed"]>;
          error: typeof effect_Schema0.String;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["canceled"]>;
        }>]>;
      }>, convex_values5.VObject<{
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
        name: convex_values5.VString<string, "required">;
        args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
        scheduledTime: convex_values5.VFloat64<number, "required">;
        state: convex_values5.VObject<{
          kind: "pending";
        }, {
          kind: convex_values5.VLiteral<"pending", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "inProgress";
        }, {
          kind: convex_values5.VLiteral<"inProgress", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "success";
        }, {
          kind: convex_values5.VLiteral<"success", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "failed";
          error: string;
        }, {
          kind: convex_values5.VLiteral<"failed", "required">;
          error: convex_values5.VString<string, "required">;
        }, "required", "kind" | "error"> | convex_values5.VObject<{
          kind: "canceled";
        }, {
          kind: convex_values5.VLiteral<"canceled", "required">;
        }, "required", "kind">;
        completedTime: convex_values5.VFloat64<number | undefined, "optional">;
      }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
        sha256: typeof effect_Schema0.String;
        size: typeof effect_Schema0.Number;
        contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
          exact: true;
        }>;
      }>, convex_values5.VObject<{
        sha256: string;
        size: number;
        contentType?: string | undefined;
      }, {
        sha256: convex_values5.VString<string, "required">;
        size: convex_values5.VFloat64<number, "required">;
        contentType: convex_values5.VString<string | undefined, "optional">;
      }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>)["indexes"]>(indexName: IndexName, order?: "asc" | "desc"): OrderedQuery$1<TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
        name: typeof effect_Schema0.String;
        args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
        scheduledTime: typeof effect_Schema0.Number;
        completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
          exact: true;
        }>;
        state: effect_Schema0.Union<[effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["pending"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["inProgress"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["success"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["failed"]>;
          error: typeof effect_Schema0.String;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["canceled"]>;
        }>]>;
      }>, convex_values5.VObject<{
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
        name: convex_values5.VString<string, "required">;
        args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
        scheduledTime: convex_values5.VFloat64<number, "required">;
        state: convex_values5.VObject<{
          kind: "pending";
        }, {
          kind: convex_values5.VLiteral<"pending", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "inProgress";
        }, {
          kind: convex_values5.VLiteral<"inProgress", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "success";
        }, {
          kind: convex_values5.VLiteral<"success", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "failed";
          error: string;
        }, {
          kind: convex_values5.VLiteral<"failed", "required">;
          error: convex_values5.VString<string, "required">;
        }, "required", "kind" | "error"> | convex_values5.VObject<{
          kind: "canceled";
        }, {
          kind: convex_values5.VLiteral<"canceled", "required">;
        }, "required", "kind">;
        completedTime: convex_values5.VFloat64<number | undefined, "optional">;
      }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
        sha256: typeof effect_Schema0.String;
        size: typeof effect_Schema0.Number;
        contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
          exact: true;
        }>;
      }>, convex_values5.VObject<{
        sha256: string;
        size: number;
        contentType?: string | undefined;
      }, {
        sha256: convex_values5.VString<string, "required">;
        size: convex_values5.VFloat64<number, "required">;
        contentType: convex_values5.VString<string | undefined, "optional">;
      }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>, TableName>;
    };
    readonly search: <IndexName extends keyof (TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
      name: typeof effect_Schema0.String;
      args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
      scheduledTime: typeof effect_Schema0.Number;
      completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
        exact: true;
      }>;
      state: effect_Schema0.Union<[effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["pending"]>;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["inProgress"]>;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["success"]>;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["failed"]>;
        error: typeof effect_Schema0.String;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["canceled"]>;
      }>]>;
    }>, convex_values5.VObject<{
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
      name: convex_values5.VString<string, "required">;
      args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
      scheduledTime: convex_values5.VFloat64<number, "required">;
      state: convex_values5.VObject<{
        kind: "pending";
      }, {
        kind: convex_values5.VLiteral<"pending", "required">;
      }, "required", "kind"> | convex_values5.VObject<{
        kind: "inProgress";
      }, {
        kind: convex_values5.VLiteral<"inProgress", "required">;
      }, "required", "kind"> | convex_values5.VObject<{
        kind: "success";
      }, {
        kind: convex_values5.VLiteral<"success", "required">;
      }, "required", "kind"> | convex_values5.VObject<{
        kind: "failed";
        error: string;
      }, {
        kind: convex_values5.VLiteral<"failed", "required">;
        error: convex_values5.VString<string, "required">;
      }, "required", "kind" | "error"> | convex_values5.VObject<{
        kind: "canceled";
      }, {
        kind: convex_values5.VLiteral<"canceled", "required">;
      }, "required", "kind">;
      completedTime: convex_values5.VFloat64<number | undefined, "optional">;
    }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
      sha256: typeof effect_Schema0.String;
      size: typeof effect_Schema0.Number;
      contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
        exact: true;
      }>;
    }>, convex_values5.VObject<{
      sha256: string;
      size: number;
      contentType?: string | undefined;
    }, {
      sha256: convex_values5.VString<string, "required">;
      size: convex_values5.VFloat64<number, "required">;
      contentType: convex_values5.VString<string | undefined, "optional">;
    }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>)["searchIndexes"]>(indexName: IndexName, searchFilter: (q: convex_server0.SearchFilterBuilder<(TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
      name: typeof effect_Schema0.String;
      args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
      scheduledTime: typeof effect_Schema0.Number;
      completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
        exact: true;
      }>;
      state: effect_Schema0.Union<[effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["pending"]>;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["inProgress"]>;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["success"]>;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["failed"]>;
        error: typeof effect_Schema0.String;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["canceled"]>;
      }>]>;
    }>, convex_values5.VObject<{
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
      name: convex_values5.VString<string, "required">;
      args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
      scheduledTime: convex_values5.VFloat64<number, "required">;
      state: convex_values5.VObject<{
        kind: "pending";
      }, {
        kind: convex_values5.VLiteral<"pending", "required">;
      }, "required", "kind"> | convex_values5.VObject<{
        kind: "inProgress";
      }, {
        kind: convex_values5.VLiteral<"inProgress", "required">;
      }, "required", "kind"> | convex_values5.VObject<{
        kind: "success";
      }, {
        kind: convex_values5.VLiteral<"success", "required">;
      }, "required", "kind"> | convex_values5.VObject<{
        kind: "failed";
        error: string;
      }, {
        kind: convex_values5.VLiteral<"failed", "required">;
        error: convex_values5.VString<string, "required">;
      }, "required", "kind" | "error"> | convex_values5.VObject<{
        kind: "canceled";
      }, {
        kind: convex_values5.VLiteral<"canceled", "required">;
      }, "required", "kind">;
      completedTime: convex_values5.VFloat64<number | undefined, "optional">;
    }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
      sha256: typeof effect_Schema0.String;
      size: typeof effect_Schema0.Number;
      contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
        exact: true;
      }>;
    }>, convex_values5.VObject<{
      sha256: string;
      size: number;
      contentType?: string | undefined;
    }, {
      sha256: convex_values5.VString<string, "required">;
      size: convex_values5.VFloat64<number, "required">;
      contentType: convex_values5.VString<string | undefined, "optional">;
    }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>)["convexDocument"], convex_server0.NamedSearchIndex<DataModel.TableInfoWithName<DataModel<IncludeSystemTables<DatabaseSchema.Tables<Schema$1>>>, TableName>, IndexName>>) => convex_server0.SearchFilter) => OrderedQuery$1<TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
      name: typeof effect_Schema0.String;
      args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
      scheduledTime: typeof effect_Schema0.Number;
      completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
        exact: true;
      }>;
      state: effect_Schema0.Union<[effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["pending"]>;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["inProgress"]>;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["success"]>;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["failed"]>;
        error: typeof effect_Schema0.String;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["canceled"]>;
      }>]>;
    }>, convex_values5.VObject<{
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
      name: convex_values5.VString<string, "required">;
      args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
      scheduledTime: convex_values5.VFloat64<number, "required">;
      state: convex_values5.VObject<{
        kind: "pending";
      }, {
        kind: convex_values5.VLiteral<"pending", "required">;
      }, "required", "kind"> | convex_values5.VObject<{
        kind: "inProgress";
      }, {
        kind: convex_values5.VLiteral<"inProgress", "required">;
      }, "required", "kind"> | convex_values5.VObject<{
        kind: "success";
      }, {
        kind: convex_values5.VLiteral<"success", "required">;
      }, "required", "kind"> | convex_values5.VObject<{
        kind: "failed";
        error: string;
      }, {
        kind: convex_values5.VLiteral<"failed", "required">;
        error: convex_values5.VString<string, "required">;
      }, "required", "kind" | "error"> | convex_values5.VObject<{
        kind: "canceled";
      }, {
        kind: convex_values5.VLiteral<"canceled", "required">;
      }, "required", "kind">;
      completedTime: convex_values5.VFloat64<number | undefined, "optional">;
    }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
      sha256: typeof effect_Schema0.String;
      size: typeof effect_Schema0.Number;
      contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
        exact: true;
      }>;
    }>, convex_values5.VObject<{
      sha256: string;
      size: number;
      contentType?: string | undefined;
    }, {
      sha256: convex_values5.VString<string, "required">;
      size: convex_values5.VFloat64<number, "required">;
      contentType: convex_values5.VString<string | undefined, "optional">;
    }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>, TableName>;
  };
}>;
type DatabaseReader<Schema$1 extends DatabaseSchema.AnyWithProps> = ReturnType<typeof DatabaseReader<Schema$1>>["Identifier"];
declare const layer: <Schema$1 extends DatabaseSchema.AnyWithProps>(schema: Schema$1, convexDatabaseReader: GenericDatabaseReader<DataModel.ToConvex<DataModel.FromSchema<Schema$1>>>) => Layer.Layer<{
  table: <const TableName extends "_scheduled_functions" | "_storage" | Table.Name<DatabaseSchema.Tables<Schema$1>>>(tableName: TableName) => {
    readonly get: {
      (id: convex_values5.GenericId<TableName>): effect_Effect0.Effect<(TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
        name: typeof effect_Schema0.String;
        args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
        scheduledTime: typeof effect_Schema0.Number;
        completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
          exact: true;
        }>;
        state: effect_Schema0.Union<[effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["pending"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["inProgress"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["success"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["failed"]>;
          error: typeof effect_Schema0.String;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["canceled"]>;
        }>]>;
      }>, convex_values5.VObject<{
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
        name: convex_values5.VString<string, "required">;
        args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
        scheduledTime: convex_values5.VFloat64<number, "required">;
        state: convex_values5.VObject<{
          kind: "pending";
        }, {
          kind: convex_values5.VLiteral<"pending", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "inProgress";
        }, {
          kind: convex_values5.VLiteral<"inProgress", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "success";
        }, {
          kind: convex_values5.VLiteral<"success", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "failed";
          error: string;
        }, {
          kind: convex_values5.VLiteral<"failed", "required">;
          error: convex_values5.VString<string, "required">;
        }, "required", "kind" | "error"> | convex_values5.VObject<{
          kind: "canceled";
        }, {
          kind: convex_values5.VLiteral<"canceled", "required">;
        }, "required", "kind">;
        completedTime: convex_values5.VFloat64<number | undefined, "optional">;
      }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
        sha256: typeof effect_Schema0.String;
        size: typeof effect_Schema0.Number;
        contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
          exact: true;
        }>;
      }>, convex_values5.VObject<{
        sha256: string;
        size: number;
        contentType?: string | undefined;
      }, {
        sha256: convex_values5.VString<string, "required">;
        size: convex_values5.VFloat64<number, "required">;
        contentType: convex_values5.VString<string | undefined, "optional">;
      }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>)["document"], DocumentDecodeError | GetByIdFailure, never>;
      <IndexName extends keyof (TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
        name: typeof effect_Schema0.String;
        args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
        scheduledTime: typeof effect_Schema0.Number;
        completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
          exact: true;
        }>;
        state: effect_Schema0.Union<[effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["pending"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["inProgress"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["success"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["failed"]>;
          error: typeof effect_Schema0.String;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["canceled"]>;
        }>]>;
      }>, convex_values5.VObject<{
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
        name: convex_values5.VString<string, "required">;
        args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
        scheduledTime: convex_values5.VFloat64<number, "required">;
        state: convex_values5.VObject<{
          kind: "pending";
        }, {
          kind: convex_values5.VLiteral<"pending", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "inProgress";
        }, {
          kind: convex_values5.VLiteral<"inProgress", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "success";
        }, {
          kind: convex_values5.VLiteral<"success", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "failed";
          error: string;
        }, {
          kind: convex_values5.VLiteral<"failed", "required">;
          error: convex_values5.VString<string, "required">;
        }, "required", "kind" | "error"> | convex_values5.VObject<{
          kind: "canceled";
        }, {
          kind: convex_values5.VLiteral<"canceled", "required">;
        }, "required", "kind">;
        completedTime: convex_values5.VFloat64<number | undefined, "optional">;
      }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
        sha256: typeof effect_Schema0.String;
        size: typeof effect_Schema0.Number;
        contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
          exact: true;
        }>;
      }>, convex_values5.VObject<{
        sha256: string;
        size: number;
        contentType?: string | undefined;
      }, {
        sha256: convex_values5.VString<string, "required">;
        size: convex_values5.VFloat64<number, "required">;
        contentType: convex_values5.VString<string | undefined, "optional">;
      }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>)["indexes"]>(indexName: IndexName, ...indexFieldValues: IndexFieldTypesForEq<DataModel.ToConvex<DataModel<IncludeSystemTables<DatabaseSchema.Tables<Schema$1>>>>, TableName, (TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
        name: typeof effect_Schema0.String;
        args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
        scheduledTime: typeof effect_Schema0.Number;
        completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
          exact: true;
        }>;
        state: effect_Schema0.Union<[effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["pending"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["inProgress"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["success"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["failed"]>;
          error: typeof effect_Schema0.String;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["canceled"]>;
        }>]>;
      }>, convex_values5.VObject<{
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
        name: convex_values5.VString<string, "required">;
        args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
        scheduledTime: convex_values5.VFloat64<number, "required">;
        state: convex_values5.VObject<{
          kind: "pending";
        }, {
          kind: convex_values5.VLiteral<"pending", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "inProgress";
        }, {
          kind: convex_values5.VLiteral<"inProgress", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "success";
        }, {
          kind: convex_values5.VLiteral<"success", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "failed";
          error: string;
        }, {
          kind: convex_values5.VLiteral<"failed", "required">;
          error: convex_values5.VString<string, "required">;
        }, "required", "kind" | "error"> | convex_values5.VObject<{
          kind: "canceled";
        }, {
          kind: convex_values5.VLiteral<"canceled", "required">;
        }, "required", "kind">;
        completedTime: convex_values5.VFloat64<number | undefined, "optional">;
      }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
        sha256: typeof effect_Schema0.String;
        size: typeof effect_Schema0.Number;
        contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
          exact: true;
        }>;
      }>, convex_values5.VObject<{
        sha256: string;
        size: number;
        contentType?: string | undefined;
      }, {
        sha256: convex_values5.VString<string, "required">;
        size: convex_values5.VFloat64<number, "required">;
        contentType: convex_values5.VString<string | undefined, "optional">;
      }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>)["indexes"][IndexName]>): effect_Effect0.Effect<(TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
        name: typeof effect_Schema0.String;
        args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
        scheduledTime: typeof effect_Schema0.Number;
        completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
          exact: true;
        }>;
        state: effect_Schema0.Union<[effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["pending"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["inProgress"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["success"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["failed"]>;
          error: typeof effect_Schema0.String;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["canceled"]>;
        }>]>;
      }>, convex_values5.VObject<{
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
        name: convex_values5.VString<string, "required">;
        args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
        scheduledTime: convex_values5.VFloat64<number, "required">;
        state: convex_values5.VObject<{
          kind: "pending";
        }, {
          kind: convex_values5.VLiteral<"pending", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "inProgress";
        }, {
          kind: convex_values5.VLiteral<"inProgress", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "success";
        }, {
          kind: convex_values5.VLiteral<"success", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "failed";
          error: string;
        }, {
          kind: convex_values5.VLiteral<"failed", "required">;
          error: convex_values5.VString<string, "required">;
        }, "required", "kind" | "error"> | convex_values5.VObject<{
          kind: "canceled";
        }, {
          kind: convex_values5.VLiteral<"canceled", "required">;
        }, "required", "kind">;
        completedTime: convex_values5.VFloat64<number | undefined, "optional">;
      }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
        sha256: typeof effect_Schema0.String;
        size: typeof effect_Schema0.Number;
        contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
          exact: true;
        }>;
      }>, convex_values5.VObject<{
        sha256: string;
        size: number;
        contentType?: string | undefined;
      }, {
        sha256: convex_values5.VString<string, "required">;
        size: convex_values5.VFloat64<number, "required">;
        contentType: convex_values5.VString<string | undefined, "optional">;
      }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>)["document"], DocumentDecodeError | GetByIndexFailure, never>;
    };
    readonly index: {
      <IndexName extends keyof (TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
        name: typeof effect_Schema0.String;
        args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
        scheduledTime: typeof effect_Schema0.Number;
        completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
          exact: true;
        }>;
        state: effect_Schema0.Union<[effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["pending"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["inProgress"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["success"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["failed"]>;
          error: typeof effect_Schema0.String;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["canceled"]>;
        }>]>;
      }>, convex_values5.VObject<{
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
        name: convex_values5.VString<string, "required">;
        args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
        scheduledTime: convex_values5.VFloat64<number, "required">;
        state: convex_values5.VObject<{
          kind: "pending";
        }, {
          kind: convex_values5.VLiteral<"pending", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "inProgress";
        }, {
          kind: convex_values5.VLiteral<"inProgress", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "success";
        }, {
          kind: convex_values5.VLiteral<"success", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "failed";
          error: string;
        }, {
          kind: convex_values5.VLiteral<"failed", "required">;
          error: convex_values5.VString<string, "required">;
        }, "required", "kind" | "error"> | convex_values5.VObject<{
          kind: "canceled";
        }, {
          kind: convex_values5.VLiteral<"canceled", "required">;
        }, "required", "kind">;
        completedTime: convex_values5.VFloat64<number | undefined, "optional">;
      }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
        sha256: typeof effect_Schema0.String;
        size: typeof effect_Schema0.Number;
        contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
          exact: true;
        }>;
      }>, convex_values5.VObject<{
        sha256: string;
        size: number;
        contentType?: string | undefined;
      }, {
        sha256: convex_values5.VString<string, "required">;
        size: convex_values5.VFloat64<number, "required">;
        contentType: convex_values5.VString<string | undefined, "optional">;
      }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>)["indexes"]>(indexName: IndexName, indexRange?: ((q: convex_server0.IndexRangeBuilder<(TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
        name: typeof effect_Schema0.String;
        args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
        scheduledTime: typeof effect_Schema0.Number;
        completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
          exact: true;
        }>;
        state: effect_Schema0.Union<[effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["pending"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["inProgress"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["success"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["failed"]>;
          error: typeof effect_Schema0.String;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["canceled"]>;
        }>]>;
      }>, convex_values5.VObject<{
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
        name: convex_values5.VString<string, "required">;
        args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
        scheduledTime: convex_values5.VFloat64<number, "required">;
        state: convex_values5.VObject<{
          kind: "pending";
        }, {
          kind: convex_values5.VLiteral<"pending", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "inProgress";
        }, {
          kind: convex_values5.VLiteral<"inProgress", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "success";
        }, {
          kind: convex_values5.VLiteral<"success", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "failed";
          error: string;
        }, {
          kind: convex_values5.VLiteral<"failed", "required">;
          error: convex_values5.VString<string, "required">;
        }, "required", "kind" | "error"> | convex_values5.VObject<{
          kind: "canceled";
        }, {
          kind: convex_values5.VLiteral<"canceled", "required">;
        }, "required", "kind">;
        completedTime: convex_values5.VFloat64<number | undefined, "optional">;
      }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
        sha256: typeof effect_Schema0.String;
        size: typeof effect_Schema0.Number;
        contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
          exact: true;
        }>;
      }>, convex_values5.VObject<{
        sha256: string;
        size: number;
        contentType?: string | undefined;
      }, {
        sha256: convex_values5.VString<string, "required">;
        size: convex_values5.VFloat64<number, "required">;
        contentType: convex_values5.VString<string | undefined, "optional">;
      }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>)["convexDocument"], convex_server0.NamedIndex<DataModel.TableInfoWithName<DataModel<IncludeSystemTables<DatabaseSchema.Tables<Schema$1>>>, TableName>, IndexName>, 0>) => convex_server0.IndexRange) | undefined, order?: "asc" | "desc"): OrderedQuery$1<TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
        name: typeof effect_Schema0.String;
        args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
        scheduledTime: typeof effect_Schema0.Number;
        completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
          exact: true;
        }>;
        state: effect_Schema0.Union<[effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["pending"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["inProgress"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["success"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["failed"]>;
          error: typeof effect_Schema0.String;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["canceled"]>;
        }>]>;
      }>, convex_values5.VObject<{
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
        name: convex_values5.VString<string, "required">;
        args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
        scheduledTime: convex_values5.VFloat64<number, "required">;
        state: convex_values5.VObject<{
          kind: "pending";
        }, {
          kind: convex_values5.VLiteral<"pending", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "inProgress";
        }, {
          kind: convex_values5.VLiteral<"inProgress", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "success";
        }, {
          kind: convex_values5.VLiteral<"success", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "failed";
          error: string;
        }, {
          kind: convex_values5.VLiteral<"failed", "required">;
          error: convex_values5.VString<string, "required">;
        }, "required", "kind" | "error"> | convex_values5.VObject<{
          kind: "canceled";
        }, {
          kind: convex_values5.VLiteral<"canceled", "required">;
        }, "required", "kind">;
        completedTime: convex_values5.VFloat64<number | undefined, "optional">;
      }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
        sha256: typeof effect_Schema0.String;
        size: typeof effect_Schema0.Number;
        contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
          exact: true;
        }>;
      }>, convex_values5.VObject<{
        sha256: string;
        size: number;
        contentType?: string | undefined;
      }, {
        sha256: convex_values5.VString<string, "required">;
        size: convex_values5.VFloat64<number, "required">;
        contentType: convex_values5.VString<string | undefined, "optional">;
      }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>, TableName>;
      <IndexName extends keyof (TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
        name: typeof effect_Schema0.String;
        args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
        scheduledTime: typeof effect_Schema0.Number;
        completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
          exact: true;
        }>;
        state: effect_Schema0.Union<[effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["pending"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["inProgress"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["success"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["failed"]>;
          error: typeof effect_Schema0.String;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["canceled"]>;
        }>]>;
      }>, convex_values5.VObject<{
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
        name: convex_values5.VString<string, "required">;
        args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
        scheduledTime: convex_values5.VFloat64<number, "required">;
        state: convex_values5.VObject<{
          kind: "pending";
        }, {
          kind: convex_values5.VLiteral<"pending", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "inProgress";
        }, {
          kind: convex_values5.VLiteral<"inProgress", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "success";
        }, {
          kind: convex_values5.VLiteral<"success", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "failed";
          error: string;
        }, {
          kind: convex_values5.VLiteral<"failed", "required">;
          error: convex_values5.VString<string, "required">;
        }, "required", "kind" | "error"> | convex_values5.VObject<{
          kind: "canceled";
        }, {
          kind: convex_values5.VLiteral<"canceled", "required">;
        }, "required", "kind">;
        completedTime: convex_values5.VFloat64<number | undefined, "optional">;
      }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
        sha256: typeof effect_Schema0.String;
        size: typeof effect_Schema0.Number;
        contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
          exact: true;
        }>;
      }>, convex_values5.VObject<{
        sha256: string;
        size: number;
        contentType?: string | undefined;
      }, {
        sha256: convex_values5.VString<string, "required">;
        size: convex_values5.VFloat64<number, "required">;
        contentType: convex_values5.VString<string | undefined, "optional">;
      }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>)["indexes"]>(indexName: IndexName, order?: "asc" | "desc"): OrderedQuery$1<TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
        name: typeof effect_Schema0.String;
        args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
        scheduledTime: typeof effect_Schema0.Number;
        completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
          exact: true;
        }>;
        state: effect_Schema0.Union<[effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["pending"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["inProgress"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["success"]>;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["failed"]>;
          error: typeof effect_Schema0.String;
        }>, effect_Schema0.Struct<{
          kind: effect_Schema0.Literal<["canceled"]>;
        }>]>;
      }>, convex_values5.VObject<{
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
        name: convex_values5.VString<string, "required">;
        args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
        scheduledTime: convex_values5.VFloat64<number, "required">;
        state: convex_values5.VObject<{
          kind: "pending";
        }, {
          kind: convex_values5.VLiteral<"pending", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "inProgress";
        }, {
          kind: convex_values5.VLiteral<"inProgress", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "success";
        }, {
          kind: convex_values5.VLiteral<"success", "required">;
        }, "required", "kind"> | convex_values5.VObject<{
          kind: "failed";
          error: string;
        }, {
          kind: convex_values5.VLiteral<"failed", "required">;
          error: convex_values5.VString<string, "required">;
        }, "required", "kind" | "error"> | convex_values5.VObject<{
          kind: "canceled";
        }, {
          kind: convex_values5.VLiteral<"canceled", "required">;
        }, "required", "kind">;
        completedTime: convex_values5.VFloat64<number | undefined, "optional">;
      }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
        sha256: typeof effect_Schema0.String;
        size: typeof effect_Schema0.Number;
        contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
          exact: true;
        }>;
      }>, convex_values5.VObject<{
        sha256: string;
        size: number;
        contentType?: string | undefined;
      }, {
        sha256: convex_values5.VString<string, "required">;
        size: convex_values5.VFloat64<number, "required">;
        contentType: convex_values5.VString<string | undefined, "optional">;
      }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>, TableName>;
    };
    readonly search: <IndexName extends keyof (TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
      name: typeof effect_Schema0.String;
      args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
      scheduledTime: typeof effect_Schema0.Number;
      completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
        exact: true;
      }>;
      state: effect_Schema0.Union<[effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["pending"]>;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["inProgress"]>;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["success"]>;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["failed"]>;
        error: typeof effect_Schema0.String;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["canceled"]>;
      }>]>;
    }>, convex_values5.VObject<{
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
      name: convex_values5.VString<string, "required">;
      args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
      scheduledTime: convex_values5.VFloat64<number, "required">;
      state: convex_values5.VObject<{
        kind: "pending";
      }, {
        kind: convex_values5.VLiteral<"pending", "required">;
      }, "required", "kind"> | convex_values5.VObject<{
        kind: "inProgress";
      }, {
        kind: convex_values5.VLiteral<"inProgress", "required">;
      }, "required", "kind"> | convex_values5.VObject<{
        kind: "success";
      }, {
        kind: convex_values5.VLiteral<"success", "required">;
      }, "required", "kind"> | convex_values5.VObject<{
        kind: "failed";
        error: string;
      }, {
        kind: convex_values5.VLiteral<"failed", "required">;
        error: convex_values5.VString<string, "required">;
      }, "required", "kind" | "error"> | convex_values5.VObject<{
        kind: "canceled";
      }, {
        kind: convex_values5.VLiteral<"canceled", "required">;
      }, "required", "kind">;
      completedTime: convex_values5.VFloat64<number | undefined, "optional">;
    }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
      sha256: typeof effect_Schema0.String;
      size: typeof effect_Schema0.Number;
      contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
        exact: true;
      }>;
    }>, convex_values5.VObject<{
      sha256: string;
      size: number;
      contentType?: string | undefined;
    }, {
      sha256: convex_values5.VString<string, "required">;
      size: convex_values5.VFloat64<number, "required">;
      contentType: convex_values5.VString<string | undefined, "optional">;
    }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>)["searchIndexes"]>(indexName: IndexName, searchFilter: (q: convex_server0.SearchFilterBuilder<(TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
      name: typeof effect_Schema0.String;
      args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
      scheduledTime: typeof effect_Schema0.Number;
      completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
        exact: true;
      }>;
      state: effect_Schema0.Union<[effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["pending"]>;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["inProgress"]>;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["success"]>;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["failed"]>;
        error: typeof effect_Schema0.String;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["canceled"]>;
      }>]>;
    }>, convex_values5.VObject<{
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
      name: convex_values5.VString<string, "required">;
      args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
      scheduledTime: convex_values5.VFloat64<number, "required">;
      state: convex_values5.VObject<{
        kind: "pending";
      }, {
        kind: convex_values5.VLiteral<"pending", "required">;
      }, "required", "kind"> | convex_values5.VObject<{
        kind: "inProgress";
      }, {
        kind: convex_values5.VLiteral<"inProgress", "required">;
      }, "required", "kind"> | convex_values5.VObject<{
        kind: "success";
      }, {
        kind: convex_values5.VLiteral<"success", "required">;
      }, "required", "kind"> | convex_values5.VObject<{
        kind: "failed";
        error: string;
      }, {
        kind: convex_values5.VLiteral<"failed", "required">;
        error: convex_values5.VString<string, "required">;
      }, "required", "kind" | "error"> | convex_values5.VObject<{
        kind: "canceled";
      }, {
        kind: convex_values5.VLiteral<"canceled", "required">;
      }, "required", "kind">;
      completedTime: convex_values5.VFloat64<number | undefined, "optional">;
    }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
      sha256: typeof effect_Schema0.String;
      size: typeof effect_Schema0.Number;
      contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
        exact: true;
      }>;
    }>, convex_values5.VObject<{
      sha256: string;
      size: number;
      contentType?: string | undefined;
    }, {
      sha256: convex_values5.VString<string, "required">;
      size: convex_values5.VFloat64<number, "required">;
      contentType: convex_values5.VString<string | undefined, "optional">;
    }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>)["convexDocument"], convex_server0.NamedSearchIndex<DataModel.TableInfoWithName<DataModel<IncludeSystemTables<DatabaseSchema.Tables<Schema$1>>>, TableName>, IndexName>>) => convex_server0.SearchFilter) => OrderedQuery$1<TableInfo<Table.WithName<Table<"_scheduled_functions", effect_Schema0.Struct<{
      name: typeof effect_Schema0.String;
      args: effect_Schema0.Array$<typeof effect_Schema0.Any>;
      scheduledTime: typeof effect_Schema0.Number;
      completedTime: effect_Schema0.optionalWith<typeof effect_Schema0.Number, {
        exact: true;
      }>;
      state: effect_Schema0.Union<[effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["pending"]>;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["inProgress"]>;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["success"]>;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["failed"]>;
        error: typeof effect_Schema0.String;
      }>, effect_Schema0.Struct<{
        kind: effect_Schema0.Literal<["canceled"]>;
      }>]>;
    }>, convex_values5.VObject<{
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
      name: convex_values5.VString<string, "required">;
      args: convex_values5.VArray<any[], convex_values5.VAny<any, "required", string>, "required">;
      scheduledTime: convex_values5.VFloat64<number, "required">;
      state: convex_values5.VObject<{
        kind: "pending";
      }, {
        kind: convex_values5.VLiteral<"pending", "required">;
      }, "required", "kind"> | convex_values5.VObject<{
        kind: "inProgress";
      }, {
        kind: convex_values5.VLiteral<"inProgress", "required">;
      }, "required", "kind"> | convex_values5.VObject<{
        kind: "success";
      }, {
        kind: convex_values5.VLiteral<"success", "required">;
      }, "required", "kind"> | convex_values5.VObject<{
        kind: "failed";
        error: string;
      }, {
        kind: convex_values5.VLiteral<"failed", "required">;
        error: convex_values5.VString<string, "required">;
      }, "required", "kind" | "error"> | convex_values5.VObject<{
        kind: "canceled";
      }, {
        kind: convex_values5.VLiteral<"canceled", "required">;
      }, "required", "kind">;
      completedTime: convex_values5.VFloat64<number | undefined, "optional">;
    }, "required", "name" | "args" | "scheduledTime" | "completedTime" | "state" | "state.kind" | "state.error">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<Table<"_storage", effect_Schema0.Struct<{
      sha256: typeof effect_Schema0.String;
      size: typeof effect_Schema0.Number;
      contentType: effect_Schema0.optionalWith<typeof effect_Schema0.String, {
        exact: true;
      }>;
    }>, convex_values5.VObject<{
      sha256: string;
      size: number;
      contentType?: string | undefined;
    }, {
      sha256: convex_values5.VString<string, "required">;
      size: convex_values5.VFloat64<number, "required">;
      contentType: convex_values5.VString<string | undefined, "optional">;
    }, "required", "sha256" | "size" | "contentType">, {}, {}, {}>, TableName>> | TableInfo<Table.WithName<DatabaseSchema.Tables<Schema$1>, TableName>>, TableName>;
  };
}, never, never>;
//#endregion
export { DatabaseReader, DatabaseReader_d_exports, layer, make };
//# sourceMappingURL=DatabaseReader.d.ts.map