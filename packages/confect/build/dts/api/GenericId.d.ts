import { Option, Schema, SchemaAST } from "effect";
import { GenericId as GenericId$1 } from "convex/values";

//#region src/api/GenericId.d.ts
declare namespace GenericId_d_exports {
  export { GenericId, tableName };
}
declare const GenericId: <TableName extends string>(tableName: TableName) => Schema.Schema<GenericId$1<TableName>>;
type GenericId<TableName extends string> = GenericId$1<TableName>;
declare const tableName: <TableName extends string>(ast: SchemaAST.AST) => Option.Option<TableName>;
//#endregion
export { GenericId, GenericId_d_exports, tableName };
//# sourceMappingURL=GenericId.d.ts.map