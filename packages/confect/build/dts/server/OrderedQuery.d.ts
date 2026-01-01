import { DocumentDecodeError } from "./Document.js";
import { TableInfo } from "./TableInfo.js";
import { Effect, Option, Stream } from "effect";
import { OrderedQuery as OrderedQuery$1, PaginationResult } from "convex/server";

//#region src/server/OrderedQuery.d.ts
declare namespace OrderedQuery_d_exports {
  export { OrderedQuery, make };
}
type OrderedQuery<TableInfo_ extends TableInfo.AnyWithProps, _TableName extends string> = {
  readonly first: () => Effect.Effect<Option.Option<TableInfo_["document"]>, DocumentDecodeError>;
  readonly take: (n: number) => Effect.Effect<ReadonlyArray<TableInfo_["document"]>, DocumentDecodeError>;
  readonly collect: () => Effect.Effect<ReadonlyArray<TableInfo_["document"]>, DocumentDecodeError>;
  readonly stream: () => Stream.Stream<TableInfo_["document"], DocumentDecodeError>;
  readonly paginate: (options: {
    cursor: string | null;
    numItems: number;
  }) => Effect.Effect<PaginationResult<TableInfo_["document"]>, DocumentDecodeError>;
};
declare const make: <TableInfo_ extends TableInfo.AnyWithProps, TableName extends string>(query: OrderedQuery$1<TableInfo.TableInfo<TableInfo_>>, tableName: TableName, tableSchema: TableInfo.TableSchema<TableInfo_>) => OrderedQuery<TableInfo_, TableName>;
//#endregion
export { OrderedQuery, OrderedQuery_d_exports, make };
//# sourceMappingURL=OrderedQuery.d.ts.map